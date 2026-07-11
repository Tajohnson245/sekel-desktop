import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
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

import { executeImport } from '../main/import/insertionEngine';
import type {
    AnkiCollection,
    AnkiModel,
    AnkiDeck,
    AnkiNote,
    AnkiCard,
    AnkiReviewLog,
    ImportOptions,
    ImportOptionsDeck,
} from '../main/import/types';

// ── DB setup ──────────────────────────────────────────────────────────────────

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

const USER = 'user-test-insertion';

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeModel(id: number, name: string = 'Basic'): AnkiModel {
    return {
        id,
        name,
        flds: [
            { ord: 0, name: 'Front', sticky: false, font: 'Arial', size: 20 },
            { ord: 1, name: 'Back', sticky: false, font: 'Arial', size: 20 },
        ],
        tmpls: [{ ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
        css: '',
        type: 0,
        mod: 1700000000,
    };
}

function makeDeck(id: number, name: string): AnkiDeck {
    return {
        id,
        name,
        nameComponents: name.split('::'),
        conf: 1,
        mod: 1700000000,
        collapsed: false,
    };
}

function makeNote(id: number, mid: number, guid?: string): AnkiNote {
    return {
        id,
        guid: guid ?? `guid-${id}`,
        mid,
        fields: { Front: `Question ${id}`, Back: `Answer ${id}` },
        rawFlds: `Question ${id}\x1fAnswer ${id}`,
        tags: [],
        mod: 1700000000,
    };
}

function makeCard(id: number, nid: number, did: number, opts: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id, nid, did, ord: 0,
        type: 0, queue: 0, due: 1,
        ivl: 0, factor: 2500, reps: 0, lapses: 0, mod: 1700000000,
        ...opts,
    };
}

function makeRevlog(id: number, cid: number, opts: Partial<AnkiReviewLog> = {}): AnkiReviewLog {
    return {
        id,
        cid,
        ease: 3,
        ivl: 7,
        lastIvl: 3,
        factor: 2500,
        time: 5000,
        type: 1,
        ...opts,
    };
}

function makeCollection(opts: {
    decks?: AnkiDeck[];
    models?: AnkiModel[];
    notes?: AnkiNote[];
    cards?: AnkiCard[];
    revlog?: AnkiReviewLog[];
}): AnkiCollection {
    const decks = new Map<number, AnkiDeck>();
    decks.set(1, makeDeck(1, 'Default'));
    for (const d of opts.decks ?? []) decks.set(d.id, d);
    const models = new Map<number, AnkiModel>();
    for (const m of opts.models ?? []) models.set(m.id, m);
    const notes = new Map<number, AnkiNote>();
    for (const n of opts.notes ?? []) notes.set(n.id, n);
    return {
        decks,
        models,
        deckConfigs: new Map(),
        notes,
        cards: opts.cards ?? [],
        revlog: opts.revlog ?? [],
        warnings: [],
    };
}

function makeDeckOption(ankiDeckId: number, opts: Partial<ImportOptionsDeck> = {}): ImportOptionsDeck {
    return {
        ankiDeckId,
        deckName: `Deck ${ankiDeckId}`,
        selected: true,
        scheduling: 'fresh',
        algorithm: 'fsrs',
        conflict: null,
        ...opts,
    };
}

function makeOptions(collection: AnkiCollection, deckOpts: ImportOptionsDeck[]): ImportOptions {
    return { parsedData: collection, decks: deckOpts, hierarchyMode: 'subdecks', mediaMap: {}, mediaFilePaths: [], tempDir: '/tmp/test', userId: USER };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => { testDb = setupDb(); });
afterEach(() => { testDb.close(); });

describe('executeImport — basic insertion', () => {
    it('creates a deck, note type, note, and card; returns correct counts', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Science');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001)]), USER);

        expect(result.decksCreated).toBe(1);
        expect(result.decksSkipped).toBe(0);
        expect(result.notesInserted).toBe(1);
        expect(result.cardsInserted).toBe(1);
        expect(result.reviewsInserted).toBe(0);

        const decks = testDb.prepare("SELECT * FROM decks WHERE user_id = ?").all(USER) as { anki_id: number }[];
        expect(decks).toHaveLength(1);
        expect(decks[0].anki_id).toBe(2001);
    });

    it('returns zero counts when no decks are selected', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Science');
        const collection = makeCollection({ decks: [deck], models: [model] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001, { selected: false })]), USER);

        expect(result.decksCreated).toBe(0);
        expect(result.cardsInserted).toBe(0);
    });

    it('creates two cards from a multi-template note type', () => {
        const model: AnkiModel = {
            ...makeModel(1001),
            tmpls: [
                { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}' },
                { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{Front}}' },
            ],
        };
        const deck = makeDeck(2001, 'Language');
        const note = makeNote(3001, 1001);
        const card1 = makeCard(4001, 3001, 2001, { ord: 0 });
        const card2 = makeCard(4002, 3001, 2001, { ord: 1 });
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card1, card2] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001)]), USER);

        expect(result.notesInserted).toBe(1);
        expect(result.cardsInserted).toBe(2);
    });

    it('deduplicates note types by anki_id across two decks', () => {
        const model = makeModel(1001);
        const deck1 = makeDeck(2001, 'Math');
        const deck2 = makeDeck(2002, 'Physics');
        const note1 = makeNote(3001, 1001);
        const note2 = makeNote(3002, 1001);
        const card1 = makeCard(4001, 3001, 2001);
        const card2 = makeCard(4002, 3002, 2002);
        const collection = makeCollection({
            decks: [deck1, deck2],
            models: [model],
            notes: [note1, note2],
            cards: [card1, card2],
        });

        executeImport(makeOptions(collection, [
            makeDeckOption(2001),
            makeDeckOption(2002),
        ]), USER);

        const noteTypes = testDb.prepare("SELECT * FROM note_types WHERE user_id = ?").all(USER);
        expect(noteTypes).toHaveLength(1);
    });
});

