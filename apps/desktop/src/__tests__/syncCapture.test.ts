/**
 * Change capture for cloud sync (local migration 26): the outbox triggers on
 * every synced table, on real SQLite with every migration applied.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

let testDb: Database.Database;
vi.mock('../main/db/index', () => ({ getDb: () => testDb, initDatabase: vi.fn() }));
vi.mock('../main/backup/deletionLog', () => ({
    logDeckDeletion: vi.fn(), logNoteDeletion: vi.fn(), logAllDecksDeletion: vi.fn(), logAllNotesInDeckDeletion: vi.fn(),
}));

import { createCard, createDeck, createNote, createNoteType, deleteDeck, recordReview, updateDeck } from '../main/db/service';
import { timeTravelExecute } from '../main/db/timeTravel';
import { enableCapture, withApplying } from '../main/sync/meta';
import { enqueueAll } from '../main/sync/outbox';
import { SYNC_TABLE_NAMES } from '../main/sync/tables';

const USER = 'user-capture';

beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        testDb.exec(MIGRATIONS[i]);
        testDb.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
});
afterEach(() => testDb.close());

type Entry = { table_name: string; row_id: string; user_id: string; op: string };
const outbox = () => testDb.prepare('SELECT table_name, row_id, user_id, op FROM sync_outbox ORDER BY table_name, row_id').all() as Entry[];

function seed() {
    const nt = createNoteType({ user_id: USER, name: 'Basic', fields: [{ name: 'Front' }], card_templates: [] });
    const deck = createDeck({ user_id: USER, name: 'D', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
    const note = createNote({ user_id: USER, deck_id: deck.id, note_type_id: nt.id, fields: { Front: 'Q' }, tags: [] });
    const card = createCard({
        user_id: USER, note_id: note.id, template_index: 0, state: 'review', due: '2026-01-01T00:00:00.000Z',
        stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 3, reps: 2, lapses: 0, last_review: '2025-12-20T00:00:00.000Z',
    });
    return { nt, deck, note, card };
}

describe('change capture', () => {
    it('has a trigger for each event on every synced table', () => {
        const names = new Set((testDb.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_%'`).all() as Array<{ name: string }>).map((r) => r.name));
        for (const t of SYNC_TABLE_NAMES) {
            for (const ev of ['ai', 'au', 'ad']) expect(names.has(`sync_${t}_${ev}`), `sync_${t}_${ev}`).toBe(true);
        }
    });

    it('records nothing until sync is first enabled on this device', () => {
        seed();
        expect(outbox()).toEqual([]);
    });

    it('records each changed row once, newest operation wins', () => {
        enableCapture(testDb);
        const { deck, note, card, nt } = seed();
        updateDeck(deck.id, { name: 'D2' });
        updateDeck(deck.id, { name: 'D3' });
        expect(outbox()).toEqual([
            { table_name: 'cards', row_id: card.id, user_id: USER, op: 'upsert' },
            { table_name: 'decks', row_id: deck.id, user_id: USER, op: 'upsert' },
            { table_name: 'note_types', row_id: nt.id, user_id: USER, op: 'upsert' },
            { table_name: 'notes', row_id: note.id, user_id: USER, op: 'upsert' },
        ].sort((a, b) => a.table_name.localeCompare(b.table_name)));
    });

    it('captures rows removed by FK cascades as deletes', () => {
        const { deck, note, card } = seed();
        recordReview(card.id, { reps: 3 }, {
            user_id: USER, card_id: card.id, rating: 'good', session_id: null, deck_id: deck.id, review_index: 1,
            review_duration_ms: 1, state_before: 'review', stability_before: 3, difficulty_before: 5,
            state_after: 'review', stability_after: 4, difficulty_after: 5, scheduled_days: 4,
        } as never);
        const reviewId = (testDb.prepare('SELECT id FROM reviews').get() as { id: string }).id;
        enableCapture(testDb);
        deleteDeck(deck.id);
        const ops = Object.fromEntries(outbox().map((e) => [`${e.table_name}:${e.row_id}`, e.op]));
        expect(ops).toMatchObject({
            [`decks:${deck.id}`]: 'delete',
            [`notes:${note.id}`]: 'delete',
            [`cards:${card.id}`]: 'delete',
            [`reviews:${reviewId}`]: 'delete',
        });
    });

    it('keys classifications by (card, exam) and exam profiles by (user, exam)', () => {
        const { card } = seed();
        const examId = (testDb.prepare(`INSERT INTO blueprint_exams (exam_key, label, updated_at) VALUES ('usmle-step1', 'S1', 'x') RETURNING id`).get() as { id: number }).id;
        enableCapture(testDb);
        testDb.prepare(`INSERT INTO card_classifications (card_id, user_id, exam_id, split_weight, classified_at) VALUES (?, ?, ?, 1, 'now')`).run(card.id, USER, examId);
        testDb.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, created_at, updated_at) VALUES (?, ?, '9999-12-31', 'now', 'now')`).run(USER, examId);
        testDb.prepare('DELETE FROM card_classifications WHERE card_id = ?').run(card.id);
        const rows = outbox();
        // A classification change always re-syncs the card's whole set for that exam.
        expect(rows).toContainEqual({ table_name: 'card_classifications', row_id: `${card.id}:${examId}`, user_id: USER, op: 'upsert' });
        expect(rows).toContainEqual({ table_name: 'user_exam_profiles', row_id: `${USER}:${examId}`, user_id: USER, op: 'upsert' });
    });

    it('records time-travel log rows by their sync id and skips unowned legacy rows', () => {
        seed();
        enableCapture(testDb);
        testDb.prepare(`INSERT INTO time_travel_log (triggered_at, overdue_count, window_days, daily_target) VALUES ('t', 1, 1, 50)`).run();
        timeTravelExecute(USER, 1);
        const rows = outbox().filter((r) => r.table_name === 'time_travel_log');
        const syncId = (testDb.prepare('SELECT sync_id FROM time_travel_log WHERE user_id = ?').get(USER) as { sync_id: string }).sync_id;
        expect(rows).toEqual([{ table_name: 'time_travel_log', row_id: syncId, user_id: USER, op: 'upsert' }]);
    });

    it('stays quiet while pulled changes are being applied', () => {
        enableCapture(testDb);
        const { deck } = seed();
        testDb.prepare('DELETE FROM sync_outbox').run();
        withApplying(testDb, () => {
            testDb.prepare('UPDATE decks SET name = ? WHERE id = ?').run('from the cloud', deck.id);
        });
        expect(outbox()).toEqual([]);
        updateDeck(deck.id, { name: 'local again' });
        expect(outbox()).toHaveLength(1);
    });
});

describe('enqueueAll', () => {
    it("queues every row a user owns, keeping pending edits' change times", () => {
        const { deck } = seed();
        enableCapture(testDb);
        updateDeck(deck.id, { name: 'pending edit' });
        const before = testDb.prepare(`SELECT changed_at FROM sync_outbox WHERE row_id = ?`).get(deck.id) as { changed_at: string };
        const added = enqueueAll(testDb, USER, 'own-time');
        expect(added).toBe(3); // note type, note, card (the deck was already queued)
        const after = testDb.prepare(`SELECT changed_at FROM sync_outbox WHERE row_id = ?`).get(deck.id) as { changed_at: string };
        expect(after.changed_at).toBe(before.changed_at);
        expect(enqueueAll(testDb, 'someone-else', 'own-time')).toBe(0);
    });

    it("after a restore, stamps everything now so it replaces the cloud's copy", () => {
        seed();
        for (const t of ['note_types', 'decks', 'notes', 'cards']) {
            testDb.prepare(`UPDATE ${t} SET updated_at = '2020-01-01T00:00:00.000Z'`).run();
        }
        enqueueAll(testDb, USER, 'own-time');
        const old = testDb.prepare(`SELECT MIN(changed_at) AS c FROM sync_outbox`).get() as { c: string };
        enqueueAll(testDb, USER, 'now');
        const now = testDb.prepare(`SELECT MIN(changed_at) AS c FROM sync_outbox`).get() as { c: string };
        expect(now.c > old.c).toBe(true);
    });
});
