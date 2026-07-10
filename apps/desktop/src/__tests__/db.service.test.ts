import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// ── In-memory test database ────────────────────────────────────────────────────
// service.ts calls getDb() on every operation — we mock the module so it returns
// our per-test in-memory instance rather than the Electron app database.

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
    fetchDecks,
    fetchDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    fetchDeckStats,
    fetchGlobalRetention,
    createNote,
    fetchNotesByDeck,
    createNoteType,
    createCard,
    insertReview,
    createDeckSession,
    createStudySession,
    completeDeckSession,
    fetchDueCardsCrossDeck,
    fetchDueCardsFocusedCrossDeck,
    fetchDeckRetentionBatch,
    fetchDeckYieldMix,
    fetchSessionAnalytics,
    fetchUserReviewHistory,
    fetchDrafts,
    saveDraft,
    deleteDraft,
} from '../main/db/service';

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
        fields: { Front: 'What is 2+2?', Back: '4' },
        tags: [],
    });
}

beforeEach(() => { testDb = setupDb(); });
afterEach(() => { testDb.close(); });

// ── Decks ─────────────────────────────────────────────────────────────────────

describe('decks', () => {
    it('createDeck persists and returns a deck', () => {
        const deck = createDeck({ user_id: USER, name: 'Anatomy', description: 'Bones', algorithm: 'fsrs', parent_id: null, anki_id: null });
        expect(deck.id).toBeTruthy();
        expect(deck.name).toBe('Anatomy');
        expect(deck.description).toBe('Bones');
        expect(deck.algorithm).toBe('fsrs');
        expect(deck.user_id).toBe(USER);
    });

    it('fetchDecks returns only decks for the given user', () => {
        createDeck({ user_id: USER, name: 'Mine', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
        createDeck({ user_id: 'other-user', name: 'Theirs', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
        const decks = fetchDecks(USER);
        expect(decks).toHaveLength(1);
        expect(decks[0].name).toBe('Mine');
    });

    it('fetchDeck returns null for a missing id', () => {
        expect(fetchDeck('nonexistent')).toBeNull();
    });

    it('updateDeck changes name', () => {
        const deck = seedDeck('Old Name');
        const updated = updateDeck(deck.id, { name: 'New Name' });
        expect(updated.name).toBe('New Name');
    });

    it('updateDeck persists algorithm change', () => {
        const deck = seedDeck();
        const updated = updateDeck(deck.id, { algorithm: 'sm2' });
        expect(updated.algorithm).toBe('sm2');
    });

    it('deleteDeck removes the deck', () => {
        const deck = seedDeck();
        deleteDeck(deck.id);
        expect(fetchDeck(deck.id)).toBeNull();
    });
});

// ── Deck Stats ────────────────────────────────────────────────────────────────

describe('fetchDeckStats', () => {
    it('returns zero counts for an empty deck', () => {
        const deck = seedDeck();
        const stats = fetchDeckStats(deck.id);
        expect(stats.totalCount).toBe(0);
        expect(stats.newCount).toBe(0);
        expect(stats.reviewCount).toBe(0);
        expect(stats.learningCount).toBe(0);
    });

    it('counts a new card correctly', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'new', due: new Date().toISOString(),
            stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
        });
        const stats = fetchDeckStats(deck.id);
        expect(stats.totalCount).toBe(1);
        expect(stats.newCount).toBe(1);
        expect(stats.reviewCount).toBe(0);
    });

    it('counts a due review card in reviewCount', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: yesterday,
            stability: 10, difficulty: 5, elapsed_days: 5,
            scheduled_days: 10, reps: 3, lapses: 0, last_review: yesterday,
        });
        const stats = fetchDeckStats(deck.id);
        expect(stats.reviewCount).toBe(1);
        expect(stats.newCount).toBe(0);
    });

    it('does not count a future review card in reviewCount', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const tomorrow = new Date(Date.now() + 86400000).toISOString();
        createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: tomorrow,
            stability: 10, difficulty: 5, elapsed_days: 5,
            scheduled_days: 10, reps: 3, lapses: 0, last_review: null,
        });
        const stats = fetchDeckStats(deck.id);
        expect(stats.reviewCount).toBe(0);
    });

    it('newTotal is the uncapped inventory; newCount respects the daily new limit (SEKEL-138)', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        for (let i = 0; i < 5; i++) {
            const note = seedNote(deck.id, nt.id);
            createCard({
                user_id: USER, note_id: note.id, template_index: 0,
                state: 'new', due: new Date().toISOString(),
                stability: 0, difficulty: 0, elapsed_days: 0,
                scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
            });
        }
        // Daily new limit of 2, nothing studied → newCount caps at 2, newTotal stays 5.
        const capped = fetchDeckStats(deck.id, USER, 2, 200);
        expect(capped.newTotal).toBe(5);
        expect(capped.newCount).toBe(2);
        // No limits → both equal the full inventory.
        const uncapped = fetchDeckStats(deck.id);
        expect(uncapped.newTotal).toBe(5);
        expect(uncapped.newCount).toBe(5);
    });
});

