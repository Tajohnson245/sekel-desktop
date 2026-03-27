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
    completeDeckSession,
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

