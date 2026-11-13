/**
 * Converts rows between local SQLite and the server tables (main/sync/tables.ts).
 *
 * Local quirks handled here:
 *   • JSON is stored as TEXT locally and as jsonb on the server.
 *   • Booleans are 0/1 locally.
 *   • Blueprint references are install-specific INTEGER rowids locally;
 *     the server uses the stable exam_key / system_key / topic_key.
 *   • media.file_path is an absolute local path; the server keeps a
 *     storage path, "{user}/{sha1}{ext}" in the sekel-media bucket.
 *   • time_travel_log's local key is sync_id (its PK is an INTEGER).
 */
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getSyncTable, type SyncColumn, type SyncTableName } from './tables';

/** A pulled row references something this install doesn't have (e.g. an exam added in a newer app version). */
export class UnknownReferenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnknownReferenceError';
    }
}

// ── Values ──────────────────────────────────────────────────────────────────

function isoOrRaw(v: unknown): string {
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? String(v) : new Date(t).toISOString();
}

export function toRemote(col: SyncColumn, v: unknown): unknown {
    if (v === null || v === undefined) return null;
    switch (col.type) {
        case 'json':
            if (typeof v !== 'string') return v;
            try {
                return JSON.parse(v);
            } catch {
                return { __raw: v }; // not JSON locally; round-trips via toLocal
            }
        case 'bool':
            return v === 1 || v === true || v === '1';
        case 'ts':
            return isoOrRaw(v);
        case 'int':
        case 'bigint':
            return Math.round(Number(v));
        case 'real':
            return Number(v);
        default:
            return String(v);
    }
}

export function toLocal(col: SyncColumn, v: unknown): unknown {
    if (v === null || v === undefined) return null;
    switch (col.type) {
        case 'json':
            if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 1 && '__raw' in (v as object)) {
                return String((v as { __raw: unknown }).__raw);
            }
            return JSON.stringify(v);
        case 'bool':
            return v ? 1 : 0;
        case 'ts':
            return isoOrRaw(v);
        default:
            return v;
    }
}

/** A change time as the server expects it, shifted by the measured clock offset. */
export function remoteChangedAt(localIso: string, clockOffsetMs = 0): string {
    const t = Date.parse(localIso);
    const base = Number.isNaN(t) ? Date.now() : t;
    return new Date(base + clockOffsetMs).toISOString();
}

// ── Blueprint keys ──────────────────────────────────────────────────────────

function examKey(db: Database.Database, examId: number): string | null {
    const r = db.prepare('SELECT exam_key FROM blueprint_exams WHERE id = ?').get(examId) as { exam_key: string } | undefined;
    return r?.exam_key ?? null;
}

function examIdFor(db: Database.Database, key: string): number {
    const r = db.prepare('SELECT id FROM blueprint_exams WHERE exam_key = ?').get(key) as { id: number } | undefined;
    if (!r) throw new UnknownReferenceError(`exam ${key} is not on this install`);
    return r.id;
}

function systemIdFor(db: Database.Database, examId: number, key: string): number {
    const r = db.prepare('SELECT id FROM blueprint_systems WHERE exam_id = ? AND system_key = ?').get(examId, key) as { id: number } | undefined;
    if (!r) throw new UnknownReferenceError(`system ${key} is not on this install`);
    return r.id;
}

function topicIdFor(db: Database.Database, systemId: number, key: string): number | null {
    const r = db.prepare('SELECT id FROM blueprint_topics WHERE system_id = ? AND topic_key = ?').get(systemId, key) as { id: number } | undefined;
    return r?.id ?? null; // a topic this install lacks just isn't recorded
}

// ── Media ───────────────────────────────────────────────────────────────────

export function mediaStoragePath(userId: string, local: Record<string, unknown>): string {
    const ext = path.extname(String(local.file_path || local.filename || ''));
    return `${userId}/${String(local.file_hash)}${ext}`;
}

