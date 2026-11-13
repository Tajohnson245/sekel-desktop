import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// SEKEL-158 groundwork for cloud sync: atomic review writes, owner columns on
// every user table, and updated_at where rows are edited in place.

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));
vi.mock('../main/backup/deletionLog', () => ({
    logDeckDeletion: vi.fn(),
    logNoteDeletion: vi.fn(),
}));

import {
    createCard,
    createDeck,
    createDeckSession,
    completeDeckSession,
    createNote,
    createNoteType,
    recordReview,
    undoReview,
    saveDraft,
    updateDraft,
} from '../main/db/service';
import type { InsertReviewParams } from '../lib/queries';

const USER = 'user-a';

function migrate(db: Database.Database, upTo = MIGRATIONS.length): void {
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    const { v } = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
    for (let i = v ?? 0; i < upTo; i++) {
        db.exec(MIGRATIONS[i]);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
}

function freshDb(upTo?: number): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db, upTo);
    return db;
}

function seedCard(userId = USER) {
    const nt = createNoteType({
        user_id: userId, name: 'Basic', fields: [{ name: 'Front' }, { name: 'Back' }],
        card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
    });
    const deck = createDeck({ user_id: userId, name: 'Deck', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
    const note = createNote({ user_id: userId, deck_id: deck.id, note_type_id: nt.id, fields: { Front: 'Q', Back: 'A' }, tags: [] });
    const card = createCard({
        user_id: userId, note_id: note.id, template_index: 0, state: 'new', due: new Date().toISOString(),
        stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
    });
    return { deck, card };
}

function reviewFor(cardId: string, deckId: string, sessionId: string | null): InsertReviewParams {
    return {
        user_id: USER, card_id: cardId, rating: 'good', session_id: sessionId, deck_id: deckId, review_index: 1,
        review_duration_ms: 1200, state_before: 'new', stability_before: 0, difficulty_before: 0,
        state_after: 'learning', stability_after: 2.3, difficulty_after: 5.1, scheduled_days: 0,
    } as InsertReviewParams;
}

const reviewed = { state: 'learning', stability: 2.3, difficulty: 5.1, reps: 1, last_review: '2026-11-12T10:00:00.000Z', due: '2026-11-12T10:10:00.000Z' } as const;

describe('recordReview', () => {
    beforeEach(() => { testDb = freshDb(); });
    afterEach(() => testDb.close());

    it('writes the new schedule and the review row together', () => {
        const { deck, card } = seedCard();
        const session = createDeckSession(USER, deck.id);
        const out = recordReview(card.id, reviewed, reviewFor(card.id, deck.id, session.id));
        expect(out.card.state).toBe('learning');
        expect(out.card.reps).toBe(1);
        expect(out.review.card_id).toBe(card.id);
        const n = testDb.prepare('SELECT COUNT(*) AS n FROM reviews WHERE card_id = ?').get(card.id) as { n: number };
        expect(n.n).toBe(1);
    });

    it('rolls the card back when the review insert fails', () => {
        const { deck, card } = seedCard();
        // session_id references deck_sessions — a missing session violates the FK.
        expect(() => recordReview(card.id, reviewed, reviewFor(card.id, deck.id, 'no-such-session'))).toThrow();
        const row = testDb.prepare('SELECT state, reps, last_review FROM cards WHERE id = ?').get(card.id);
        expect(row).toEqual({ state: 'new', reps: 0, last_review: null });
        const n = testDb.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number };
        expect(n.n).toBe(0);
    });

    it('rejects a review for a different card', () => {
        const { deck, card } = seedCard();
        expect(() => recordReview(card.id, reviewed, reviewFor('other-card', deck.id, null))).toThrow(/must match/);
    });
});

describe('undoReview', () => {
    beforeEach(() => { testDb = freshDb(); });
    afterEach(() => testDb.close());

    it('restores the card and deletes the review row together', () => {
        const { deck, card } = seedCard();
        const { review } = recordReview(card.id, reviewed, reviewFor(card.id, deck.id, null));
        const restored = undoReview(card.id, { state: 'new', stability: 0, difficulty: 0, reps: 0, last_review: null, due: card.due }, review.id, USER);
        expect(restored.state).toBe('new');
        expect(restored.reps).toBe(0);
        const n = testDb.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number };
        expect(n.n).toBe(0);
    });

    it("never deletes another user's review", () => {
        const { deck, card } = seedCard();
        const { review } = recordReview(card.id, reviewed, reviewFor(card.id, deck.id, null));
        undoReview(card.id, { state: 'new' }, review.id, 'someone-else');
        const n = testDb.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number };
        expect(n.n).toBe(1);
    });
});