// ── Notes ─────────────────────────────────────────────────────────────────────

describe('notes', () => {
    it('createNote serializes fields and tags as JSON', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = createNote({
            user_id: USER, deck_id: deck.id, note_type_id: nt.id,
            fields: { Front: 'Q', Back: 'A' },
            tags: ['tag1', 'tag2'],
        });
        expect(note.fields).toEqual({ Front: 'Q', Back: 'A' });
        expect(note.tags).toEqual(['tag1', 'tag2']);
    });

    it('fetchNotesByDeck returns notes for the correct deck', () => {
        const nt = seedNoteType();
        const deck1 = seedDeck('Deck 1');
        const deck2 = seedDeck('Deck 2');
        createNote({ user_id: USER, deck_id: deck1.id, note_type_id: nt.id, fields: { Front: 'Q1', Back: 'A1' }, tags: [] });
        createNote({ user_id: USER, deck_id: deck2.id, note_type_id: nt.id, fields: { Front: 'Q2', Back: 'A2' }, tags: [] });
        const notes = fetchNotesByDeck(deck1.id);
        expect(notes).toHaveLength(1);
        expect(notes[0].fields).toEqual({ Front: 'Q1', Back: 'A1' });
    });
});

// ── Note Types ────────────────────────────────────────────────────────────────

describe('createNoteType', () => {
    it('serializes and deserializes fields and card_templates', () => {
        const nt = createNoteType({
            user_id: USER,
            name: 'Cloze',
            fields: [{ name: 'Text' }],
            card_templates: [{ name: 'Cloze', front_template: '{{cloze:Text}}', back_template: '{{cloze:Text}}' }],
        });
        expect(nt.fields).toEqual([{ name: 'Text' }]);
        expect(nt.card_templates[0].name).toBe('Cloze');
    });

    it('creates a note type without anki_id (backward compat)', () => {
        const nt = seedNoteType();
        expect(nt.anki_id).toBeNull();
    });

    it('creates a note type with anki_id', () => {
        const nt = createNoteType({
            user_id: USER,
            name: 'Basic',
            fields: [{ name: 'Front' }, { name: 'Back' }],
            card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
            anki_id: 1234567890,
        });
        expect(nt.anki_id).toBe(1234567890);
    });

    it('allows multiple note types with anki_id = null for the same user', () => {
        seedNoteType();
        expect(() => seedNoteType()).not.toThrow();
    });

    it('rejects two note types with the same user_id and anki_id', () => {
        createNoteType({
            user_id: USER,
            name: 'Basic',
            fields: [{ name: 'Front' }, { name: 'Back' }],
            card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
            anki_id: 111,
        });
        expect(() => createNoteType({
            user_id: USER,
            name: 'Basic Duplicate',
            fields: [{ name: 'Front' }, { name: 'Back' }],
            card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
            anki_id: 111,
        })).toThrow();
    });
});

// ── Cards ─────────────────────────────────────────────────────────────────────

