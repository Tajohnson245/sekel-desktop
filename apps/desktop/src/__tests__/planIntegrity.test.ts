import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// Plan day math is LOCAL-calendar math. Pin a west-of-UTC zone with DST so the
// UTC-bucketing bugs guarded here actually manifest (in UTC they'd pass
// vacuously). Node honours a runtime TZ change on Windows too; the beforeAll
// guard fails loudly if it didn't. Restored in afterAll.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'America/New_York';

vi.mock('@sekel/observability', () => ({
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {} }),
    consoleTransport: {},
    instrumentedHandle: () => {},
    trackedCompletion: async () => ({ choices: [{ message: { content: '{}' } }] }),
}));

const h = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../main/db/index', () => ({ getDb: () => h.db }));

import {
    computePlan,
    createPlan,
    getActivePlan,
    getPlanProgress,
    getPlanRebalanceDelta,
    reactivatePlan,
    updatePlanRate,
    clearPlanOverride,
    type PlanResult,
} from '../main/db/planService';

// ── Fixtures ────────────────────────────────────────────────────────────────

const U    = 'u1';
const EXAM = 'step-x';
const TS   = '2026-01-01T00:00:00.000Z';
/** "Now" for every test: Wed 2026-03-04, noon local (EST). */
const NOW  = () => new Date(2026, 2, 4, 12, 0);
const FAR_EXAM = '2026-06-01';

function setupDb(): Database.Database {
    const d = new Database(':memory:');
    d.pragma('foreign_keys = OFF'); // seed only what the plan engine reads
    d.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        d.exec(MIGRATIONS[i]);
        d.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return d;
}