describe('updated_at on drafts and sessions', () => {
    beforeEach(() => { testDb = freshDb(); });
    afterEach(() => testDb.close());

    it('drafts get updated_at on save and on edit', async () => {
        const draft = saveDraft(USER, { front: 'f', back: 'b', source: null } as never);
        const saved = testDb.prepare('SELECT created_at, updated_at FROM card_drafts WHERE id = ?').get(draft.id) as { created_at: string; updated_at: string };
        expect(saved.updated_at).toBe(saved.created_at);
        await new Promise((r) => setTimeout(r, 5));
        updateDraft(draft.id, { front: 'edited' });
        const edited = testDb.prepare('SELECT updated_at FROM card_drafts WHERE id = ?').get(draft.id) as { updated_at: string };
        expect(edited.updated_at > saved.updated_at).toBe(true);
    });

    it('sessions get updated_at on create and on complete', async () => {
        const { deck } = seedCard();
        const session = createDeckSession(USER, deck.id);
        const created = testDb.prepare('SELECT updated_at FROM deck_sessions WHERE id = ?').get(session.id) as { updated_at: string };
        expect(created.updated_at).toBeTruthy();
        await new Promise((r) => setTimeout(r, 5));
        completeDeckSession(session.id);
        const done = testDb.prepare('SELECT updated_at, completed_at FROM deck_sessions WHERE id = ?').get(session.id) as { updated_at: string; completed_at: string };
        expect(done.updated_at).toBe(done.completed_at);
        expect(done.updated_at > created.updated_at).toBe(true);
    });
});

describe('migration 25 backfills', () => {
    afterEach(() => testDb.close());

    // Builds a database at schema 24 with pre-existing rows, then applies 25.
    function at24WithRows(users: string[]) {
        testDb = freshDb(24);
        for (const u of users) {
            const { card } = seedCard(u);
            const examId = (testDb.prepare(`INSERT INTO blueprint_exams (exam_key, label, updated_at) VALUES (?, 'X', 'now') RETURNING id`).get(`exam-${u}`) as { id: number }).id;
            testDb.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at)
                            VALUES (?, ?, NULL, NULL, 0, 1, 'now')`).run(card.id, examId);
        }
        testDb.prepare(`INSERT INTO time_travel_log (triggered_at, overdue_count, window_days, daily_target) VALUES ('t1', 1, 1, 50)`).run();
        testDb.prepare(`INSERT INTO time_travel_log (triggered_at, overdue_count, window_days, daily_target) VALUES ('t2', 2, 1, 50)`).run();
        testDb.prepare(`INSERT INTO card_drafts (id, user_id, front, back, source, created_at) VALUES ('d1', ?, 'f', 'b', NULL, '2026-01-01T00:00:00.000Z')`).run(users[0]);
    }

    it('attributes classifications to the card owner and stamps every log row with a UUID', () => {
        at24WithRows([USER]);
        migrate(testDb);
        const cls = testDb.prepare('SELECT user_id FROM card_classifications').all();
        expect(cls).toEqual([{ user_id: USER }]);
        const logs = testDb.prepare('SELECT user_id, sync_id FROM time_travel_log ORDER BY id').all() as Array<{ user_id: string; sync_id: string }>;
        expect(logs.map((l) => l.user_id)).toEqual([USER, USER]); // single account → attributed
        expect(new Set(logs.map((l) => l.sync_id)).size).toBe(2);
        for (const l of logs) expect(l.sync_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(testDb.prepare(`SELECT updated_at FROM card_drafts WHERE id = 'd1'`).get()).toEqual({ updated_at: '2026-01-01T00:00:00.000Z' });
    });

    it('leaves old time-travel rows unattributed when several accounts share the machine', () => {
        at24WithRows([USER, 'user-b']);
        migrate(testDb);
        const logs = testDb.prepare('SELECT user_id FROM time_travel_log').all();
        expect(logs).toEqual([{ user_id: null }, { user_id: null }]);
        const cls = testDb.prepare('SELECT user_id FROM card_classifications ORDER BY user_id').all();
        expect(cls).toEqual([{ user_id: USER }, { user_id: 'user-b' }]);
    });
});