export function localMediaPath(mediaDir: string, storagePath: string): string {
    return path.join(mediaDir, path.basename(storagePath));
}

// ── Local → server ──────────────────────────────────────────────────────────

/** What one outbox entry contributes to a push. Null: nothing to send (drop the entry). */
export type PushPart =
    | { kind: 'upsert'; table: SyncTableName; value: Record<string, unknown> }
    | { kind: 'delete'; table: SyncTableName; value: Record<string, unknown> }
    | null;

/** Splits "{a}:{b}" keys (user id / card id are UUIDs, so ':' never occurs inside them). */
function splitKey(rowId: string): [string, number] {
    const i = rowId.lastIndexOf(':');
    return [rowId.slice(0, i), Number(rowId.slice(i + 1))];
}

export function serializeEntry(
    db: Database.Database,
    entry: { table_name: string; row_id: string; op: string; changed_at: string },
    userId: string,
    clockOffsetMs = 0,
): PushPart {
    const table = entry.table_name as SyncTableName;
    const at = remoteChangedAt(entry.changed_at, clockOffsetMs);

    if (table === 'user_exam_profiles') {
        const [owner, examId] = splitKey(entry.row_id);
        const key = examKey(db, examId);
        if (!key) return null;
        const row = db.prepare('SELECT * FROM user_exam_profiles WHERE user_id = ? AND exam_id = ?').get(owner, examId) as Record<string, unknown> | undefined;
        if (!row || entry.op === 'delete') return { kind: 'delete', table, value: { exam_key: key, at } };
        const value: Record<string, unknown> = { client_changed_at: at };
        for (const c of getSyncTable(table).columns) {
            if (c.name === 'id') continue;
            value[c.name] = c.name === 'exam_key' ? key : toRemote(c, row[c.name]);
        }
        return { kind: 'upsert', table, value };
    }

    if (table === 'card_classifications') {
        const [cardId, examId] = splitKey(entry.row_id);
        const key = examKey(db, examId);
        if (!key) return null;
        const rows = db.prepare(`
            SELECT cc.confidence, cc.split_weight, cc.classified_at, cc.model_version,
                   s.system_key, t.topic_key
              FROM card_classifications cc
              LEFT JOIN blueprint_systems s ON s.id = cc.system_id
              LEFT JOIN blueprint_topics t ON t.id = cc.topic_id
             WHERE cc.card_id = ? AND cc.exam_id = ?
        `).all(cardId, examId) as Array<Record<string, unknown>>;
        const seen = new Set<string>();
        const set = [];
        for (const r of rows) {
            const sk = (r.system_key as string | null) ?? '';
            if (seen.has(sk)) continue; // the server keys rows by (card, exam, system)
            seen.add(sk);
            set.push({
                system_key: r.system_key ?? null,
                topic_key: r.topic_key ?? null,
                confidence: r.confidence == null ? null : Number(r.confidence),
                split_weight: Number(r.split_weight ?? 1),
                classified_at: isoOrRaw(r.classified_at),
                model_version: r.model_version ?? null,
            });
        }
        // Always an upsert of the whole set; an empty set clears the card for that exam.
        return { kind: 'upsert', table, value: { card_id: cardId, exam_key: key, at, rows: set } };
    }

    const row = table === 'time_travel_log'
        ? db.prepare('SELECT * FROM time_travel_log WHERE sync_id = ?').get(entry.row_id) as Record<string, unknown> | undefined
        : db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(entry.row_id) as Record<string, unknown> | undefined;
    if (!row || entry.op === 'delete') return { kind: 'delete', table, value: { id: entry.row_id, at } };

    const value: Record<string, unknown> = { client_changed_at: at };
    for (const c of getSyncTable(table).columns) {
        if (table === 'time_travel_log' && c.name === 'id') value.id = row.sync_id;
        else if (table === 'media' && c.name === 'storage_path') value.storage_path = mediaStoragePath(userId, row);
        else value[c.name] = toRemote(c, row[c.name]);
    }
    return { kind: 'upsert', table, value };
}