function seedExam(examDate = FAR_EXAM, examKey = EXAM, examId = 1, isPrimary = 1) {
    h.db.prepare('INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (?, ?, ?, ?)')
        .run(examId, examKey, examKey.toUpperCase(), TS);
    h.db.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'auto', ?, ?)`).run(U, examId, examDate, isPrimary, TS, TS);
}

let seq = 0;
/** n unseen (state='new') cards in a deck. */
function insertNewCards(n: number, deckId = 'd1') {
    const note = h.db.prepare(`INSERT INTO notes (id, user_id, deck_id, note_type_id, created_at, updated_at)
                               VALUES (?, ?, ?, 'nt', ?, ?)`);
    const card = h.db.prepare(`INSERT INTO cards (id, user_id, note_id, state, due, created_at, updated_at)
                               VALUES (?, ?, ?, 'new', ?, ?, ?)`);
    h.db.transaction(() => {
        for (let i = 0; i < n; i++) {
            const id = `c${++seq}`;
            note.run(`n-${id}`, U, deckId, TS, TS);
            card.run(id, U, `n-${id}`, TS, TS, TS);
        }
    })();
}

/** `n` new-card introductions (state_before='new') at a given instant. */
function introduce(n: number, at: Date, deckId = 'd1') {
    const stmt = h.db.prepare(`INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before,
                                   stability_before, difficulty_before, state_after, stability_after,
                                   difficulty_after, scheduled_days, deck_id, created_at)
                               VALUES (?, ?, ?, 'good', ?, 'new', 0, 0, 'learning', 1, 5, 0, ?, ?)`);
    for (let i = 0; i < n; i++) {
        const id = `r${++seq}`;
        stmt.run(id, U, `seen-${id}`, at.toISOString(), deckId, at.toISOString());
    }
}

function insertPlan(p: {
    id: string; rate: number; activatedAt: string; updatedAt?: string;
    deckFilter?: string[] | null; status?: 'active' | 'archived'; examKey?: string;
}) {
    h.db.prepare(`INSERT INTO plans (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
                      snapshot, deck_filter, status, activated_at, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`)
        .run(p.id, U, p.examKey ?? EXAM, p.id, p.rate, p.rate,
             p.deckFilter === undefined || p.deckFilter === null ? null : JSON.stringify(p.deckFilter),
             p.status ?? 'active', p.activatedAt, p.activatedAt, p.updatedAt ?? p.activatedAt);
}

const planRow = (id: string) =>
    h.db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as
        { status: string; cards_per_day: number; updated_at: string; activated_at: string } | undefined;

const dailyNewLimit = () =>
    (h.db.prepare('SELECT daily_new_limit FROM user_profiles WHERE id = ?').get(U) as { daily_new_limit: number } | undefined)
        ?.daily_new_limit;

/** Mar 1 08:00 local — plan activation used by the rebalance scenarios. */
const ACTIVATED = new Date(2026, 2, 1, 8, 0).toISOString();

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
    vi.setSystemTime(NOW());
});

afterEach(() => {
    vi.useRealTimers();
    h.db.close();
});

// ── Rebalance: local calendar days ──────────────────────────────────────────

describe('getPlanRebalanceDelta — local calendar days', () => {
    it('does not count an evening (post-7pm, UTC-next-day) session as a missed day', () => {
        seedExam();
        insertNewCards(10); // tiny pool → recommendation (1/day) differs from the plan's 5
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        introduce(5, new Date(2026, 2, 1, 9, 0));   // Mar 1 morning
        introduce(5, new Date(2026, 2, 2, 20, 0));  // Mar 2, 8pm EST = Mar 3 01:00 UTC
        introduce(5, new Date(2026, 2, 3, 20, 0));  // Mar 3, 8pm EST = Mar 4 01:00 UTC

        // Every local day Mar 2–3 met the 5/day commitment. (Grouping by UTC DATE()
        // filed Mar 2's session under Mar 3 and reported Mar 2 as missed.)
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();
    });

    it('still reports a genuinely missed local day', () => {
        seedExam();
        insertNewCards(10);
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        introduce(5, new Date(2026, 2, 1, 9, 0));
        introduce(5, new Date(2026, 2, 2, 20, 0));
        // nothing on Mar 3

        const delta = getPlanRebalanceDelta(U, EXAM);
        expect(delta).not.toBeNull();
        expect(delta!.daysMissed).toBe(1);
        expect(delta!.previousNewPerDay).toBe(5);
        expect(delta!.newNewPerDay).toBe(1);
        expect(delta!.evaluatedSince).toBe(ACTIVATED);
    });
});

describe('getPlanRebalanceDelta — deck scope', () => {
    it("recomputes over the plan's deck filter and counts only in-scope introductions", () => {
        seedExam();
        insertNewCards(10, 'd1');    // in scope
        insertNewCards(2000, 'd2');  // out of scope — would inflate an all-decks recompute
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED, deckFilter: ['d1'] });
        introduce(5, new Date(2026, 2, 1, 9, 0), 'd1');
        introduce(5, new Date(2026, 2, 2, 9, 0), 'd2'); // studied, but outside the plan's decks
        introduce(5, new Date(2026, 2, 3, 9, 0), 'd2');

        const delta = getPlanRebalanceDelta(U, EXAM);
        expect(delta).not.toBeNull();
        expect(delta!.daysMissed).toBe(2);
        // 10 unseen in scope → 1/day. Unscoped (2010 unseen) it would be far higher.
        expect(delta!.newNewPerDay).toBe(1);
        expect(computePlan(U, EXAM)!.recommendedNewPerDay).toBeGreaterThan(5);
    });
});

describe('getPlanRebalanceDelta — evaluation window restarts when a rate is accepted', () => {
    function scenario() {
        seedExam();
        insertNewCards(10);
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        introduce(5, new Date(2026, 2, 1, 9, 0));
        // Mar 2 and Mar 3 missed under the original rate.
    }

    it('fires before the accept, then stops judging pre-accept days against the new rate', () => {
        scenario();
        expect(getPlanRebalanceDelta(U, EXAM)!.daysMissed).toBe(2);

        updatePlanRate(U, EXAM, 50); // accepted (now = Mar 4 noon)
        expect(planRow('p1')!.cards_per_day).toBe(50);
        // Nothing studied yet under 50/day → no missed days to report (previously
        // Mar 2–3 were re-judged against 50 and the banner re-fired immediately).
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();

        // Two days later, having met the new rate on Mar 4 (after accepting) and Mar 5.
        introduce(50, new Date(2026, 2, 4, 15, 0));
        introduce(50, new Date(2026, 2, 5, 15, 0));
        vi.setSystemTime(new Date(2026, 2, 6, 12, 0));
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();
    });

    it('counts only post-accept misses', () => {
        scenario();
        updatePlanRate(U, EXAM, 50);
        introduce(50, new Date(2026, 2, 4, 15, 0));
        introduce(10, new Date(2026, 2, 5, 15, 0)); // short of 50
        vi.setSystemTime(new Date(2026, 2, 6, 12, 0));

        const delta = getPlanRebalanceDelta(U, EXAM);
        expect(delta).not.toBeNull();
        expect(delta!.daysMissed).toBe(1);               // Mar 5 only — not Mar 2/3 as well
        expect(delta!.evaluatedSince).toBe(NOW().toISOString());
    });
});

describe('getPlanRebalanceDelta — nothing to rebalance', () => {
    function missedTwoDays(examDate: string) {
        seedExam(examDate);
        insertNewCards(10);
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        introduce(5, new Date(2026, 2, 1, 9, 0));
    }

    it('returns a delta while the exam is still ahead (control)', () => {
        missedTwoDays('2026-03-05'); // tomorrow
        expect(getPlanRebalanceDelta(U, EXAM)).not.toBeNull();
    });

    it('returns null on exam day', () => {
        missedTwoDays('2026-03-04');
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();
    });

    it('returns null once the exam has passed', () => {
        missedTwoDays('2026-03-01');
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();
    });

    it('returns null when every card in scope has been introduced (no "100/day" catch-up)', () => {
        seedExam();
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        introduce(5, new Date(2026, 2, 1, 9, 0)); // then nothing left unseen
        expect(computePlan(U, EXAM)!.recommendedNewPerDay).toBe(100); // the old banner value
        expect(getPlanRebalanceDelta(U, EXAM)).toBeNull();
    });
});

// ── computePlan ─────────────────────────────────────────────────────────────

describe('computePlan — exam passed', () => {
    it('returns no suggestion once the exam date has passed', () => {
        seedExam('2026-03-03');
        insertNewCards(500);
        expect(computePlan(U, EXAM)).toBeNull();
    });

    it("keeps a committed plan's live view, over a 0-day window with no inflated recommendation", () => {
        seedExam('2026-03-03');
        insertNewCards(500);
        const live = computePlan(U, EXAM, null, 20)!;
        expect(live).not.toBeNull();
        expect(live.availableDays).toBe(0);
        expect(live.recommendedNewPerDay).toBe(0);   // previously clamped to 1 day → up to 100/day
        expect(live.unseenTotal).toBe(500);
        expect(live.projectedCoverageCount).toBe(0);
        expect(live.weeklyProjection).toEqual([]);

        insertPlan({ id: 'p1', rate: 20, activatedAt: ACTIVATED });
        expect(getActivePlan(U, EXAM)!.liveView!.availableDays).toBe(0);
    });

    it('still counts exam day itself as one study day', () => {
        seedExam('2026-03-04');
        insertNewCards(10);
        const r = computePlan(U, EXAM)!;
        expect(r.availableDays).toBe(1);
        expect(r.recommendedNewPerDay).toBeGreaterThan(0);
    });
});

describe('computePlan — time budget is not fed by the committed rate', () => {
    it('ignores user_profiles.daily_new_limit (only ever written by plan commits / overrides)', () => {
        seedExam();
        insertNewCards(3000);
        const setLimit = (n: number) => h.db.prepare(`
            INSERT INTO user_profiles (id, daily_new_limit, created_at, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET daily_new_limit = excluded.daily_new_limit
        `).run(U, n, TS, TS);

        setLimit(5);
        const low = computePlan(U, EXAM)!;
        setLimit(80); // e.g. after committing / overriding to 80/day
        const high = computePlan(U, EXAM)!;

        // 20 new × 0.75 min + 200 reviews × 0.33 min (model defaults) = 81 min either way.
        expect(low.dailyTimeBudgetMinutes).toBe(81);
        expect(high.dailyTimeBudgetMinutes).toBe(81);
        expect(high.recommendedNewPerDay).toBe(low.recommendedNewPerDay);
    });
});

describe('empty deck scope ([]) is not "all decks"', () => {
    it('computePlan: [] yields an empty scope; null/undefined still means all decks', () => {
        seedExam();
        insertNewCards(7, 'd1');
        const empty = computePlan(U, EXAM, [])!;
        expect(empty.unseenTotal).toBe(0);
        expect(empty.deckFilter).toEqual([]);
        expect(computePlan(U, EXAM, null)!.unseenTotal).toBe(7);
        expect(computePlan(U, EXAM)!.unseenTotal).toBe(7);
    });

    it('getPlanProgress: [] counts nothing; null counts every deck', () => {
        insertNewCards(4, 'd1');
        introduce(3, new Date(2026, 2, 4, 9, 0), 'd1');
        const empty = getPlanProgress(U, ACTIVATED, []);
        expect(empty.currentUnseen).toBe(0);
        expect(empty.studiedSincePlanStart).toBe(0);
        expect(empty.studiedToday).toBe(0);
        expect(empty.activityToday.total).toBe(0);

        const all = getPlanProgress(U, ACTIVATED, null);
        expect(all.currentUnseen).toBe(4);
        expect(all.studiedToday).toBe(3);
    });

    it('reactivatePlan refuses a plan whose every scoped deck was deleted', () => {
        seedExam();
        insertPlan({ id: 'current', rate: 10, activatedAt: ACTIVATED });
        insertPlan({ id: 'emptied', rate: 30, activatedAt: TS, deckFilter: [], status: 'archived' });

        expect(reactivatePlan(U, 'emptied')).toBeNull();
        expect(planRow('emptied')!.status).toBe('archived');
        expect(planRow('current')!.status).toBe('active');
    });
});

// ── Atomic plan writes ──────────────────────────────────────────────────────

describe('plan writes are atomic', () => {
    it('createPlan rolls back the archive of the previous plan when the insert fails', () => {
        seedExam();
        insertNewCards(10);
        insertPlan({ id: 'p0', rate: 10, activatedAt: ACTIVATED });
        const snapshot = computePlan(U, EXAM) as PlanResult;

        // name is NOT NULL — the INSERT throws after the archive UPDATE ran.
        expect(() => createPlan(U, EXAM, 12, null as unknown as string, snapshot)).toThrow();
        expect(planRow('p0')!.status).toBe('active');
        expect((h.db.prepare('SELECT COUNT(*) AS n FROM plans').get() as { n: number }).n).toBe(1);
    });

    it('createPlan commits archive + insert + mirror together on success', () => {
        seedExam();
        insertNewCards(10);
        insertPlan({ id: 'p0', rate: 10, activatedAt: ACTIVATED });
        const plan = createPlan(U, EXAM, 12, 'New', computePlan(U, EXAM)!);
        expect(planRow('p0')!.status).toBe('archived');
        expect(planRow(plan.id)!.status).toBe('active');
        expect(dailyNewLimit()).toBe(12);
    });

    it('reactivatePlan leaves both plans untouched when the profile mirror fails', () => {
        seedExam();
        insertPlan({ id: 'current', rate: 10, activatedAt: ACTIVATED });
        insertPlan({ id: 'old', rate: 30, activatedAt: TS, status: 'archived' });
        h.db.exec('DROP TABLE user_profiles'); // make the last write fail

        expect(() => reactivatePlan(U, 'old')).toThrow();
        expect(planRow('current')!.status).toBe('active');
        expect(planRow('old')!.status).toBe('archived');
        expect(planRow('old')!.activated_at).toBe(TS);
    });

    it('updatePlanRate leaves the plan untouched when the profile mirror fails', () => {
        seedExam();
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        h.db.exec('DROP TABLE user_profiles');

        expect(() => updatePlanRate(U, EXAM, 9)).toThrow();
        expect(planRow('p1')!.cards_per_day).toBe(5);
        expect(planRow('p1')!.updated_at).toBe(ACTIVATED);
    });

    it('updatePlanRate mirrors the rate and clears any override', () => {
        seedExam();
        insertPlan({ id: 'p1', rate: 5, activatedAt: ACTIVATED });
        h.db.prepare(`INSERT INTO user_profiles (id, daily_new_limit, plan_override_expires_at, created_at, updated_at)
                      VALUES (?, 40, '2099-01-01T00:00:00.000Z', ?, ?)`).run(U, TS, TS);
        updatePlanRate(U, EXAM, 8.6);
        expect(planRow('p1')!.cards_per_day).toBe(9);
        expect(dailyNewLimit()).toBe(9);
        expect((h.db.prepare('SELECT plan_override_expires_at AS e FROM user_profiles WHERE id = ?').get(U) as { e: string | null }).e)
            .toBeNull();
    });
});

describe('clearPlanOverride — scoped to the exam', () => {
    it("restores the primary exam's plan rate, not a stale active plan from another exam", () => {
        seedExam(FAR_EXAM, EXAM, 1, 1);           // primary
        seedExam(FAR_EXAM, 'other-exam', 2, 0);   // not primary
        insertPlan({ id: 'primary', rate: 15, activatedAt: ACTIVATED });
        // Activated LATER — the old "most recently activated across all exams" pick.
        insertPlan({ id: 'stale', rate: 40, activatedAt: new Date(2026, 2, 3).toISOString(), examKey: 'other-exam' });

        clearPlanOverride(U);
        expect(dailyNewLimit()).toBe(15);

        clearPlanOverride(U, 'other-exam'); // explicit exam still honoured
        expect(dailyNewLimit()).toBe(40);
    });

    it('falls back to the default limit when the exam has no active plan', () => {
        seedExam();
        clearPlanOverride(U);
        expect(dailyNewLimit()).toBe(20);
    });
});