describe('executeImport — deck hierarchy', () => {
    it('creates parent before child and links parent_id correctly', () => {
        const model = makeModel(1001);
        const parent = makeDeck(2001, 'Science');
        const child = makeDeck(2002, 'Science::Biology');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2002);
        const collection = makeCollection({
            decks: [parent, child],
            models: [model],
            notes: [note],
            cards: [card],
        });

        executeImport(makeOptions(collection, [
            makeDeckOption(2001),
            makeDeckOption(2002),
        ]), USER);

        type DeckRow = { id: string; name: string; parent_id: string | null; anki_id: number };
        const decks = testDb.prepare("SELECT id, name, parent_id, anki_id FROM decks WHERE user_id = ?").all(USER) as DeckRow[];
        const parentRow = decks.find(d => d.anki_id === 2001)!;
        const childRow = decks.find(d => d.anki_id === 2002)!;
        expect(childRow.parent_id).toBe(parentRow.id);
    });
});

describe('executeImport — conflict strategies', () => {
    function seedExistingDeck() {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });
        executeImport(makeOptions(collection, [makeDeckOption(2001)]), USER);
    }

    it('skip: skips the deck and does not insert new notes', () => {
        seedExistingDeck();

        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const note = makeNote(3002, 1001); // new note
        const card = makeCard(4002, 3002, 2001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001, { conflict: 'skip' })]), USER);

        expect(result.decksSkipped).toBe(1);
        const notes = testDb.prepare("SELECT * FROM notes WHERE user_id = ?").all(USER);
        expect(notes).toHaveLength(1); // original only
    });

    it('overwrite: deletes existing notes/cards and inserts new ones', () => {
        seedExistingDeck();

        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const note = makeNote(3002, 1001);
        const card = makeCard(4002, 3002, 2001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { conflict: 'overwrite' })]), USER);

        type NoteRow = { anki_id: number };
        const notes = testDb.prepare("SELECT anki_id FROM notes WHERE user_id = ?").all(USER) as NoteRow[];
        expect(notes).toHaveLength(1);
        expect(notes[0].anki_id).toBe(3002);
    });

    it('merge: only inserts notes with new anki_guid, skips existing guids', () => {
        seedExistingDeck();

        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const existingNote = makeNote(3001, 1001, 'guid-3001'); // same guid as seeded
        const newNote = makeNote(3003, 1001, 'guid-3003');      // new guid
        const card1 = makeCard(4001, 3001, 2001);
        const card2 = makeCard(4003, 3003, 2001);
        const collection = makeCollection({
            decks: [deck],
            models: [model],
            notes: [existingNote, newNote],
            cards: [card1, card2],
        });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { conflict: 'merge' })]), USER);

        type NoteRow = { anki_id: number };
        const notes = testDb.prepare("SELECT anki_id FROM notes WHERE user_id = ?").all(USER) as NoteRow[];
        // Original (3001) + new (3003) only
        expect(notes).toHaveLength(2);
        expect(notes.map(n => n.anki_id).sort()).toEqual([3001, 3003]);
    });
});

describe('executeImport — scheduling', () => {
    it('fresh: all cards inserted with state=new and zero stability', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Bio');
        const note = makeNote(3001, 1001);
        // Card has type=2 (review) to prove fresh overrides it
        const card = makeCard(4001, 3001, 2001, { type: 2, ivl: 30, factor: 2500, due: 1000 });
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'fresh' })]), USER);

        type CardRow = { state: string; stability: number; reps: number };
        const cards = testDb.prepare("SELECT state, stability, reps FROM cards WHERE user_id = ?").all(USER) as CardRow[];
        expect(cards[0].state).toBe('new');
        expect(cards[0].stability).toBe(0);
    });

    it('keep: review card WITH history retains state=review and non-zero stability', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Bio');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001, { type: 2, ivl: 30, factor: 2500, due: 19500 }); // review card
        const revlog = makeRevlog(1700000000000, 4001, { ease: 3, ivl: 30, lastIvl: 15, type: 1 });
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: [revlog] });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'keep' })]), USER);

        type CardRow = { state: string; stability: number };
        const cards = testDb.prepare("SELECT state, stability FROM cards WHERE user_id = ?").all(USER) as CardRow[];
        expect(cards[0].state).toBe('review');
        expect(cards[0].stability).toBe(30);
    });

    it('keep: review card with NO history imports as new (SEKEL-138)', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Bio');
        const note = makeNote(3001, 1001);
        // type=2 (review) but no revlog anywhere → "no data" → should reset to new.
        const card = makeCard(4001, 3001, 2001, { type: 2, ivl: 30, factor: 2500, due: 19500 });
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card] });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'keep' })]), USER);

        type CardRow = { state: string; stability: number };
        const cards = testDb.prepare("SELECT state, stability FROM cards WHERE user_id = ?").all(USER) as CardRow[];
        expect(cards[0].state).toBe('new');
        expect(cards[0].stability).toBe(0);
    });
});