// ── Server → local ──────────────────────────────────────────────────────────

/** The outbox key a pulled row corresponds to (to detect a pending local edit). */
export function outboxKeyFor(db: Database.Database, table: string, row: Record<string, unknown>, userId: string): string {
    if (table === 'user_exam_profiles') return `${userId}:${examIdFor(db, String(row.exam_key))}`;
    if (table === 'card_classifications') return `${String(row.card_id)}:${examIdFor(db, String(row.exam_key))}`;
    return String(row.id);
}

function upsertLocal(db: Database.Database, table: string, values: Record<string, unknown>, conflict: string[]): void {
    const cols = Object.keys(values);
    const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
    db.prepare(`
        INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
        ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.join(', ')}
    `).run(...cols.map((c) => values[c]));
}

/**
 * Writes one pulled server row into SQLite (the caller wraps this in
 * withApplying so it isn't queued for push). Tombstones become deletes,
 * which cascade locally the same way a delete made on this device would.
 */
export function applyRemoteRow(db: Database.Database, table: string, row: Record<string, unknown>, userId: string, mediaDir: string): void {
    const deleted = row.deleted_at != null;
    const spec = getSyncTable(table);

    if (table === 'user_exam_profiles') {
        const examId = examIdFor(db, String(row.exam_key));
        if (deleted) {
            db.prepare('DELETE FROM user_exam_profiles WHERE user_id = ? AND exam_id = ?').run(userId, examId);
            return;
        }
        const values: Record<string, unknown> = { user_id: userId, exam_id: examId };
        for (const c of spec.columns) {
            if (c.name === 'id' || c.name === 'exam_key') continue;
            values[c.name] = toLocal(c, row[c.name]);
        }
        upsertLocal(db, table, values, ['user_id', 'exam_id']);
        return;
    }

    if (table === 'card_classifications') {
        const examId = examIdFor(db, String(row.exam_key));
        const systemId = row.system_key == null ? null : systemIdFor(db, examId, String(row.system_key));
        const topicId = systemId != null && row.topic_key != null ? topicIdFor(db, systemId, String(row.topic_key)) : null;
        db.prepare('DELETE FROM card_classifications WHERE card_id = ? AND exam_id = ? AND system_id IS ?')
            .run(String(row.card_id), examId, systemId);
        if (deleted) return;
        db.prepare(`
            INSERT INTO card_classifications
                (card_id, user_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            String(row.card_id), userId, examId, systemId, topicId,
            row.confidence == null ? null : Number(row.confidence), Number(row.split_weight ?? 1),
            isoOrRaw(row.classified_at), (row.model_version as string | null) ?? null,
        );
        return;
    }

    if (table === 'time_travel_log') {
        if (deleted) {
            db.prepare('DELETE FROM time_travel_log WHERE sync_id = ?').run(String(row.id));
            return;
        }
        const values: Record<string, unknown> = { sync_id: String(row.id), user_id: userId };
        for (const c of spec.columns) if (c.name !== 'id') values[c.name] = toLocal(c, row[c.name]);
        upsertLocal(db, table, values, ['sync_id']);
        return;
    }

    if (deleted) {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(row.id));
        return;
    }

    const values: Record<string, unknown> = { user_id: userId };
    for (const c of spec.columns) {
        if (table === 'media' && c.name === 'storage_path') values.file_path = localMediaPath(mediaDir, String(row.storage_path));
        else values[c.name] = toLocal(c, row[c.name]);
    }
    if (table === 'media') {
        // The same file imported on two devices is two server rows; locally a
        // user keeps one row per file hash. Either row serves the file.
        const dupe = db.prepare('SELECT id FROM media WHERE user_id = ? AND file_hash = ? AND id <> ?')
            .get(userId, values.file_hash, values.id) as { id: string } | undefined;
        if (dupe) return;
    }
    upsertLocal(db, table, values, ['id']);
}
