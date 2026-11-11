import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// classifyCardsBatch end to end against an in-memory SQLite database, with a
// scripted fake AI in place of the ai-proxy.

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({ getDb: () => testDb, initDatabase: vi.fn() }));
vi.mock('../main/backup/deletionLog', () => ({
    logDeckDeletion: vi.fn(),
    logNoteDeletion: vi.fn(),
    logAllNotesInDeckDeletion: vi.fn(),
    logAllDecksDeletion: vi.fn(),
}));
vi.mock('@sekel/observability', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    return {
        instrumentedHandle: vi.fn(),
        trackedCompletion: (opts: { call: Promise<unknown> }) => opts.call,
        createLogger: () => logger,
        consoleTransport: {},
        metrics: { increment: vi.fn(), startTimer: () => () => 0 },
    };
});

type Messages = Array<{ role: string; content: string }>;
type Behaviour = (kind: 'screen' | 'classify', deckName: string, cardCount: number, call: number) => unknown;

const ai = {
    calls: [] as Array<{ kind: 'screen' | 'classify'; deckName: string; cards: number }>,
    behaviour: null as Behaviour | null,
    signedIn: true,
};

function deckNameOf(messages: Messages): string {
    const m = /Deck name: (".*?")\n/.exec(messages[1].content);
    return m ? (JSON.parse(m[1]) as string) : '';
}

function cardCountOf(messages: Messages): number {
    return (messages[1].content.match(/^\[\d+\] FRONT:/gm) ?? []).length;
}