describe('createCard', () => {
    function seedCard(overrides: { anki_id?: number | null; ease_factor?: number | null } = {}) {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        return createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'new', due: new Date().toISOString(),
            stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
            ...overrides,
        });
    }

    it('creates a card without anki_id and ease_factor (backward compat)', () => {
        const card = seedCard();
        expect(card.anki_id).toBeNull();
        expect(card.ease_factor).toBeNull();
    });

    it('creates a card with anki_id and ease_factor populated', () => {
        const card = seedCard({ anki_id: 9876543210, ease_factor: 2500 });
        expect(card.anki_id).toBe(9876543210);
        expect(card.ease_factor).toBe(2500);
    });

    it('allows multiple cards with anki_id = null for the same user', () => {
        seedCard();
        expect(() => seedCard()).not.toThrow();
    });

    it('rejects two cards with the same user_id and anki_id', () => {
        seedCard({ anki_id: 111 });
        expect(() => seedCard({ anki_id: 111 })).toThrow();
    });

    it('accepts typical SM-2 ease_factor values', () => {
        expect(seedCard({ ease_factor: 1300 }).ease_factor).toBe(1300);
        expect(seedCard({ ease_factor: 2500 }).ease_factor).toBe(2500);
        expect(seedCard({ ease_factor: 3100 }).ease_factor).toBe(3100);
    });
});

// ── Reviews ───────────────────────────────────────────────────────────────────

describe('insertReview', () => {
    function seedReview(overrides: { interval_before?: number | null; ease_factor_after?: number | null; review_type?: number | null } = {}) {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        return insertReview({
            user_id: USER, card_id: card.id, rating: 'good',
            state_before: 'review', stability_before: 5, difficulty_before: 5,
            state_after: 'review', stability_after: 6, difficulty_after: 5,
            scheduled_days: 7, session_id: session.id, deck_id: deck.id, review_index: 0,
            ...overrides,
        });
    }

    it('creates a review without import fields (backward compat)', () => {
        const r = seedReview();
        expect(r.interval_before).toBeNull();
        expect(r.ease_factor_after).toBeNull();
        expect(r.review_type).toBeNull();
    });

    it('creates a review with all three import fields populated', () => {
        const r = seedReview({ interval_before: 7, ease_factor_after: 2500, review_type: 1 });
        expect(r.interval_before).toBe(7);
        expect(r.ease_factor_after).toBe(2500);
        expect(r.review_type).toBe(1);
    });

    it('accepts typical interval_before day values', () => {
        expect(seedReview({ interval_before: 1 }).interval_before).toBe(1);
        expect(seedReview({ interval_before: 7 }).interval_before).toBe(7);
        expect(seedReview({ interval_before: 30 }).interval_before).toBe(30);
        expect(seedReview({ interval_before: 365 }).interval_before).toBe(365);
    });

    it('accepts typical SM-2 ease_factor_after values', () => {
        expect(seedReview({ ease_factor_after: 1300 }).ease_factor_after).toBe(1300);
        expect(seedReview({ ease_factor_after: 2500 }).ease_factor_after).toBe(2500);
        expect(seedReview({ ease_factor_after: 3100 }).ease_factor_after).toBe(3100);
    });

    it('accepts review_type values 0 through 3', () => {
        expect(seedReview({ review_type: 0 }).review_type).toBe(0);
        expect(seedReview({ review_type: 1 }).review_type).toBe(1);
        expect(seedReview({ review_type: 2 }).review_type).toBe(2);
        expect(seedReview({ review_type: 3 }).review_type).toBe(3);
    });
});

// ── Reviews and Global Retention ─────────────────────────────────────────────

describe('fetchGlobalRetention', () => {
    it('returns null with no reviews', () => {
        expect(fetchGlobalRetention(USER)).toBeNull();
    });

    it('returns 100 when all reviews are non-again', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        const baseReview = {
            user_id: USER, card_id: card.id,
            state_before: 'new' as const, stability_before: 0, difficulty_before: 0,
            state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
            scheduled_days: 5, session_id: session.id, deck_id: deck.id, review_index: 0,
        };
        insertReview({ ...baseReview, rating: 'good' });
        insertReview({ ...baseReview, rating: 'easy', review_index: 1 });
        expect(fetchGlobalRetention(USER)).toBe(100);
    });

    it('returns 50 when half the reviews are again', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        const base = {
            user_id: USER, card_id: card.id,
            state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
            state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
            scheduled_days: 5, session_id: session.id, deck_id: deck.id,
        };
        insertReview({ ...base, rating: 'again', review_index: 0 });
        insertReview({ ...base, rating: 'good', review_index: 1 });
        expect(fetchGlobalRetention(USER)).toBe(50);
    });
});

// ── Review history ────────────────────────────────────────────────────────────

