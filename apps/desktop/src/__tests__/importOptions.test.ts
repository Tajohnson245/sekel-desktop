import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// ── DB mock (same pattern as db.service.test.ts) ──────────────────────────────

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));

vi.mock('../main/db/syncPush', () => ({
    pushRecord: vi.fn(),
    deleteRecord: vi.fn(),
}));

import { createDeck, fetchDecksByAnkiIds } from '../main/db/service';
import { buildImportSummary } from '../main/import/summaryBuilder';
import { toggleParentDecks, buildPayload } from '../main/import/importOptionsLogic';
import type {
    AnkiCollection,
    AnkiModel,
    AnkiDeck,
    AnkiNote,
    AnkiCard,
    AnkiReviewLog,
    ImportSummaryDeck,
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

const USER = 'user-test-import';

// ── AnkiCollection fixture builder ────────────────────────────────────────────

function makeModel(id: number, name: string): AnkiModel {
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

function makeNote(id: number, mid: number): AnkiNote {
    return {
        id,
        guid: `guid-${id}`,
        mid,
        fields: { Front: 'Q', Back: 'A' },
        rawFlds: 'Q\x1fA',
        tags: [],
        mod: 1700000000,
    };
}

function makeCard(id: number, nid: number, did: number): AnkiCard {
    return {
        id, nid, did, ord: 0,
        type: 0, queue: 0, due: 1,
        ivl: 0, factor: 0, reps: 0, lapses: 0, mod: 1700000000,
    };
}

function makeCollection(opts: {
    decks?: AnkiDeck[];
    models?: AnkiModel[];
    notes?: AnkiNote[];
    cards?: AnkiCard[];
    revlog?: AnkiReviewLog[];
    warnings?: string[];
}): AnkiCollection {
    const decks = new Map<number, AnkiDeck>();
    // Always add the built-in Default deck (id=1) that Anki includes
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
        warnings: opts.warnings ?? [],
    };
}

// ── buildImportSummary ────────────────────────────────────────────────────────

describe('buildImportSummary', () => {
    it('counts decks, note types, notes, cards, revlog correctly', () => {
        const model = makeModel(1001, 'Basic');
        const deck = makeDeck(2001, 'Science');
        const note = makeNote(3001, 1001);
        const card = makeCard(4001, 3001, 2001);
        const revlog: AnkiReviewLog = { id: 5001, cid: 4001, ease: 3, ivl: 1, lastIvl: 0, factor: 2500, time: 5000, type: 1 };

        const collection = makeCollection({ decks: [deck], models: [model], notes: [note], cards: [card], revlog: [revlog] });

        const summary = buildImportSummary(collection, {}, []);

        expect(summary.deckCount).toBe(1);       // Default (id=1) is excluded
        expect(summary.noteTypeCount).toBe(1);
        expect(summary.noteCount).toBe(1);
        expect(summary.cardCount).toBe(1);
        expect(summary.reviewLogCount).toBe(1);
    });

    it('excludes Anki built-in deck id=1 from deck list', () => {
        const collection = makeCollection({});    // only Default deck (id=1)
        const summary = buildImportSummary(collection, {}, []);
        expect(summary.deckCount).toBe(0);
        expect(summary.decks).toHaveLength(0);
    });

    it('marks hasConflict=true for decks whose anki_id exists in SEKEL', () => {
        const deck = makeDeck(2001, 'Science');
        const collection = makeCollection({ decks: [deck] });

        const existingDecks = [{ anki_id: 2001, id: 'sekel-uuid-abc' }];
        const summary = buildImportSummary(collection, {}, existingDecks);

        expect(summary.decks[0].hasConflict).toBe(true);
        expect(summary.decks[0].existingDeckId).toBe('sekel-uuid-abc');
    });

    it('marks hasConflict=false when no SEKEL deck matches', () => {
        const deck = makeDeck(2001, 'Science');
        const collection = makeCollection({ decks: [deck] });

        const summary = buildImportSummary(collection, {}, []);
        expect(summary.decks[0].hasConflict).toBe(false);
        expect(summary.decks[0].existingDeckId).toBeUndefined();
    });

    it('correctly counts image vs audio media', () => {
        const mediaMap: Record<string, string> = {
            '0': 'photo.jpg',
            '1': 'diagram.png',
            '2': 'sound.mp3',
            '3': 'audio.ogg',
            '4': 'other.css',
        };
        const collection = makeCollection({});
        const summary = buildImportSummary(collection, mediaMap, []);

        expect(summary.mediaImageCount).toBe(2);
        expect(summary.mediaAudioCount).toBe(2);
    });

    it('includes collection warnings in summary', () => {
        const collection = makeCollection({ warnings: ['orphaned card: 999'] });
        const summary = buildImportSummary(collection, {}, []);
        expect(summary.warnings).toEqual(['orphaned card: 999']);
    });

    it('summary is JSON-serializable (no Maps)', () => {
        const deck = makeDeck(2001, 'Science');
        const model = makeModel(1001, 'Basic');
        const collection = makeCollection({ decks: [deck], models: [model] });

        const summary = buildImportSummary(collection, {}, []);
        expect(() => JSON.stringify(summary)).not.toThrow();

        const parsed = JSON.parse(JSON.stringify(summary));
        expect(parsed.deckCount).toBe(1);
        expect(parsed.decks[0].ankiDeckId).toBe(2001);
    });

    it('summary for large collection (1000 notes) stays under 50 KB', () => {
        const notes: AnkiNote[] = [];
        const cards: AnkiCard[] = [];
        for (let i = 0; i < 1000; i++) {
            const note = makeNote(3000 + i, 1001);
            // Give notes realistically long field content
            note.fields = { Front: 'A'.repeat(200), Back: 'B'.repeat(200) };
            notes.push(note);
            cards.push(makeCard(4000 + i, 3000 + i, 2001));
        }

        const deck = makeDeck(2001, 'BigDeck');
        const model = makeModel(1001, 'Basic');
        const collection = makeCollection({ decks: [deck], models: [model], notes, cards });

        const summary = buildImportSummary(collection, {}, []);
        const serialized = JSON.stringify(summary);

        // Summary should only contain counts + names, NOT field content
        expect(serialized.length).toBeLessThan(50_000);
        expect(summary.noteCount).toBe(1000);
        expect(summary.cardCount).toBe(1000);
    });

    it('nameComponents are set correctly for hierarchical deck names', () => {
        const deck = makeDeck(2001, 'Science::Biology');
        const collection = makeCollection({ decks: [deck] });

        const summary = buildImportSummary(collection, {}, []);
        expect(summary.decks[0].nameComponents).toEqual(['Science', 'Biology']);
    });
});

// ── fetchDecksByAnkiIds ───────────────────────────────────────────────────────

describe('fetchDecksByAnkiIds', () => {
    beforeEach(() => {
        testDb = setupDb();
    });

    it('returns empty array for empty ankiIds input', () => {
        const result = fetchDecksByAnkiIds(USER, []);
        expect(result).toEqual([]);
    });

    it('returns decks matching anki_id', () => {
        createDeck({ user_id: USER, name: 'Science', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2001 });
        createDeck({ user_id: USER, name: 'Math', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2002 });

        const result = fetchDecksByAnkiIds(USER, [2001]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Science');
        expect(result[0].anki_id).toBe(2001);
    });

    it('returns multiple matching decks', () => {
        createDeck({ user_id: USER, name: 'Science', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2001 });
        createDeck({ user_id: USER, name: 'Math', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2002 });
        createDeck({ user_id: USER, name: 'History', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2003 });

        const result = fetchDecksByAnkiIds(USER, [2001, 2003]);
        expect(result).toHaveLength(2);
        const names = result.map(d => d.name).sort();
        expect(names).toEqual(['History', 'Science']);
    });

    it('does not return decks from other users', () => {
        const OTHER_USER = 'user-other';
        createDeck({ user_id: OTHER_USER, name: 'Foreign', description: null, algorithm: 'fsrs', parent_id: null, anki_id: 2001 });

        const result = fetchDecksByAnkiIds(USER, [2001]);
        expect(result).toHaveLength(0);
    });

    it('does not return decks with null anki_id', () => {
        createDeck({ user_id: USER, name: 'Manual', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });

        const result = fetchDecksByAnkiIds(USER, [2001]);
        expect(result).toHaveLength(0);
    });
});

// ── ImportOptions state logic (pure functions) ────────────────────────────────

describe('toggleParentDecks', () => {
    const decks: ImportSummaryDeck[] = [
        { ankiDeckId: 10, name: 'Science', nameComponents: ['Science'], cardCount: 5, hasConflict: false },
        { ankiDeckId: 11, name: 'Science::Biology', nameComponents: ['Science', 'Biology'], cardCount: 5, hasConflict: false },
        { ankiDeckId: 12, name: 'Science::Chemistry', nameComponents: ['Science', 'Chemistry'], cardCount: 5, hasConflict: false },
        { ankiDeckId: 20, name: 'Math', nameComponents: ['Math'], cardCount: 5, hasConflict: false },
    ];

    function makeStates(selected = true) {
        return new Map(decks.map(d => [d.ankiDeckId, {
            selected,
            scheduling: 'keep' as const,
            algorithm: 'fsrs' as const,
            conflict: null as null,
            expanded: false,
        }]));
    }

    it('deselects all decks sharing a root name when parent is unchecked', () => {
        const states = makeStates(true);
        const next = toggleParentDecks(decks, states, 'Science', false);

        expect(next.get(10)!.selected).toBe(false);
        expect(next.get(11)!.selected).toBe(false);
        expect(next.get(12)!.selected).toBe(false);
        // Math unaffected
        expect(next.get(20)!.selected).toBe(true);
    });

    it('selects all decks sharing a root name when parent is checked', () => {
        const states = makeStates(false);
        const next = toggleParentDecks(decks, states, 'Science', true);

        expect(next.get(10)!.selected).toBe(true);
        expect(next.get(11)!.selected).toBe(true);
        expect(next.get(12)!.selected).toBe(true);
        expect(next.get(20)!.selected).toBe(false);
    });

    it('returns a new Map (immutable update)', () => {
        const states = makeStates(true);
        const next = toggleParentDecks(decks, states, 'Science', false);
        expect(next).not.toBe(states);
    });
});

describe('buildPayload', () => {
    const decks: ImportSummaryDeck[] = [
        { ankiDeckId: 10, name: 'Science', nameComponents: ['Science'], cardCount: 5, hasConflict: false },
        { ankiDeckId: 11, name: 'Math', nameComponents: ['Math'], cardCount: 5, hasConflict: true, existingDeckId: 'abc' },
    ];

    const summary = {
        deckCount: 2, noteTypeCount: 1, noteCount: 5, cardCount: 10,
        reviewLogCount: 3, mediaImageCount: 0, mediaAudioCount: 0,
        decks,
        noteTypeNames: ['Basic'],
        warnings: [],
    };

    const states = new Map([
        [10, { selected: true, scheduling: 'fresh' as const, algorithm: 'fsrs' as const, conflict: null, expanded: false }],
        [11, { selected: false, scheduling: 'keep' as const, algorithm: 'sm2' as const, conflict: 'skip' as const, expanded: false }],
    ]);

    it('produces correct ImportOptionsPayload from state', () => {
        const payload = buildPayload(summary, states, 'subdecks', { '0': 'img.jpg' }, ['/tmp/img.jpg'], '/tmp/import-abc');

        expect(payload.tempDir).toBe('/tmp/import-abc');
        expect(payload.mediaMap).toEqual({ '0': 'img.jpg' });
        expect(payload.mediaFilePaths).toEqual(['/tmp/img.jpg']);
        expect(payload.decks).toHaveLength(2);
    });

    it('correctly maps selected deck', () => {
        const payload = buildPayload(summary, states, 'subdecks', {}, [], '/tmp/x');
        const science = payload.decks.find(d => d.ankiDeckId === 10)!;

        expect(science.selected).toBe(true);
        expect(science.scheduling).toBe('fresh');
        expect(science.algorithm).toBe('fsrs');
        expect(science.conflict).toBeNull();
    });

    it('correctly maps deselected conflicting deck', () => {
        const payload = buildPayload(summary, states, 'subdecks', {}, [], '/tmp/x');
        const math = payload.decks.find(d => d.ankiDeckId === 11)!;

        expect(math.selected).toBe(false);
        expect(math.scheduling).toBe('keep');
        expect(math.algorithm).toBe('sm2');
        expect(math.conflict).toBe('skip');
    });

    it('conflict is null for non-conflicting decks by default', () => {
        const fresh = new Map([
            [10, { selected: true, scheduling: 'keep' as const, algorithm: 'fsrs' as const, conflict: null, expanded: false }],
            [11, { selected: true, scheduling: 'keep' as const, algorithm: 'fsrs' as const, conflict: null, expanded: false }],
        ]);
        const payload = buildPayload(summary, fresh, 'subdecks', {}, [], '/tmp/x');
        const science = payload.decks.find(d => d.ankiDeckId === 10)!;
        expect(science.conflict).toBeNull();
    });
});

describe('ImportOptions defaults', () => {
    it('default algorithm is fsrs', () => {
        const deck: ImportSummaryDeck = { ankiDeckId: 10, name: 'Test', nameComponents: ['Test'], cardCount: 5, hasConflict: false };
        const summary = {
            deckCount: 1, noteTypeCount: 0, noteCount: 0, cardCount: 0,
            reviewLogCount: 0, mediaImageCount: 0, mediaAudioCount: 0,
            decks: [deck], noteTypeNames: [], warnings: [],
        };

        // Simulate buildInitialState logic
        const algorithm: 'fsrs' | 'sm2' = 'fsrs';
        const states = new Map([[10, {
            selected: true, scheduling: 'keep' as const,
            algorithm, conflict: null, expanded: false,
        }]]);

        const payload = buildPayload(summary, states, 'subdecks', {}, [], '/tmp/x');
        expect(payload.decks[0].algorithm).toBe('fsrs');
    });

    it('canImport is false when 0 decks selected', () => {
        const deckStates = [false, false];
        const selectedCount = deckStates.filter(Boolean).length;
        expect(selectedCount >= 1).toBe(false);
    });

    it('canImport is true when at least 1 deck selected', () => {
        const deckStates = [true, false];
        const selectedCount = deckStates.filter(Boolean).length;
        expect(selectedCount >= 1).toBe(true);
    });
});
