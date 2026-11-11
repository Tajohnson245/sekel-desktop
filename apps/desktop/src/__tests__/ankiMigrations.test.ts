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

describe('migration: repair pre-SEKEL-145 Anki review due dates', () => {
    const USER = 'user-a';
    // What the old importer wrote for Anki due day 1000: 2006-01-01 + 1000 days.
    const BAD_DUE = '2008-09-27T00:00:00.000Z';

    interface CardSeed {
        id: string;
        state?: string;
        due?: string;
        lastReview?: string | null;
        ankiId?: number | null;
    }

    function seedCard(c: CardSeed): void {
        db.prepare(`
            INSERT INTO cards (id, user_id, note_id, state, due, last_review, anki_id, created_at, updated_at)
            VALUES (?, ?, 'n1', ?, ?, ?, ?, 'import-time', 'import-time')
        `).run(c.id, USER, c.state ?? 'review', c.due ?? BAD_DUE, c.lastReview ?? null,
            c.ankiId === undefined ? 4000 + Number(c.id.replace(/\D/g, '') || 0) : c.ankiId);
    }

    let reviewSeq = 0;
    function seedReview(cardId: string, reviewTime: string, scheduledDays: number,
        reviewType: number | null = 1, sessionId: string | null = null): void {
        reviewSeq++;
        db.prepare(`
            INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before, stability_before,
                                 difficulty_before, state_after, stability_after, difficulty_after,
                                 scheduled_days, session_id, review_type, created_at)
            VALUES (?, ?, ?, 'good', ?, 'review', 1, 5, 'review', 1, 5, ?, ?, ?, 'import-time')
        `).run(`r${reviewSeq}`, USER, cardId, reviewTime, scheduledDays, sessionId, reviewType);
    }

    function card(id: string): { due: string; last_review: string | null; updated_at: string } {
        return db.prepare('SELECT due, last_review, updated_at FROM cards WHERE id = ?').get(id) as
            { due: string; last_review: string | null; updated_at: string };
    }

    function setup(): number {
        const idx = migrationIndex("due LIKE '____-__-__T00:00:00.000Z'");
        db = setupDbUpTo(idx);
        db.pragma('foreign_keys = OFF'); // decks/notes aren't needed for these rows
        reviewSeq = 0;
        return idx;
    }

    it('rebuilds the due from the latest scheduling review + its interval and backfills last_review', () => {
        const idx = setup();
        seedCard({ id: 'c1' });
        seedReview('c1', '2023-01-01T10:00:00.000Z', 10);
        seedReview('c1', '2023-02-01T10:00:00.000Z', 30);

        applyFrom(db, idx);

        expect(card('c1').due).toBe('2023-03-03T10:00:00.000Z');
        expect(card('c1').last_review).toBe('2023-02-01T10:00:00.000Z');
        expect(card('c1').updated_at).not.toBe('import-time');
    });

    it('ignores manual reschedules and zero-interval previews when picking the anchor review', () => {
        const idx = setup();
        seedCard({ id: 'c1' });
        seedReview('c1', '2023-02-01T10:00:00.000Z', 30, 2);  // relearn graduate
        seedReview('c1', '2023-02-05T10:00:00.000Z', 0, 3);   // filtered preview, no reschedule
        seedReview('c1', '2023-02-06T10:00:00.000Z', 90, 4);  // manual "set due date"

        applyFrom(db, idx);

        expect(card('c1').due).toBe('2023-03-03T10:00:00.000Z');
        // The preview was still a review; the manual entry wasn't.
        expect(card('c1').last_review).toBe('2023-02-05T10:00:00.000Z');
    });

    it('leaves cards without the old importer signature untouched', () => {
        const idx = setup();
        seedCard({ id: 'c1', lastReview: '2024-01-01T00:00:00.000Z' });    // reviewed in Sekel
        seedCard({ id: 'c2', due: '2027-01-01T05:00:00.000Z' });          // not the old formula
        seedCard({ id: 'c3', state: 'new' });                              // new card
        seedCard({ id: 'c4', state: 'learning', due: '1970-01-01T00:20:00.000Z' });
        seedCard({ id: 'c5', ankiId: null });                              // Sekel-native
        seedCard({ id: 'c6' });                                            // only Sekel reviews
        for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) seedReview(id, '2023-02-01T10:00:00.000Z', 30);
        seedReview('c6', '2023-02-01T10:00:00.000Z', 30, null, 'session-1');
        // Explicit columns: later migrations may add columns to cards.
        const snapshot = () => db.prepare('SELECT id, state, due, last_review, updated_at FROM cards ORDER BY id').all();
        const before = snapshot();

        applyFrom(db, idx);

        expect(snapshot()).toEqual(before);
    });

    it('leaves an affected card alone when it has no usable Anki review', () => {
        const idx = setup();
        seedCard({ id: 'c1' });
        seedReview('c1', '2023-02-01T10:00:00.000Z', 0, 1);   // interval 0 (learning step)
        seedReview('c1', '2023-02-02T10:00:00.000Z', 30, 4);  // manual only

        applyFrom(db, idx);

        expect(card('c1')).toEqual({ due: BAD_DUE, last_review: null, updated_at: 'import-time' });
    });
});
