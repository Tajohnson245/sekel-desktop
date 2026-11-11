/**
 * Narrows a cloud-snapshot copy of sekel.db down to a single user.
 *
 * sekel.db is shared by every account that has signed in on this machine
 * (signing out keeps local rows). Uploading the raw copy put one person's
 * decks, reviews and profile into another person's cloud backup folder. The
 * snapshot is therefore scoped to the signed-in user before upload:
 *
 *   - every table with a `user_id` column keeps only that user's rows
 *     (rows with a NULL user_id are shared/system data and are kept);
 *   - user_profiles (keyed by `id`) keeps only that user's row;
 *   - dependents without a user_id (card_classifications → cards) go via
 *     their ON DELETE CASCADE foreign keys;
 *   - the file is VACUUMed so deleted rows don't survive in free pages, and
 *     switched to rollback-journal mode so it is a single self-contained file.
 *
 * Operates on the temporary copy only — never on the live database.
 */

import Database from 'better-sqlite3';

const quote = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export interface ScopeResult {
    /** Rows removed per table (only tables that lost rows). */
    removed: Record<string, number>;
}

export function scopeSnapshotToUser(dbPath: string, userId: string): ScopeResult {
    if (!userId) throw new Error('scopeSnapshotToUser: userId is required');
    const db = new Database(dbPath);
    const removed: Record<string, number> = {};
    try {
        db.pragma('journal_mode = DELETE');
        db.pragma('foreign_keys = ON');

        const tables = (db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        ).all() as { name: string }[]).map((t) => t.name);

        const hasColumn = (table: string, column: string) =>
            (db.pragma(`table_info(${quote(table)})`) as { name: string }[]).some((c) => c.name === column);

        const scope = db.transaction(() => {
            // Rows are deleted table by table in arbitrary order; defer FK checks
            // to commit, by which point every other user's rows are gone together.
            db.pragma('defer_foreign_keys = ON');
            for (const table of tables) {
                if (!hasColumn(table, 'user_id')) continue;
                const { changes } = db.prepare(
                    `DELETE FROM ${quote(table)} WHERE user_id IS NOT NULL AND user_id <> ?`,
                ).run(userId);
                if (changes > 0) removed[table] = changes;
            }
            if (tables.includes('user_profiles') && hasColumn('user_profiles', 'id')) {
                const { changes } = db.prepare('DELETE FROM user_profiles WHERE id <> ?').run(userId);
                if (changes > 0) removed.user_profiles = changes;
            }
        });
        scope();

        db.exec('VACUUM');
        return { removed };
    } finally {
        db.close();
    }
}