describe('fetchUserReviewHistory', () => {
    it('groups reviews by date', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        const base = {
            user_id: USER, card_id: card.id,
            state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
            state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
            scheduled_days: 5, session_id: session.id, deck_id: deck.id,
        };
        insertReview({ ...base, rating: 'good', review_index: 0 });
        insertReview({ ...base, rating: 'easy', review_index: 1 });

        const history = fetchUserReviewHistory(USER, 365);
        expect(history.length).toBe(1); // both reviews are on same day
        expect(history[0].count).toBe(2);
        expect(history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns empty array with no reviews', () => {
        expect(fetchUserReviewHistory(USER, 365)).toEqual([]);
    });
});

// ── Session Analytics ─────────────────────────────────────────────────────────

describe('fetchSessionAnalytics', () => {
    it('returns null for an in-progress session', () => {
        const deck = seedDeck();
        const session = createDeckSession(USER, deck.id);
        expect(fetchSessionAnalytics(session.id)).toBeNull();
    });

    it('returns empty analytics for a completed session with no reviews', () => {
        const deck = seedDeck();
        const session = createDeckSession(USER, deck.id);
        completeDeckSession(session.id);
        const analytics = fetchSessionAnalytics(session.id);
        expect(analytics).not.toBeNull();
        expect(analytics!.retentionTrend).toEqual([]);
        expect(analytics!.lapseStats.totalReviews).toBe(0);
    });

    it('calculates retention trend correctly', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        const base = {
            user_id: USER, card_id: card.id,
            state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
            state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
            scheduled_days: 5, session_id: session.id, deck_id: deck.id,
        };
        insertReview({ ...base, rating: 'good', review_index: 0 });
        insertReview({ ...base, rating: 'again', review_index: 1 });
        completeDeckSession(session.id);

        const analytics = fetchSessionAnalytics(session.id);
        expect(analytics!.lapseStats.totalReviews).toBe(2);
        expect(analytics!.lapseStats.lapseCount).toBe(1);
        expect(analytics!.lapseStats.lapseRate).toBe(50);
        expect(analytics!.retentionTrend).toHaveLength(2);
        // After first good review: 1/1 = 1.0
        expect(analytics!.retentionTrend[0].retentionRate).toBe(1);
        // After second again: 1/2 = 0.5
        expect(analytics!.retentionTrend[1].retentionRate).toBe(0.5);
    });

    it('rating distribution sums to totalReviews', () => {
        const nt = seedNoteType();
        const deck = seedDeck();
        const note = seedNote(deck.id, nt.id);
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state: 'review', due: new Date().toISOString(),
            stability: 5, difficulty: 5, elapsed_days: 1,
            scheduled_days: 5, reps: 1, lapses: 0, last_review: null,
        });
        const session = createDeckSession(USER, deck.id);
        const base = {
            user_id: USER, card_id: card.id,
            state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
            state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
            scheduled_days: 5, session_id: session.id, deck_id: deck.id,
        };
        insertReview({ ...base, rating: 'again', review_index: 0 });
        insertReview({ ...base, rating: 'hard', review_index: 1 });
        insertReview({ ...base, rating: 'good', review_index: 2 });
        insertReview({ ...base, rating: 'easy', review_index: 3 });
        completeDeckSession(session.id);

        const analytics = fetchSessionAnalytics(session.id);
        const totalFromDist = analytics!.ratingDistribution.reduce((sum, r) => sum + r.count, 0);
        expect(totalFromDist).toBe(4);
    });
});

// ── Cross-deck study (SEKEL-137) ────────────────────────────────────────────────

