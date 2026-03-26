import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// ── In-memory test database ────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));

import { timeTravelPreview, timeTravelExecute } from '../main/db/timeTravel';
import { createNoteType, createDeck, createNote, createCard } from '../main/db/service';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const USER = 'user-test-1';

function seedNoteType(userId = USER) {
    return createNoteType({
        user_id: userId,
        name: 'Basic',
        fields: [{ name: 'Front' }, { name: 'Back' }],
        card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
    });
}

function seedDeck(name = 'Test Deck', userId = USER) {
    return createDeck({ user_id: userId, name, description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
}

function seedNote(deckId: string, noteTypeId: string, userId = USER) {
    return createNote({
        user_id: userId,
        deck_id: deckId,
        note_type_id: noteTypeId,
        fields: { Front: 'Q', Back: 'A' },
        tags: [],
    });
}

/** Create N overdue review cards with last_review set. */
function seedOverdueReviewCards(
    count: number,
    deckId: string,
    noteTypeId: string,
    daysOverdue = 5,
    userId = USER,
) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
        const note = seedNote(deckId, noteTypeId, userId);
        const overdueDue = new Date(Date.now() - daysOverdue * 86_400_000).toISOString();
        const lastReview = new Date(Date.now() - (daysOverdue + 10) * 86_400_000).toISOString();
        const card = createCard({
            user_id: userId,
            note_id: note.id,
            template_index: 0,
            state: 'review',
            due: overdueDue,
            stability: 10,
            difficulty: 5,
            elapsed_days: 5,
            scheduled_days: 10,
            reps: 3,
            lapses: 0,
            last_review: lastReview,
        });
        ids.push(card.id);
    }
    return ids;
}

beforeEach(() => { testDb = setupDb(); });
afterEach(() => { testDb.close(); });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('timeTravelPreview', () => {
    it('returns overdueCount 0 when no cards are overdue', () => {
        const result = timeTravelPreview(7);
        expect(result.overdueCount).toBe(0);
        expect(result.windowDays).toBe(0);
        expect(result.distribution).toHaveLength(0);
    });

    it('counts only review cards with last_review set', () => {
        const nt = seedNoteType();
        const deck = seedDeck();

        // Overdue review card with last_review — should be counted
        seedOverdueReviewCards(1, deck.id, nt.id, 5);

        // New card (state='new') — should NOT be counted
        const noteNew = seedNote(deck.id, nt.id);
        createCard({
            user_id: USER, note_id: noteNew.id, template_index: 0,
            state: 'new', due: new Date(Date.now() - 5 * 86_400_000).toISOString(),
            stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0,
            last_review: null,
        });

        // Review card with null last_review — should NOT be counted
        const noteNoReview = seedNote(deck.id, nt.id);
        createCard({
            user_id: USER, note_id: noteNoReview.id, template_index: 0,
            state: 'review', due: new Date(Date.now() - 5 * 86_400_000).toISOString(),
            stability: 5, difficulty: 3, elapsed_days: 5, scheduled_days: 10, reps: 1, lapses: 0,
            last_review: null,
        });

        const result = timeTravelPreview(3);
        expect(result.overdueCount).toBe(1);
    });

    it('returns windowDays=1 when 30 cards with target 50', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(30, deck.id, nt.id, 5);

        const result = timeTravelPreview(3);
        expect(result.overdueCount).toBe(30);
        expect(result.windowDays).toBe(1);
        expect(result.distribution).toHaveLength(1);
        expect(result.distribution[0].count).toBe(30);
    });

    it('returns windowDays=4 for 200 overdue cards', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(200, deck.id, nt.id, 5);

        const result = timeTravelPreview(3);
        expect(result.overdueCount).toBe(200);
        expect(result.windowDays).toBe(4);
        expect(result.distribution).toHaveLength(4);
        expect(result.distribution.reduce((sum, d) => sum + d.count, 0)).toBe(200);
    });

    it('caps window at 7 days for 500 overdue cards', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(500, deck.id, nt.id, 5);

        const result = timeTravelPreview(3);
        expect(result.overdueCount).toBe(500);
        expect(result.windowDays).toBe(7);
        expect(result.distribution).toHaveLength(7);
        expect(result.distribution.reduce((sum, d) => sum + d.count, 0)).toBe(500);
    });

    it('does not modify any card data (read-only)', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(10, deck.id, nt.id, 5);

        const before = testDb.prepare('SELECT * FROM cards ORDER BY id').all();
        timeTravelPreview(3);
        const after = testDb.prepare('SELECT * FROM cards ORDER BY id').all();

        expect(after).toEqual(before);
    });
});