describe('executeImport — review log insertion', () => {
    it('inserts review logs when scheduling=keep', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001, { type: 2, ivl: 7, factor: 2500 });
        const revlog = makeRevlog(1700000000000, 4001, { ease: 3, ivl: 7, lastIvl: 3, type: 1 });
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: [revlog] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'keep' })]), USER);

        expect(result.reviewsInserted).toBe(1);
        const reviews = testDb.prepare("SELECT * FROM reviews WHERE user_id = ?").all(USER);
        expect(reviews).toHaveLength(1);
    });

    it('does not insert review logs when scheduling=fresh', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'History');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        const revlog = makeRevlog(1700000000000, 4001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: [revlog] });

        const result = executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'fresh' })]), USER);

        expect(result.reviewsInserted).toBe(0);
        const reviews = testDb.prepare("SELECT * FROM reviews WHERE user_id = ?").all(USER);
        expect(reviews).toHaveLength(0);
    });

    it('maps Anki ease correctly to rating', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Vocab');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        // Four revlog entries with each ease value
        const revlogs = [
            makeRevlog(1700000001000, 4001, { ease: 1 }),
            makeRevlog(1700000002000, 4001, { ease: 2 }),
            makeRevlog(1700000003000, 4001, { ease: 3 }),
            makeRevlog(1700000004000, 4001, { ease: 4 }),
        ];
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: revlogs });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'keep' })]), USER);

        type ReviewRow = { rating: string; review_time: string };
        const reviews = testDb.prepare("SELECT rating, review_time FROM reviews WHERE user_id = ? ORDER BY review_time ASC").all(USER) as ReviewRow[];
        expect(reviews.map(r => r.rating)).toEqual(['again', 'hard', 'good', 'easy']);
    });

    it('does not insert reviews for a non-selected deck', () => {
        const model = makeModel(1001);
        const deck1 = makeDeck(2001, 'Selected');
        const deck2 = makeDeck(2002, 'Skipped');
        const note1 = makeNote(3001, 1001);
        const note2 = makeNote(3002, 1001);
        const card1 = makeCard(4001, 3001, 2001);
        const card2 = makeCard(4002, 3002, 2002);
        const revlog1 = makeRevlog(1700000001000, 4001);
        const revlog2 = makeRevlog(1700000002000, 4002); // belongs to skipped deck
        const collection = makeCollection({
            decks: [deck1, deck2],
            models: [model],
            notes: [note1, note2],
            cards: [card1, card2],
            revlog: [revlog1, revlog2],
        });

        const result = executeImport(makeOptions(collection, [
            makeDeckOption(2001, { scheduling: 'keep' }),
            makeDeckOption(2002, { selected: false }),
        ]), USER);

        expect(result.reviewsInserted).toBe(1);
    });

    it('does not insert reviews for a fresh-scheduling deck even if another deck uses keep', () => {
        const model = makeModel(1001);
        const deckKeep = makeDeck(2001, 'Keep');
        const deckFresh = makeDeck(2002, 'Fresh');
        const note1 = makeNote(3001, 1001);
        const note2 = makeNote(3002, 1001);
        const card1 = makeCard(4001, 3001, 2001);
        const card2 = makeCard(4002, 3002, 2002);
        const revlog1 = makeRevlog(1700000001000, 4001);
        const revlog2 = makeRevlog(1700000002000, 4002);
        const collection = makeCollection({
            decks: [deckKeep, deckFresh],
            models: [model],
            notes: [note1, note2],
            cards: [card1, card2],
            revlog: [revlog1, revlog2],
        });

        const result = executeImport(makeOptions(collection, [
            makeDeckOption(2001, { scheduling: 'keep' }),
            makeDeckOption(2002, { scheduling: 'fresh' }),
        ]), USER);

        expect(result.reviewsInserted).toBe(1);
    });

    it('sets review_time from revlog id (Unix ms timestamp)', () => {
        const model = makeModel(1001);
        const deck = makeDeck(2001, 'Test');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        const revlogTime = 1700000000000; // known timestamp
        const revlog = makeRevlog(revlogTime, 4001);
        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: [revlog] });

        executeImport(makeOptions(collection, [makeDeckOption(2001, { scheduling: 'keep' })]), USER);

        type ReviewRow = { review_time: string };
        const review = testDb.prepare("SELECT review_time FROM reviews WHERE user_id = ?").get(USER) as ReviewRow;
        expect(review.review_time).toBe(new Date(revlogTime).toISOString());
    });
});