describe('cross-deck study', () => {
    function seedReviewCard(deckId: string, ntId: string, userId = USER) {
        const note = createNote({ user_id: userId, deck_id: deckId, note_type_id: ntId, fields: { Front: 'Q', Back: 'A' }, tags: [] });
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        return createCard({
            user_id: userId, note_id: note.id, template_index: 0,
            state: 'review', due: yesterday,
            stability: 10, difficulty: 5, elapsed_days: 5,
            scheduled_days: 10, reps: 3, lapses: 0, last_review: yesterday,
        });
    }

    function seedNewCard(deckId: string, ntId: string, userId = USER) {
        const note = createNote({ user_id: userId, deck_id: deckId, note_type_id: ntId, fields: { Front: 'Q', Back: 'A' }, tags: [] });
        return createCard({
            user_id: userId, note_id: note.id, template_index: 0,
            state: 'new', due: new Date().toISOString(),
            stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
        });
    }

    function seedBlueprint() {
        const now = new Date().toISOString();
        testDb.prepare(`INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, 'step1', 'USMLE Step 1', ?)`).run(now);
        testDb.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (10, 1, 'cardio', 'Cardiovascular', 5, 10)`).run();
        testDb.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (11, 1, 'resp', 'Respiratory', 5, 10)`).run();
    }

    function classifyCard(cardId: string, systemId: number) {
        testDb.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, classified_at) VALUES (?, 1, ?, ?)`)
            .run(cardId, systemId, new Date().toISOString());
    }

    it('fetchDueCardsCrossDeck pools due cards across every owned deck when deckIds is null', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        seedReviewCard(deckA.id, nt.id);
        seedReviewCard(deckB.id, nt.id);
        const cards = fetchDueCardsCrossDeck(USER, null);
        expect(cards).toHaveLength(2);
        expect(new Set(cards.map(c => c.note.deck_id))).toEqual(new Set([deckA.id, deckB.id]));
    });

    it('fetchDueCardsCrossDeck scopes to the provided deck ids', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        seedReviewCard(deckA.id, nt.id);
        seedReviewCard(deckB.id, nt.id);
        const cards = fetchDueCardsCrossDeck(USER, [deckA.id]);
        expect(cards).toHaveLength(1);
        expect(cards[0].note.deck_id).toBe(deckA.id);
    });

    it('fetchDueCardsCrossDeck ignores decks owned by another user', () => {
        const nt = seedNoteType();
        const mine = seedDeck('Mine');
        seedReviewCard(mine.id, nt.id);
        const otherNt = seedNoteType('other-user');
        const theirs = seedDeck('Theirs', 'other-user');
        seedReviewCard(theirs.id, otherNt.id, 'other-user');
        const cards = fetchDueCardsCrossDeck(USER, null);
        expect(cards).toHaveLength(1);
        expect(cards[0].note.deck_id).toBe(mine.id);
    });

    it('interleaves the pooled queue as learning → new → review', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        seedNewCard(deckA.id, nt.id);
        seedReviewCard(deckA.id, nt.id);
        const learningNote = createNote({ user_id: USER, deck_id: deckB.id, note_type_id: nt.id, fields: { Front: 'Q', Back: 'A' }, tags: [] });
        createCard({
            user_id: USER, note_id: learningNote.id, template_index: 0,
            state: 'learning', due: new Date().toISOString(),
            stability: 1, difficulty: 5, elapsed_days: 0,
            scheduled_days: 0, reps: 1, lapses: 0, last_review: null,
        });
        const cards = fetchDueCardsCrossDeck(USER, null);
        expect(cards).toHaveLength(3);
        expect(cards[0].state).toBe('learning');
        expect(cards[1].state).toBe('new');
        expect(cards[2].state).toBe('review');
    });

    it('applies daily new limits per deck — one deck cannot exhaust another\'s budget', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        // Deck A: two new cards, one already studied today (state_before = 'new').
        const a1 = seedNewCard(deckA.id, nt.id);
        seedNewCard(deckA.id, nt.id);
        const sessA = createDeckSession(USER, deckA.id);
        insertReview({
            user_id: USER, card_id: a1.id, rating: 'good',
            state_before: 'new', stability_before: 0, difficulty_before: 0,
            state_after: 'learning', stability_after: 1, difficulty_after: 5,
            scheduled_days: 0, session_id: sessA.id, deck_id: deckA.id, review_index: 0,
        });
        // Deck B: two fresh new cards, nothing studied today.
        seedNewCard(deckB.id, nt.id);
        seedNewCard(deckB.id, nt.id);

        // Daily new limit = 1. Deck A already spent its 1 (0 remaining); Deck B keeps its own.
        const cards = fetchDueCardsCrossDeck(USER, null, 1, 200);
        const perDeck = cards.reduce<Record<string, number>>((acc, c) => {
            acc[c.note.deck_id] = (acc[c.note.deck_id] ?? 0) + 1;
            return acc;
        }, {});
        expect(perDeck[deckA.id] ?? 0).toBe(0);
        expect(perDeck[deckB.id] ?? 0).toBe(1);
    });

    it('fetchDueCardsFocusedCrossDeck returns only weak-system cards, spanning decks', () => {
        seedBlueprint();
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        const cardio = seedReviewCard(deckA.id, nt.id);       // weak system, deck A
        const resp = seedReviewCard(deckB.id, nt.id);         // weak system, deck B
        const unclassified = seedReviewCard(deckB.id, nt.id); // no classification
        classifyCard(cardio.id, 10);
        classifyCard(resp.id, 11);

        const cards = fetchDueCardsFocusedCrossDeck(USER, null, ['cardio', 'resp'], 'step1');
        const ids = new Set(cards.map(c => c.id));
        expect(cards).toHaveLength(2);
        expect(ids.has(cardio.id)).toBe(true);
        expect(ids.has(resp.id)).toBe(true);
        expect(ids.has(unclassified.id)).toBe(false);
    });

    it('createDeckSession defaults kind to "deck" with null scope/system_keys', () => {
        const deck = seedDeck();
        const session = createDeckSession(USER, deck.id);
        expect(session.kind).toBe('deck');
        expect(session.scope).toBeNull();
        expect(session.system_keys).toBeNull();
    });

    it('createStudySession persists kind, scope and system_keys', () => {
        const deck = seedDeck();
        const reviewAll = createStudySession(USER, 'review_all', deck.id, 'all', null);
        expect(reviewAll.kind).toBe('review_all');
        expect(reviewAll.scope).toBe('all');
        expect(reviewAll.system_keys).toBeNull();

        const focused = createStudySession(USER, 'focused', deck.id, 'plan', ['cardio', 'resp']);
        expect(focused.kind).toBe('focused');
        expect(focused.scope).toBe('plan');
        expect(focused.system_keys).toBe(JSON.stringify(['cardio', 'resp']));
    });

    it('session analytics resolve by session_id across multiple decks', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        const cardA = seedReviewCard(deckA.id, nt.id);
        const cardB = seedReviewCard(deckB.id, nt.id);
        // Representative deck is A, but reviews carry their own real deck_id.
        const session = createStudySession(USER, 'review_all', deckA.id, 'all', null);
        const base = {
            user_id: USER, session_id: session.id,
            state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
            state_after: 'review' as const, stability_after: 6, difficulty_after: 5,
            scheduled_days: 7,
        };
        insertReview({ ...base, card_id: cardA.id, deck_id: deckA.id, rating: 'good', review_index: 0 });
        insertReview({ ...base, card_id: cardB.id, deck_id: deckB.id, rating: 'again', review_index: 1 });
        completeDeckSession(session.id);

        const analytics = fetchSessionAnalytics(session.id);
        expect(analytics!.lapseStats.totalReviews).toBe(2);
        expect(analytics!.lapseStats.lapseCount).toBe(1);
    });
});

// ── Deck metrics: retention + yield mix (SEKEL-138) ─────────────────────────────

describe('deck metrics', () => {
    function seedCardInDeck(deckId: string, ntId: string, state: 'new' | 'review' = 'new') {
        const note = createNote({ user_id: USER, deck_id: deckId, note_type_id: ntId, fields: { Front: 'Q', Back: 'A' }, tags: [] });
        return createCard({
            user_id: USER, note_id: note.id, template_index: 0,
            state, due: new Date().toISOString(),
            stability: state === 'review' ? 5 : 0, difficulty: state === 'review' ? 5 : 0,
            elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
        });
    }

    const reviewBase = {
        user_id: USER,
        state_before: 'review' as const, stability_before: 5, difficulty_before: 5,
        state_after: 'review' as const, stability_after: 5, difficulty_after: 5,
        scheduled_days: 5,
    };

    it('fetchDeckRetentionBatch returns per-deck non-again / total', () => {
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        const cardA = seedCardInDeck(deckA.id, nt.id, 'review');
        const cardB = seedCardInDeck(deckB.id, nt.id, 'review');
        const sessA = createDeckSession(USER, deckA.id);
        const sessB = createDeckSession(USER, deckB.id);
        // Deck A: 3 reviews, 1 again → 2/3.
        insertReview({ ...reviewBase, card_id: cardA.id, deck_id: deckA.id, session_id: sessA.id, rating: 'good', review_index: 0 });
        insertReview({ ...reviewBase, card_id: cardA.id, deck_id: deckA.id, session_id: sessA.id, rating: 'again', review_index: 1 });
        insertReview({ ...reviewBase, card_id: cardA.id, deck_id: deckA.id, session_id: sessA.id, rating: 'easy', review_index: 2 });
        // Deck B: 1 review, good → 1/1.
        insertReview({ ...reviewBase, card_id: cardB.id, deck_id: deckB.id, session_id: sessB.id, rating: 'good', review_index: 0 });

        const byDeck = new Map(fetchDeckRetentionBatch([deckA.id, deckB.id], USER, 30).map(r => [r.deckId, r]));
        expect(byDeck.get(deckA.id)).toEqual({ deckId: deckA.id, nonAgain: 2, total: 3 });
        expect(byDeck.get(deckB.id)).toEqual({ deckId: deckB.id, nonAgain: 1, total: 1 });
    });

    it('fetchDeckRetentionBatch excludes reviews older than the window', () => {
        const nt = seedNoteType();
        const deck = seedDeck('A');
        const card = seedCardInDeck(deck.id, nt.id, 'review');
        const sess = createDeckSession(USER, deck.id);
        const r = insertReview({ ...reviewBase, card_id: card.id, deck_id: deck.id, session_id: sess.id, rating: 'good', review_index: 0 });
        const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
        testDb.prepare('UPDATE reviews SET review_time = ? WHERE id = ?').run(old, r.id);

        expect(fetchDeckRetentionBatch([deck.id], USER, 30)).toHaveLength(0);
    });

    // Weight averages chosen so score = avg·rel·conf·split·100 lands cleanly in each bucket:
    // 0.8→80 (high ≥70), 0.5→50 (medium ≥40), 0.2→20 (low <40).
    function seedYieldBlueprint() {
        const now = new Date().toISOString();
        testDb.prepare(`INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, 'step1', 'Step 1', ?)`).run(now);
        testDb.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (10, 1, 'sh', 'High', 0.8, 0.8)`).run();
        testDb.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (11, 1, 'sm', 'Med', 0.5, 0.5)`).run();
        testDb.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (12, 1, 'sl', 'Low', 0.2, 0.2)`).run();
        testDb.prepare(`INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (100, 10, 'th', 'th', 1.0)`).run();
        testDb.prepare(`INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (101, 11, 'tm', 'tm', 1.0)`).run();
        testDb.prepare(`INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (102, 12, 'tl', 'tl', 1.0)`).run();
    }
    function classify(cardId: string, systemId: number, topicId: number, confidence = 1.0) {
        testDb.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at) VALUES (?, 1, ?, ?, ?, 1.0, ?)`)
            .run(cardId, systemId, topicId, confidence, new Date().toISOString());
    }

    it('fetchDeckYieldMix buckets classified cards by level per deck', () => {
        seedYieldBlueprint();
        const nt = seedNoteType();
        const deckA = seedDeck('A');
        const deckB = seedDeck('B');
        const cardH = seedCardInDeck(deckA.id, nt.id);
        const cardM = seedCardInDeck(deckA.id, nt.id);
        const cardL = seedCardInDeck(deckB.id, nt.id);
        const cardUnconf = seedCardInDeck(deckB.id, nt.id);
        seedCardInDeck(deckB.id, nt.id); // no classification at all
        classify(cardH.id, 10, 100);
        classify(cardM.id, 11, 101);
        classify(cardL.id, 12, 102);
        classify(cardUnconf.id, 10, 100, 0.3); // confidence < 0.5 → excluded from every bucket

        const byDeck = new Map(fetchDeckYieldMix([deckA.id, deckB.id], 'step1').map(m => [m.deckId, m]));
        expect(byDeck.get(deckA.id)).toEqual({ deckId: deckA.id, high: 1, medium: 1, low: 0 });
        expect(byDeck.get(deckB.id)).toEqual({ deckId: deckB.id, high: 0, medium: 0, low: 1 });
    });
});

// ── Drafts ────────────────────────────────────────────────────────────────────

describe('drafts', () => {
    it('saveDraft and fetchDrafts round-trips', () => {
        saveDraft(USER, { front: 'What is ATP?', back: 'Energy currency' });
        const drafts = fetchDrafts(USER);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].front).toBe('What is ATP?');
        expect(drafts[0].back).toBe('Energy currency');
    });

    it('deleteDraft removes the draft', () => {
        const draft = saveDraft(USER, { front: 'Q', back: 'A' });
        deleteDraft(draft.id);
        expect(fetchDrafts(USER)).toHaveLength(0);
    });
});

