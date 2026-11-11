import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// West-of-UTC zone with DST so UTC-vs-local bucketing differences actually show
// up. The beforeAll guard confirms the runtime TZ change took effect (it does on
// Windows Node too); restored in afterAll.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'America/New_York';

const h = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../main/db/index', () => ({ getDb: () => h.db, initDatabase: vi.fn() }));
vi.mock('../main/backup/deletionLog', () => ({
    logDeckDeletion: vi.fn(),
    logNoteDeletion: vi.fn(),
    logAllNotesInDeckDeletion: vi.fn(),
    logAllDecksDeletion: vi.fn(),
}));

import {
    createDeck,
    deleteDeck,
    deleteDecks,
    fetchDueCardsCrossDeck,
    fetchMissRateTrend,
    getIntelligenceSummary,
} from '../main/db/service';
import { prunePlanDeckScopes } from '../main/db/planDeckScope';

const U  = 'u1';
const TS = '2026-01-01T00:00:00.000Z';

function setupDb(): Database.Database {
    const d = new Database(':memory:');
    d.pragma('foreign_keys = OFF');
    d.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        d.exec(MIGRATIONS[i]);
        d.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return d;
}

let seq = 0;
function review(at: Date, rating: 'again' | 'good') {
    const id = `r${++seq}`;
    h.db.prepare(`INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before,
                      stability_before, difficulty_before, state_after, stability_after,
                      difficulty_after, scheduled_days, created_at)
                  VALUES (?, ?, ?, ?, ?, 'review', 5, 5, 'review', 6, 5, 3, ?)`)
        .run(id, U, `card-${id}`, rating, at.toISOString(), at.toISOString());
}

function insertPlan(id: string, deckFilter: string[] | null, status: 'active' | 'archived' = 'active') {
    h.db.prepare(`INSERT INTO plans (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
                      snapshot, deck_filter, status, activated_at, created_at, updated_at)
                  VALUES (?, ?, 'step1', ?, 10, 10, '{}', ?, ?, ?, ?, ?)`)
        .run(id, U, id, deckFilter ? JSON.stringify(deckFilter) : null, status, TS, TS, TS);
}

const plan = (id: string) =>
    h.db.prepare('SELECT status, deck_filter FROM plans WHERE id = ?').get(id) as { status: string; deck_filter: string | null };

const newDeck = (name: string) =>
    createDeck({ user_id: U, name, description: null, algorithm: 'fsrs', parent_id: null, anki_id: null });

beforeAll(() => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(300); // TZ override took effect
});

afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
    h.db = setupDb();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0)); // Tue 2026-03-10 noon local (EDT)
});

afterEach(() => {
    vi.useRealTimers();
    h.db.close();
});

// ── fetchMissRateTrend ──────────────────────────────────────────────────────

describe('fetchMissRateTrend — local calendar buckets', () => {
    it('daily buckets: an 8pm review stays on its local day', () => {
        review(new Date(2026, 2, 2, 20, 0), 'again'); // Mar 2 8pm EST = Mar 3 01:00 UTC
        review(new Date(2026, 2, 3, 9, 0), 'good');   // Mar 3 morning

        // DATE(review_time) put both in '2026-03-03' (one bucket, 50% misses).
        expect(fetchMissRateTrend(U, 30)).toEqual([
            { date: '2026-03-02', totalReviews: 1, missCount: 1, missRate: 100 },
            { date: '2026-03-03', totalReviews: 1, missCount: 0, missRate: 0 },
        ]);
    });

    it('all-time weekly buckets: a late-Sunday review stays in its local week', () => {
        review(new Date(2026, 2, 8, 22, 0), 'again'); // Sun Mar 8 10pm EDT = Mon 02:00 UTC
        review(new Date(2026, 2, 9, 9, 0), 'good');   // Mon Mar 9

        const trend = fetchMissRateTrend(U, null);
        expect(trend).toHaveLength(2);
        expect(trend.map(p => p.date)).toEqual(['2026-W09', '2026-W10']);
        expect(trend[0]).toMatchObject({ totalReviews: 1, missCount: 1 });
        expect(trend[1]).toMatchObject({ totalReviews: 1, missCount: 0 });
    });

    it('respects the date range and orders buckets chronologically', () => {
        review(new Date(2026, 0, 1, 9, 0), 'good');   // outside a 30-day window
        review(new Date(2026, 2, 9, 9, 0), 'good');
        review(new Date(2026, 2, 5, 9, 0), 'again');
        expect(fetchMissRateTrend(U, 30).map(p => p.date)).toEqual(['2026-03-05', '2026-03-09']);
    });
});