describe('timeTravelExecute', () => {
    it('returns overdueCount 0 and creates no log when no cards overdue', () => {
        const result = timeTravelExecute(7);
        expect(result.overdueCount).toBe(0);
        expect(result.windowDays).toBe(0);

        const logs = testDb.prepare('SELECT * FROM time_travel_log').all();
        expect(logs).toHaveLength(0);
    });

    it('redistributes 30 cards to today (windowDays=1)', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(30, deck.id, nt.id, 5);

        const result = timeTravelExecute(3);
        expect(result.overdueCount).toBe(30);
        expect(result.windowDays).toBe(1);

        // All cards should have due dates set to today (local midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const cards = testDb.prepare(
            "SELECT due FROM cards WHERE state = 'review'",
        ).all() as { due: string }[];
        for (const card of cards) {
            expect(card.due).toBe(todayISO);
        }
    });

    it('distributes 200 cards across 4 days', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(200, deck.id, nt.id, 5);

        const result = timeTravelExecute(3);
        expect(result.overdueCount).toBe(200);
        expect(result.windowDays).toBe(4);

        // Count cards per unique due date
        const groups = testDb.prepare(
            "SELECT due, COUNT(*) as cnt FROM cards WHERE state = 'review' GROUP BY due ORDER BY due ASC",
        ).all() as { due: string; cnt: number }[];
        expect(groups).toHaveLength(4);
        expect(groups.reduce((sum, g) => sum + g.cnt, 0)).toBe(200);
        // Each day should get 50 cards (200 / 4)
        for (const g of groups) {
            expect(g.cnt).toBe(50);
        }
    });

    it('caps window at 7 days for 500 overdue cards', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(500, deck.id, nt.id, 5);

        const result = timeTravelExecute(3);
        expect(result.windowDays).toBe(7);

        const groups = testDb.prepare(
            "SELECT due, COUNT(*) as cnt FROM cards WHERE state = 'review' GROUP BY due ORDER BY due ASC",
        ).all() as { due: string; cnt: number }[];
        expect(groups).toHaveLength(7);
        expect(groups.reduce((sum, g) => sum + g.cnt, 0)).toBe(500);
    });

    it('does not modify FSRS fields — only due and updated_at change', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(5, deck.id, nt.id, 5);

        type CardRow = { id: string; state: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; reps: number; lapses: number; last_review: string | null };
        const before = testDb.prepare(
            'SELECT id, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review FROM cards ORDER BY id',
        ).all() as CardRow[];

        timeTravelExecute(3);

        const after = testDb.prepare(
            'SELECT id, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review FROM cards ORDER BY id',
        ).all() as CardRow[];

        expect(after).toEqual(before);
    });

    it('excludes cards with no review history (last_review IS NULL)', () => {
        const nt = seedNoteType();
        const deck = seedDeck();

        // 5 real overdue review cards
        seedOverdueReviewCards(5, deck.id, nt.id, 5);

        // 3 review cards with null last_review — should be excluded
        for (let i = 0; i < 3; i++) {
            const note = seedNote(deck.id, nt.id);
            createCard({
                user_id: USER, note_id: note.id, template_index: 0,
                state: 'review', due: new Date(Date.now() - 5 * 86_400_000).toISOString(),
                stability: 5, difficulty: 3, elapsed_days: 5, scheduled_days: 10, reps: 1, lapses: 0,
                last_review: null,
            });
        }

        const result = timeTravelExecute(3);
        expect(result.overdueCount).toBe(5);
    });

    it('inserts a time_travel_log row with correct values', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(100, deck.id, nt.id, 5);

        timeTravelExecute(3);

        type LogRow = { overdue_count: number; window_days: number; daily_target: number; triggered_at: string };
        const logs = testDb.prepare('SELECT * FROM time_travel_log').all() as LogRow[];
        expect(logs).toHaveLength(1);
        expect(logs[0].overdue_count).toBe(100);
        expect(logs[0].window_days).toBe(2);
        expect(logs[0].daily_target).toBe(50);
        expect(logs[0].triggered_at).toBeTruthy();
    });

    it('distributes unevenly when count is not divisible by windowDays', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        // 7 cards with target 50 → windowDays = 1, all on today
        // Use 51 cards → windowDays = ceil(51/50) = 2, batchSize = ceil(51/2) = 26
        // Day 0: cards 0-25 (26 cards), Day 1: cards 26-50 (25 cards)
        seedOverdueReviewCards(51, deck.id, nt.id, 5);

        const result = timeTravelExecute(3);
        expect(result.windowDays).toBe(2);

        const groups = testDb.prepare(
            "SELECT due, COUNT(*) as cnt FROM cards WHERE state = 'review' GROUP BY due ORDER BY due ASC",
        ).all() as { due: string; cnt: number }[];
        expect(groups).toHaveLength(2);
        expect(groups[0].cnt).toBe(26);
        expect(groups[1].cnt).toBe(25);
    });

    it('clamps daysBack to valid range', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        seedOverdueReviewCards(10, deck.id, nt.id, 5);

        // daysBack=0 should be clamped to 1
        const result = timeTravelPreview(0);
        // Cards are 5 days overdue, so even with daysBack=1 they should be detected
        expect(result.overdueCount).toBe(10);

        // daysBack=99 should be clamped to 7
        const result2 = timeTravelPreview(99);
        expect(result2.overdueCount).toBe(0); // 5 days overdue < 7 day threshold — not detected
    });
});
