import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from '../main/db/migrations';

// ── In-memory test database ────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));

vi.mock('../main/db/syncPush', () => ({
    pushRecord: vi.fn(),
    deleteRecord: vi.fn(),
}));

import { buildAnkiDatabase } from '../main/export/builder';
import { parseAnkiDatabase } from '../main/import/parser';
import { executeImport } from '../main/import/insertionEngine';

function setupDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        db.exec(MIGRATIONS[i]);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return db;
}

const USER = 'user-test-export';
const DAY_MS = 86400000;
const NOW = '2026-01-01T00:00:00.000Z';

// ── Sekel fixture builders ────────────────────────────────────────────────────

function seedDeck(): { deckId: string; noteId: string } {
    testDb.prepare(`
        INSERT INTO decks (id, user_id, name, algorithm, anki_id, created_at, updated_at)
        VALUES ('deck-1', ?, 'Bio', 'fsrs', 2001, ?, ?)
    `).run(USER, NOW, NOW);
    testDb.prepare(`
        INSERT INTO note_types (id, user_id, name, fields, card_templates, anki_id, created_at, updated_at)
        VALUES ('nt-1', ?, 'Basic', ?, ?, 1001, ?, ?)
    `).run(
        USER,
        JSON.stringify([{ name: 'Front' }, { name: 'Back' }]),
        JSON.stringify([{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }]),
        NOW, NOW,
    );
    testDb.prepare(`
        INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, anki_id, anki_guid, created_at, updated_at)
        VALUES ('note-1', ?, 'deck-1', 'nt-1', ?, '[]', 3001, 'guid-3001', ?, ?)
    `).run(USER, JSON.stringify({ Front: 'Q', Back: 'A' }), NOW, NOW);
    return { deckId: 'deck-1', noteId: 'note-1' };
}

let cardSeq = 0;
function seedCard(opts: { state: string; due: string; ankiMeta?: Record<string, unknown> }): string {
    cardSeq++;
    const id = `card-${cardSeq}`;
    testDb.prepare(`
        INSERT INTO cards (id, user_id, note_id, template_index, state, due, stability, difficulty,
                           elapsed_days, scheduled_days, reps, lapses, anki_id, anki_meta, created_at, updated_at)
        VALUES (?, ?, 'note-1', 0, ?, ?, 10, 5, 10, 10, 3, 0, ?, ?, ?, ?)
    `).run(id, USER, opts.state, opts.due, 4000 + cardSeq, opts.ankiMeta ? JSON.stringify(opts.ankiMeta) : null, NOW, NOW);
    return id;
}

const tmpDirs: string[] = [];
function build(deckId: string): Database.Database {
    const dbPath = buildAnkiDatabase(deckId, USER);
    tmpDirs.push(path.dirname(dbPath));
    return new Database(dbPath, { readonly: true });
}

beforeEach(() => { testDb = setupDb(); cardSeq = 0; });
afterEach(() => {
    testDb.close();
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildAnkiDatabase — scheduling', () => {
    type AnkiCardRow = { id: number; type: number; queue: number; due: number };

    it('writes review dues as day numbers relative to the exported col.crt', () => {
        const { deckId } = seedDeck();
        const dueIso = '2027-03-15T13:45:00.000Z';
        seedCard({ state: 'review', due: dueIso });

        const anki = build(deckId);
        const { crt } = anki.prepare('SELECT crt FROM col').get() as { crt: number };
        const card = anki.prepare('SELECT type, queue, due FROM cards').get() as AnkiCardRow;
        anki.close();

        expect(card.type).toBe(2);
        expect(card.queue).toBe(2);
        // The Anki day the card is due on contains the Sekel due time.
        const dayStart = crt * 1000 + card.due * DAY_MS;
        expect(dayStart).toBeLessThanOrEqual(Date.parse(dueIso));
        expect(Date.parse(dueIso)).toBeLessThan(dayStart + DAY_MS);
    });

    it('uses a fixed crt so the export is deterministic', () => {
        const { deckId } = seedDeck();
        seedCard({ state: 'review', due: '2027-03-15T13:45:00.000Z' });

        const first = build(deckId);
        const a = first.prepare('SELECT crt FROM col').get() as { crt: number };
        first.close();
        const second = build(deckId);
        const b = second.prepare('SELECT crt FROM col').get() as { crt: number };
        second.close();

        expect(a.crt).toBe(b.crt);
    });

    it('writes learning dues as Unix seconds in the intraday learning queue', () => {
        const { deckId } = seedDeck();
        const dueIso = '2027-03-15T13:45:00.000Z';
        seedCard({ state: 'learning', due: dueIso });

        const anki = build(deckId);
        const card = anki.prepare('SELECT type, queue, due FROM cards').get() as AnkiCardRow;
        anki.close();

        expect(card).toMatchObject({ type: 1, queue: 1, due: Date.parse(dueIso) / 1000 });
    });

    it('derives the queue from the current state, not a stale imported queue', () => {
        const { deckId } = seedDeck();
        // Imported as new (queue 0) and since studied in Sekel → now review.
        seedCard({ state: 'review', due: '2027-03-15T13:45:00.000Z', ankiMeta: { queue: 0, mod: 1 } });

        const anki = build(deckId);
        const card = anki.prepare('SELECT type, queue FROM cards').get() as AnkiCardRow;
        anki.close();

        expect(card).toMatchObject({ type: 2, queue: 2 });
    });

    it('preserves a suspended queue from the original import', () => {
        const { deckId } = seedDeck();
        seedCard({ state: 'review', due: '2027-03-15T13:45:00.000Z', ankiMeta: { queue: -1, mod: 1 } });

        const anki = build(deckId);
        const card = anki.prepare('SELECT type, queue FROM cards').get() as AnkiCardRow;
        anki.close();

        expect(card).toMatchObject({ type: 2, queue: -1 });
    });

    it('round-trips review due dates through export → parse → import', async () => {
        const { deckId } = seedDeck();
        const dueIso = '2027-03-15T13:45:00.000Z';
        const cardId = seedCard({ state: 'review', due: dueIso });
        // Review history so 'keep' scheduling retains the review state.
        testDb.prepare(`
            INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before, stability_before,
                                 difficulty_before, state_after, stability_after, difficulty_after,
                                 scheduled_days, review_type, created_at)
            VALUES ('rev-1', ?, ?, 'good', '2027-03-05T10:00:00.000Z', 'review', 5, 5, 'review', 10, 5, 10, 1, ?)
        `).run(USER, cardId, NOW);

        const dbPath = buildAnkiDatabase(deckId, USER);
        tmpDirs.push(path.dirname(dbPath));
        const collection = await parseAnkiDatabase(dbPath);

        // Re-import from scratch (cascade-deletes the deck's notes, cards, reviews).
        testDb.prepare('DELETE FROM decks WHERE user_id = ?').run(USER);
        executeImport({
            parsedData: collection,
            decks: [{ ankiDeckId: 2001, deckName: 'Bio', selected: true, scheduling: 'keep', algorithm: 'fsrs', conflict: null }],
            hierarchyMode: 'subdecks',
            mediaMap: {},
            mediaFilePaths: [],
            tempDir: '/tmp/test',
            userId: USER,
        }, USER);

        const row = testDb.prepare('SELECT state, due, last_review FROM cards WHERE user_id = ?')
            .get(USER) as { state: string; due: string; last_review: string };
        expect(row.state).toBe('review');
        expect(row.due.slice(0, 10)).toBe('2027-03-15');
        expect(row.last_review).toBe('2027-03-05T10:00:00.000Z');
    });
});
