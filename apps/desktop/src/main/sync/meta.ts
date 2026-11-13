/**
 * Small persistent sync state kept inside sekel.db, so it travels with the
 * data: restoring an old database also restores the matching cursors, and the
 * restore flow then forces a reconcile (see engine.ts).
 *
 * sync_metadata keys:
 *   pull_cursor:{user}        last server_seq pulled into the inbox
 *   backfilled:{user}         when this device first enqueued the user's library
 *   restore_pending_at        set after any backup restore
 *   restore_reconciled:{user} when this user's cloud copy was last made to match a restore
 */
import type Database from 'better-sqlite3';

export function getMeta(db: Database.Database, key: string): string | null {
    const row = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setMeta(db: Database.Database, key: string, value: string): void {
    db.prepare('INSERT INTO sync_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function deleteMeta(db: Database.Database, key: string): void {
    db.prepare('DELETE FROM sync_metadata WHERE key = ?').run(key);
}

export function getPullCursor(db: Database.Database, userId: string): number {
    return Number(getMeta(db, `pull_cursor:${userId}`) ?? 0);
}

export function setPullCursor(db: Database.Database, userId: string, seq: number): void {
    setMeta(db, `pull_cursor:${userId}`, String(seq));
}

/** Turns on change capture (never turned off again: see migration 26). */
export function enableCapture(db: Database.Database): void {
    db.prepare('UPDATE sync_state SET capture = 1 WHERE id = 1').run();
}

export function isCaptureEnabled(db: Database.Database): boolean {
    const row = db.prepare('SELECT capture FROM sync_state WHERE id = 1').get() as { capture: number } | undefined;
    return row?.capture === 1;
}

/**
 * Runs fn in one transaction with capture paused, so rows written while
 * applying pulled changes aren't queued to be pushed straight back.
 */
export function withApplying<T>(db: Database.Database, fn: () => T): T {
    return db.transaction(() => {
        db.prepare('UPDATE sync_state SET applying = 1 WHERE id = 1').run();
        try {
            return fn();
        } finally {
            db.prepare('UPDATE sync_state SET applying = 0 WHERE id = 1').run();
        }
    })();
}

/** Called by the restore flows once the restored database is open. */
export function markRestored(db: Database.Database, at = new Date()): void {
    setMeta(db, 'restore_pending_at', at.toISOString());
}

export function needsRestoreReconcile(db: Database.Database, userId: string): boolean {
    const pending = getMeta(db, 'restore_pending_at');
    if (!pending) return false;
    const done = getMeta(db, `restore_reconciled:${userId}`);
    return !done || done < pending;
}