// ── getIntelligenceSummary.daysUntilExam ────────────────────────────────────

describe('getIntelligenceSummary — daysUntilExam', () => {
    function seedExam(examDate: string) {
        h.db.prepare(`INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, 'step1', 'Step 1', ?)`).run(TS);
        h.db.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                      VALUES (?, 1, ?, 1, 'auto', ?, ?)`).run(U, examDate, TS, TS);
    }

    it('counts whole local days (late evening the day before → 1, not 0)', () => {
        seedExam('2026-03-11');
        vi.setSystemTime(new Date(2026, 2, 10, 22, 0));
        expect(getIntelligenceSummary(U).daysUntilExam).toBe(1);
    });

    it('is 0 on exam day and negative once the exam has passed (no longer clamped to 0)', () => {
        seedExam('2026-03-10');
        expect(getIntelligenceSummary(U).daysUntilExam).toBe(0);
        vi.setSystemTime(new Date(2026, 2, 12, 9, 0));
        expect(getIntelligenceSummary(U).daysUntilExam).toBe(-2);
    });
});

// ── Empty deck scope ────────────────────────────────────────────────────────

describe('cross-deck scope: [] is an empty scope, not "all decks"', () => {
    it('fetchDueCardsCrossDeck([]) returns nothing; null still pools every deck', () => {
        const deck = newDeck('A');
        h.db.prepare(`INSERT INTO note_types (id, user_id, name, created_at, updated_at) VALUES ('nt', ?, 'Basic', ?, ?)`).run(U, TS, TS);
        h.db.prepare(`INSERT INTO notes (id, user_id, deck_id, note_type_id, created_at, updated_at) VALUES ('n1', ?, ?, 'nt', ?, ?)`)
            .run(U, deck.id, TS, TS);
        h.db.prepare(`INSERT INTO cards (id, user_id, note_id, state, due, stability, difficulty, created_at, updated_at)
                      VALUES ('c1', ?, 'n1', 'review', ?, 10, 5, ?, ?)`).run(U, '2026-03-01T00:00:00.000Z', TS, TS);

        expect(fetchDueCardsCrossDeck(U, [], 20, 200, 'step1', 20)).toEqual([]);
        expect(fetchDueCardsCrossDeck(U, [])).toEqual([]);
        expect(fetchDueCardsCrossDeck(U, null)).toHaveLength(1);
    });
});

describe('deck deletion archives a plan left with no decks in scope', () => {
    it('archives the active plan when its last scoped deck is deleted', () => {
        const a = newDeck('A');
        insertPlan('p', [a.id]);
        deleteDeck(a.id);
        expect(plan('p')).toEqual({ status: 'archived', deck_filter: '[]' });
    });

    it('keeps a partially-pruned plan active, and leaves all-deck (NULL) plans alone', () => {
        const a = newDeck('A');
        const b = newDeck('B');
        insertPlan('partial', [a.id, b.id]);
        insertPlan('all', null);
        deleteDecks([a.id]);
        expect(plan('partial')).toEqual({ status: 'active', deck_filter: JSON.stringify([b.id]) });
        expect(plan('all')).toEqual({ status: 'active', deck_filter: null });
    });
});

describe('prunePlanDeckScopes (shared by deck deletion and the boot cleanup)', () => {
    it('archives an active plan already stuck at "[]" and reports what changed', () => {
        insertPlan('stuck', []);                     // legacy: emptied before this fix
        insertPlan('history', ['gone'], 'archived'); // archived plans are only pruned
        insertPlan('fine', ['live']);

        const res = prunePlanDeckScopes(h.db, id => id === 'live');
        expect(res).toEqual({ plansUpdated: 1, plansArchived: 1 });
        expect(plan('stuck').status).toBe('archived');
        expect(plan('history')).toEqual({ status: 'archived', deck_filter: '[]' });
        expect(plan('fine')).toEqual({ status: 'active', deck_filter: JSON.stringify(['live']) });
    });

    it('is a no-op when nothing needs pruning', () => {
        insertPlan('fine', ['live']);
        expect(prunePlanDeckScopes(h.db, () => true)).toEqual({ plansUpdated: 0, plansArchived: 0 });
    });
});
