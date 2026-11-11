import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// Upgrade tests for the SEKEL-145 migrations: build a DB at the schema version
// just before a migration, seed pre-upgrade data, then apply the rest.

let db: Database.Database;
afterEach(() => { db?.close(); });

function migrationIndex(marker: string): number {
    const idx = MIGRATIONS.findIndex(m => m.includes(marker));
    if (idx < 0) throw new Error(`migration containing "${marker}" not found`);
    return idx;
}

function setupDbUpTo(exclusiveEnd: number): Database.Database {
    const d = new Database(':memory:');
    d.pragma('foreign_keys = ON');
    for (let i = 0; i < exclusiveEnd; i++) d.exec(MIGRATIONS[i]);
    return d;
}

function applyFrom(d: Database.Database, start: number): void {
    for (let i = start; i < MIGRATIONS.length; i++) d.exec(MIGRATIONS[i]);
}

function seedDeckAndType(d: Database.Database, userId: string, suffix: string): void {
    d.prepare(`INSERT INTO decks (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'D', 'now', 'now')`)
        .run(`deck-${suffix}`, userId);
    d.prepare(`INSERT INTO note_types (id, user_id, name, created_at, updated_at) VALUES (?, ?, 'T', 'now', 'now')`)
        .run(`nt-${suffix}`, userId);
}

function insertNote(d: Database.Database, id: string, userId: string, suffix: string, guid: string | null): void {
    d.prepare(`
        INSERT INTO notes (id, user_id, deck_id, note_type_id, anki_guid, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'now', 'now')
    `).run(id, userId, `deck-${suffix}`, `nt-${suffix}`, guid);
}

describe('migration: per-user anki_guid uniqueness', () => {
    it('replaces the global unique index and keeps existing notes', () => {
        const idx = migrationIndex('idx_notes_user_anki_guid');
        db = setupDbUpTo(idx);
        seedDeckAndType(db, 'user-a', 'a');
        seedDeckAndType(db, 'user-b', 'b');
        insertNote(db, 'n1', 'user-a', 'a', 'guid-1');
        // Before the migration a second account can't hold the same guid.
        expect(() => insertNote(db, 'n2', 'user-b', 'b', 'guid-1')).toThrow(/UNIQUE constraint failed/);

        applyFrom(db, idx);

        const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notes'")
            .all() as { name: string }[]).map(r => r.name);
        expect(indexes).not.toContain('idx_notes_anki_guid');
        expect(indexes).toContain('idx_notes_user_anki_guid');
        expect(db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 1 });

        expect(() => insertNote(db, 'n2', 'user-b', 'b', 'guid-1')).not.toThrow();
        expect(() => insertNote(db, 'n3', 'user-a', 'a', 'guid-1')).toThrow(/UNIQUE constraint failed/);
        // Notes without a guid (Sekel-native) are unconstrained.
        insertNote(db, 'n4', 'user-a', 'a', null);
        expect(() => insertNote(db, 'n5', 'user-a', 'a', null)).not.toThrow();
    });
});
