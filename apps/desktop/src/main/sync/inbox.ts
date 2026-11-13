/**
 * Pulled server rows wait in sync_inbox until they're written into the real
 * tables. Staging decouples paging from applying:
 *   • a page and the new cursor are stored in one transaction, so a crash
 *     never loses rows or re-requests them out of order;
 *   • applying runs in (deleted, ord, seq) order — upserts parents-first,
 *     tombstones children-first — in chunks, so a big first download doesn't
 *     freeze the main process, and a child whose parent is on a later page
 *     still lands after it.
 */
import type Database from 'better-sqlite3';
import { applyRemoteRow, outboxKeyFor, UnknownReferenceError } from './codec';
import { setPullCursor, withApplying } from './meta';
import { MAX_ATTEMPTS } from './outbox';
import { tableRank } from './tables';
import type { PullChange } from './types';

const CHUNK = 500;

export function storePage(db: Database.Database, userId: string, changes: PullChange[], next: number): number {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO sync_inbox (user_id, seq, table_name, row, deleted, ord)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    let stored = 0;
    db.transaction(() => {
        for (const c of changes) {
            if (!c.row) continue; // this device's own write
            let rank: number;
            try {
                rank = tableRank(c.t);
            } catch {
                continue; // a table from a newer app version
            }
            const deleted = c.row.deleted_at != null;
            insert.run(userId, c.seq, c.t, JSON.stringify(c.row), deleted ? 1 : 0, deleted ? -rank : rank);
            stored++;
        }
        setPullCursor(db, userId, next);
    })();
    return stored;
}

export function inboxSize(db: Database.Database, userId: string): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM sync_inbox WHERE user_id = ? AND attempts < ${MAX_ATTEMPTS}`).get(userId) as { n: number }).n;
}

export interface ApplyResult {
    applied: number;
    /** Not applied because a local edit to the same record is waiting to be pushed. */
    deferred: number;
    failed: number;
    tables: Set<string>;
}

interface InboxRow { seq: number; table_name: string; row: string; deleted: number; ord: number }

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * A pulled row is skipped when a local edit to the same record is still in
 * the outbox: the edit gets pushed, and if it loses, the server re-sends the
 * winner (sync_push_v1 re-stamps losing rows), so nothing is lost either way.
 */
export async function applyInbox(
    db: Database.Database,
    userId: string,
    mediaDir: string,
    onProgress?: (applied: number) => void,
): Promise<ApplyResult> {
    const result: ApplyResult = { applied: 0, deferred: 0, failed: 0, tables: new Set() };
    const select = db.prepare(`
        SELECT seq, table_name, row, deleted, ord FROM sync_inbox
         WHERE user_id = ? AND attempts < ${MAX_ATTEMPTS} AND (deleted, ord, seq) > (?, ?, ?)
         ORDER BY deleted, ord, seq
         LIMIT ${CHUNK}
    `);
    const remove = db.prepare('DELETE FROM sync_inbox WHERE user_id = ? AND seq = ?');
    const fail = db.prepare(`UPDATE sync_inbox SET attempts = attempts + ?, last_error = ? WHERE user_id = ? AND seq = ?`);
    const pendingLocal = db.prepare(`SELECT 1 FROM sync_outbox WHERE table_name = ? AND row_id = ? AND attempts < ${MAX_ATTEMPTS}`);

    let cursor: [number, number, number] = [-1, Number.MIN_SAFE_INTEGER, -1];
    for (;;) {
        const chunk = select.all(userId, ...cursor) as InboxRow[];
        if (chunk.length === 0) break;
        const last = chunk[chunk.length - 1];
        cursor = [last.deleted, last.ord, last.seq];

        withApplying(db, () => {
            // A few passes: a row whose parent is later in the same chunk
            // (e.g. a sub-deck before its parent deck) succeeds on a retry.
            let todo = chunk;
            let errors = new Map<number, unknown>();
            for (let pass = 0; pass < 3 && todo.length > 0; pass++) {
                const retry: InboxRow[] = [];
                errors = new Map();
                for (const item of todo) {
                    const row = JSON.parse(item.row) as Record<string, unknown>;
                    try {
                        if (pendingLocal.get(item.table_name, outboxKeyFor(db, item.table_name, row, userId))) {
                            remove.run(userId, item.seq);
                            result.deferred++;
                            continue;
                        }
                        applyRemoteRow(db, item.table_name, row, userId, mediaDir);
                        remove.run(userId, item.seq);
                        result.applied++;
                        result.tables.add(item.table_name);
                    } catch (err) {
                        retry.push(item);
                        errors.set(item.seq, err);
                    }
                }
                if (retry.length === todo.length) break; // no progress
                todo = retry;
            }
            for (const item of todo) {
                const err = errors.get(item.seq);
                // A missing exam/system may arrive with an app update: keep retrying.
                const counts = err instanceof UnknownReferenceError ? 0 : 1;
                fail.run(counts, err instanceof Error ? err.message.slice(0, 500) : String(err), userId, item.seq);
                result.failed++;
            }
        });
        onProgress?.(result.applied);
        await yieldToEventLoop();
    }
    return result;
}
