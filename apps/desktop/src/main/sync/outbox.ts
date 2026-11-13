/**
 * The local queue of changes to push (sync_outbox, filled by the triggers of
 * migration 26). One row per changed record; a newer change to the same
 * record replaces the row (and its rowid), so removing pushed entries by rowid
 * never drops a change made while the push was in flight.
 */
import type Database from 'better-sqlite3';
import { SYNC_TABLE_NAMES, type SyncTableName } from './tables';

export const MAX_ATTEMPTS = 5;

export interface OutboxEntry {
    rowid: number;
    table_name: string;
    row_id: string;
    user_id: string;
    op: 'upsert' | 'delete';
    changed_at: string;
    attempts: number;
}

const RANK_SQL = `CASE table_name ${SYNC_TABLE_NAMES.map((n, i) => `WHEN '${n}' THEN ${i}`).join(' ')} ELSE 99 END`;

/** Next entries for a user: deletes first, then upserts parents-first. */
export function readOutbox(db: Database.Database, userId: string, limit: number): OutboxEntry[] {
    return db.prepare(`
        SELECT rowid, table_name, row_id, user_id, op, changed_at, attempts
          FROM sync_outbox
         WHERE user_id = ? AND attempts < ${MAX_ATTEMPTS}
         ORDER BY CASE op WHEN 'delete' THEN 0 ELSE 1 END, ${RANK_SQL}, rowid
         LIMIT ?
    `).all(userId, limit) as OutboxEntry[];
}

export function removeEntries(db: Database.Database, rowids: number[]): void {
    const del = db.prepare('DELETE FROM sync_outbox WHERE rowid = ?');
    db.transaction(() => { for (const id of rowids) del.run(id); })();
}

/** Records a failed entry; permanent failures stop retrying (attempts = MAX). */
export function markFailed(db: Database.Database, rowid: number, error: string, permanent: boolean): void {
    db.prepare(`
        UPDATE sync_outbox
           SET attempts = CASE WHEN ? THEN ${MAX_ATTEMPTS} ELSE attempts + 1 END,
               last_error = ?
         WHERE rowid = ?
    `).run(permanent ? 1 : 0, error.slice(0, 500), rowid);
}

export function countOutbox(db: Database.Database, userId: string): { pending: number; failed: number; lastError: string | null } {
    const r = db.prepare(`
        SELECT SUM(attempts < ${MAX_ATTEMPTS}) AS pending, SUM(attempts >= ${MAX_ATTEMPTS}) AS failed,
               (SELECT last_error FROM sync_outbox WHERE user_id = ? AND attempts >= ${MAX_ATTEMPTS} AND last_error IS NOT NULL LIMIT 1) AS last_error
          FROM sync_outbox WHERE user_id = ?
    `).get(userId, userId) as { pending: number | null; failed: number | null; last_error: string | null };
    return { pending: r.pending ?? 0, failed: r.failed ?? 0, lastError: r.last_error };
}

/** For each synced table: one user's rows as (t = table, k = outbox key, u = user, c = change time). */
const ALL_ROWS: Record<SyncTableName, string> = {
    note_types: `SELECT 'note_types' AS t, id AS k, user_id AS u, updated_at AS c FROM note_types WHERE user_id = ?`,
    decks: `SELECT 'decks' AS t, id AS k, user_id AS u, updated_at AS c FROM decks WHERE user_id = ?`,
    notes: `SELECT 'notes' AS t, id AS k, user_id AS u, updated_at AS c FROM notes WHERE user_id = ?`,
    cards: `SELECT 'cards' AS t, id AS k, user_id AS u, updated_at AS c FROM cards WHERE user_id = ?`,
    deck_sessions: `SELECT 'deck_sessions' AS t, id AS k, user_id AS u, COALESCE(updated_at, created_at) AS c FROM deck_sessions WHERE user_id = ?`,
    reviews: `SELECT 'reviews' AS t, id AS k, user_id AS u, created_at AS c FROM reviews WHERE user_id = ?`,
    card_drafts: `SELECT 'card_drafts' AS t, id AS k, user_id AS u, COALESCE(updated_at, created_at) AS c FROM card_drafts WHERE user_id = ?`,
    media: `SELECT 'media' AS t, id AS k, user_id AS u, created_at AS c FROM media WHERE user_id = ?`,
    plans: `SELECT 'plans' AS t, id AS k, user_id AS u, updated_at AS c FROM plans WHERE user_id = ?`,
    user_exam_profiles: `SELECT 'user_exam_profiles' AS t, user_id || ':' || exam_id AS k, user_id AS u, updated_at AS c FROM user_exam_profiles WHERE user_id = ?`,
    card_classifications: `SELECT 'card_classifications' AS t, card_id || ':' || exam_id AS k, user_id AS u, MAX(classified_at) AS c
                             FROM card_classifications WHERE user_id = ? GROUP BY card_id, exam_id`,
    time_travel_log: `SELECT 'time_travel_log' AS t, sync_id AS k, user_id AS u, triggered_at AS c FROM time_travel_log WHERE user_id = ? AND sync_id IS NOT NULL`,
};

const NOW_SQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
/**
 * Queues every row a user owns.
 *   'own-time'  first sync on this device: each row keeps its own timestamp as
 *               its change time, so anything newer already on the server wins
 *               (INSERT OR IGNORE keeps pending real edits as they are).
 *   'now'       after restoring a backup: everything is stamped now, so the
 *               restored copy replaces the cloud's.
 * Returns how many entries were added.
 */
export function enqueueAll(db: Database.Database, userId: string, mode: 'own-time' | 'now'): number {
    let added = 0;
    db.transaction(() => {
        for (const t of SYNC_TABLE_NAMES) {
            const sql = mode === 'own-time'
                ? `INSERT OR IGNORE INTO sync_outbox (table_name, row_id, user_id, op, changed_at)
                   SELECT t, k, u, 'upsert', COALESCE(c, ${NOW_SQL}) FROM (${ALL_ROWS[t]})`
                : `INSERT OR REPLACE INTO sync_outbox (table_name, row_id, user_id, op, changed_at)
                   SELECT t, k, u, 'upsert', ${NOW_SQL} FROM (${ALL_ROWS[t]})`;
            added += db.prepare(sql).run(userId).changes;
        }
    })();
    return added;
}