const fakeClient = {
    chat: {
        completions: {
            create: async (params: { messages: Messages }) => {
                const kind = params.messages[0].content.startsWith('You decide whether') ? 'screen' : 'classify';
                const deckName = deckNameOf(params.messages);
                const cards = cardCountOf(params.messages);
                ai.calls.push({ kind, deckName, cards });
                const reply = ai.behaviour!(kind, deckName, cards, ai.calls.length);
                if (reply instanceof Error) throw reply;
                return { choices: [{ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] };
            },
        },
    },
};

vi.mock('../main/ai/openaiClient', () => ({
    createProxiedOpenAI: () => fakeClient,
    requireAiSession: () => {
        if (!ai.signedIn) throw Object.assign(new Error('Sign in to use AI features.'), { name: 'AiSignInRequiredError' });
    },
    isBatchStoppingAiError: (err: unknown) => (err as { code?: string })?.code === 'daily_limit_reached',
}));

import { classifyCardsBatch, clearDeckClassifications, getDeckClassificationCount } from '../ipc/classify';
import { createCard, createDeck, createNote, createNoteType } from '../main/db/service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const USER = 'user-1';

function setupDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    MIGRATIONS.forEach((sql, i) => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, 'step1', 'USMLE Step 1', ?)`).run(now);
    db.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (10, 1, 'cardio', 'Cardiovascular', 5, 10)`).run();
    db.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (11, 1, 'multisystem', 'Multisystem Processes', 8, 12)`).run();
    db.prepare(`INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (100, 10, 'heart-failure', 'Heart Failure', 0.5)`).run();
    db.prepare(`INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (110, 11, 'cell-biology', 'Cell Biology', 0.5)`).run();
    return db;
}

function seedDeck(name: string, notes: number): { deckId: string; cardIds: string[] } {
    const nt = createNoteType({
        user_id: USER,
        name: `Basic ${name}`,
        fields: [{ name: 'Front' }, { name: 'Back' }],
        card_templates: [{ name: 'Card 1', front_template: '{{Front}}', back_template: '{{Back}}' }],
    });
    const deck = createDeck({ user_id: USER, name, description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });
    const cardIds: string[] = [];
    for (let i = 0; i < notes; i++) {
        const note = createNote({
            user_id: USER, deck_id: deck.id, note_type_id: nt.id,
            fields: { Front: `${name} question ${i + 1}`, Back: `answer ${i + 1}` }, tags: [],
        });
        const card = createCard({
            user_id: USER, note_id: note.id, template_index: 0, state: 'new', due: new Date().toISOString(),
            stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
        });
        cardIds.push(card.id);
    }
    return { deckId: deck.id, cardIds };
}

/** Programming decks are off-exam; everything else maps to cardio / heart failure. */
const realisticAi: Behaviour = (kind, deckName, cards) => {
    const isCode = /c#/i.test(deckName);
    if (kind === 'screen') {
        return {
            deck_subject: isCode ? 'C# programming' : 'Cardiology',
            cards: Array.from({ length: cards }, (_, i) => ({ card: i + 1, relevant: !isCode })),
        };
    }
    return {
        results: Array.from({ length: cards }, (_, i) => isCode
            ? { card: i + 1, exam_relevant: false, classifications: [] }
            : { card: i + 1, exam_relevant: true, classifications: [{ system_key: 'cardio', topic_key: 'heart-failure', confidence: 0.9, split_weight: 1 }] }),
    };
};

function rowsFor(cardIds: string[]) {
    return testDb.prepare(
        `SELECT card_id, system_id, topic_id, confidence, split_weight, model_version FROM card_classifications WHERE card_id IN (${cardIds.map(() => '?').join(',')})`
    ).all(...cardIds) as Array<{ card_id: string; system_id: number | null; topic_id: number | null; confidence: number; split_weight: number; model_version: string }>;
}

function insertLegacyRow(cardId: string, systemId: number | null, confidence: number) {
    testDb.prepare(
        `INSERT INTO card_classifications (card_id, exam_id, system_id, confidence, split_weight, classified_at, model_version) VALUES (?, 1, ?, ?, 1, ?, 'gpt-4.1-mini')`
    ).run(cardId, systemId, confidence, new Date().toISOString());
}

beforeEach(() => {
    testDb = setupDb();
    ai.calls = [];
    ai.behaviour = realisticAi;
    ai.signedIn = true;
});
afterEach(() => { testDb.close(); });

// ── Tests ───────────────────────────────────────────────────────────────────

describe('classifyCardsBatch', () => {
    it('skips a deck that is not exam material and classifies the other in batches of 10', async () => {
        const code = seedDeck('C# Fundamentals', 12);
        const cardio = seedDeck('Cardiology', 12);

        const result = await classifyCardsBatch([...code.cardIds, ...cardio.cardIds], 'step1');

        expect(result).toMatchObject({ classified: 12, notRelated: 0, skipped: 0, errors: 0, stoppedEarly: false });
        expect(result.skippedDecks).toEqual([{
            deckId: code.deckId, deckName: 'C# Fundamentals', cardCount: 12, sampled: 12, relevant: 0, subject: 'C# programming',
        }]);
        expect(ai.calls.filter((c) => c.kind === 'screen').map((c) => c.deckName)).toEqual(['C# Fundamentals', 'Cardiology']);
        expect(ai.calls.filter((c) => c.kind === 'classify').map((c) => c.cards)).toEqual([10, 2]);

        expect(rowsFor(code.cardIds)).toHaveLength(0);
        const cardioRows = rowsFor(cardio.cardIds);
        expect(cardioRows).toHaveLength(12);
        expect(cardioRows[0]).toMatchObject({ system_id: 10, topic_id: 100, confidence: 0.9, split_weight: 1, model_version: 'gpt-4.1-mini#v2' });

        expect(getDeckClassificationCount(code.deckId, 'step1')).toEqual({ classified: 0, notRelated: 0, total: 12 });
        expect(getDeckClassificationCount(cardio.deckId, 'step1')).toEqual({ classified: 12, notRelated: 0, total: 12 });
    });

    it('"Classify anyway" skips the deck check and stores off-exam cards as not related', async () => {
        const code = seedDeck('C# Fundamentals', 12);

        const result = await classifyCardsBatch(code.cardIds, 'step1', false, { skipRelevanceCheck: true });

        expect(ai.calls.some((c) => c.kind === 'screen')).toBe(false);
        expect(result).toMatchObject({ classified: 0, notRelated: 12, errors: 0, skippedDecks: [] });
        const rows = rowsFor(code.cardIds);
        expect(rows).toHaveLength(12);
        expect(rows.every((r) => r.system_id === null && r.confidence === 0)).toBe(true);
        expect(getDeckClassificationCount(code.deckId, 'step1')).toEqual({ classified: 0, notRelated: 12, total: 12 });

        // Already checked: a normal re-run sends nothing to the AI.
        ai.calls = [];
        const again = await classifyCardsBatch(code.cardIds, 'step1');
        expect(again).toMatchObject({ classified: 0, notRelated: 0, skipped: 12 });
        expect(ai.calls).toHaveLength(0);
    });

    it('a forced re-run replaces old answers instead of adding to them', async () => {
        const cardio = seedDeck('Cardiology', 6);
        insertLegacyRow(cardio.cardIds[0], 11, 0.95);  // stale multisystem row
        insertLegacyRow(cardio.cardIds[0], null, 0.1); // stale "other" row

        await classifyCardsBatch(cardio.cardIds, 'step1', true);

        const rows = rowsFor([cardio.cardIds[0]]);
        expect(rows).toEqual([expect.objectContaining({ system_id: 10, topic_id: 100, model_version: 'gpt-4.1-mini#v2' })]);
    });

    it('a forced re-run of a deck that is not exam material removes its old classifications', async () => {
        const code = seedDeck('C# Fundamentals', 8);
        insertLegacyRow(code.cardIds[0], 11, 0.95); // the old false positive
        insertLegacyRow(code.cardIds[1], null, 0.15);

        const result = await classifyCardsBatch(code.cardIds, 'step1', true);

        expect(result.skippedDecks).toHaveLength(1);
        expect(rowsFor(code.cardIds)).toHaveLength(0);
    });

    it('counts legacy low-confidence and "other" rows as not related, never as classified', async () => {
        const deck = seedDeck('Mixed', 3);
        insertLegacyRow(deck.cardIds[0], 10, 0.95);
        insertLegacyRow(deck.cardIds[1], 10, 0.3);
        insertLegacyRow(deck.cardIds[2], null, 0.1);
        expect(getDeckClassificationCount(deck.deckId, 'step1')).toEqual({ classified: 1, notRelated: 2, total: 3 });
    });

    it('decks with fewer than 5 notes skip the deck check', async () => {
        const tiny = seedDeck('C# Fundamentals', 4);
        const result = await classifyCardsBatch(tiny.cardIds, 'step1');
        expect(ai.calls.map((c) => c.kind)).toEqual(['classify']);
        expect(result).toMatchObject({ classified: 0, notRelated: 4, skippedDecks: [] });
    });

    it('when the deck check fails, the per-card check still runs', async () => {
        const cardio = seedDeck('Cardiology', 6);
        ai.behaviour = (kind, ...rest) => (kind === 'screen' ? new Error('500 upstream') : realisticAi(kind, ...rest));
        const result = await classifyCardsBatch(cardio.cardIds, 'step1');
        expect(result).toMatchObject({ classified: 6, errors: 0, skippedDecks: [] });
    });

    it('an unreadable deck-check reply does not skip the deck', async () => {
        const cardio = seedDeck('Cardiology', 6);
        ai.behaviour = (kind, ...rest) => (kind === 'screen' ? 'not json' : realisticAi(kind, ...rest));
        const result = await classifyCardsBatch(cardio.cardIds, 'step1');
        expect(result).toMatchObject({ classified: 6, skippedDecks: [] });
    });

    it('stops early when the daily AI limit is reached and keeps what was finished', async () => {
        const cardio = seedDeck('Cardiology', 25);
        ai.behaviour = (kind, deckName, cards, call) => (
            kind === 'classify' && call === 3
                ? Object.assign(new Error('limit'), { status: 429, code: 'daily_limit_reached' })
                : realisticAi(kind, deckName, cards, call)
        );

        const result = await classifyCardsBatch(cardio.cardIds, 'step1');

        // call 1 = deck check, call 2 = first 10 cards, call 3 fails.
        expect(result).toMatchObject({ classified: 10, errors: 15, stoppedEarly: true });
        expect(rowsFor(cardio.cardIds)).toHaveLength(10);
    });

    it('cards the AI leaves out or answers with unknown systems are errors and are not stored', async () => {
        const cardio = seedDeck('Cardiology', 3);
        ai.behaviour = (kind) => (kind === 'screen' ? realisticAi('screen', 'Cardiology', 3, 1) : {
            results: [
                { card: 1, exam_relevant: true, classifications: [{ system_key: 'cardio', topic_key: 'heart-failure', confidence: 0.9, split_weight: 1 }] },
                { card: 2, exam_relevant: true, classifications: [{ system_key: 'made-up', confidence: 0.9, split_weight: 1 }] },
            ],
        });
        const result = await classifyCardsBatch(cardio.cardIds, 'step1', false, { skipRelevanceCheck: true });
        expect(result).toMatchObject({ classified: 1, errors: 2 });
        expect(rowsFor(cardio.cardIds)).toHaveLength(1);
    });

    it('fails fast when signed out', async () => {
        const cardio = seedDeck('Cardiology', 3);
        ai.signedIn = false;
        await expect(classifyCardsBatch(cardio.cardIds, 'step1')).rejects.toThrow('Sign in');
        expect(ai.calls).toHaveLength(0);
    });

    it('returns an empty result for no cards without calling the AI', async () => {
        const result = await classifyCardsBatch([], 'step1');
        expect(result).toEqual({ classified: 0, notRelated: 0, skipped: 0, errors: 0, skippedDecks: [], stoppedEarly: false });
        expect(ai.calls).toHaveLength(0);
    });
});

describe('clearDeckClassifications', () => {
    it("removes a deck's rows for the exam and reports how many cards had any", async () => {
        const cardio = seedDeck('Cardiology', 6);
        const other = seedDeck('Other', 6);
        await classifyCardsBatch([...cardio.cardIds, ...other.cardIds], 'step1');

        expect(clearDeckClassifications(cardio.deckId, 'step1')).toEqual({ clearedCards: 6 });
        expect(rowsFor(cardio.cardIds)).toHaveLength(0);
        expect(rowsFor(other.cardIds)).toHaveLength(6);
        expect(getDeckClassificationCount(cardio.deckId, 'step1')).toEqual({ classified: 0, notRelated: 0, total: 6 });
    });
});
