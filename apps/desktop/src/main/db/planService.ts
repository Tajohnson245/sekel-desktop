/**
 * Plan Mode calculation service — multi-plan model.
 *
 * computePlan() is a pure computation function (no DB writes); it is used
 * both for the creation-panel suggestion and internally by rebalance detection.
 * createPlan() commits a user's chosen rate and persists it to the `plans` table.
 *
 * All reads and writes go through the local SQLite database (getDb()).
 * Supabase is never called from this module.
 */

import { randomUUID } from 'crypto';
import { getDb } from './index';
import { getSystemPerformanceNeeds } from './service';
import { buildWeeklyProjection, daysUntilExamLocal, MINUTES_PER_NEW_CARD, MINUTES_PER_REVIEW } from '../../lib/planMath';
import { localDateKey } from '../../lib/localDate';
import { yieldCteBody, toYieldLevel, YIELD_LEVEL_ORDER } from './yieldSql';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanResult {
    examKey: string;
    examDate: string;
    availableDays: number;
    unseenTotal: number;
    unseenHighYield: number;
    unseenMediumYield: number;
    unseenLowYield: number;
    unseenUnclassified: number;
    recommendedNewPerDay: number;
    projectedCoverage: number;
    projectedCoverageCount: number;
    weeklyProjection: WeeklyProjection[];
    systemCoverage: SystemCoverageRow[];
    dailyTimeBudgetMinutes: number;
    projectedPeakDailyMinutes: number;
    /** Per-card minutes used for this projection — calibrated from the user's real
     *  review durations (falls back to model defaults). Surfaced so the renderer's
     *  live preview projects with the same timings the snapshot was built with. */
    minutesPerNewCard: number;
    minutesPerReview: number;
    /** Deck IDs this plan was scoped to; null = all decks, [] = no decks. */
    deckFilter: string[] | null;
    generatedAt: string;
}

export interface WeeklyProjection {
    week: number;
    newCardsPerDay: number;
    estimatedReviewsPerDay: number;
    estimatedTotalMinutes: number;
}

export interface SystemCoverageRow {
    systemKey: string;
    label: string;
    blueprintWeightMidpoint: number;
    /** Unseen (state='new') classified cards in this system, within plan scope. */
    totalCards: number;
    /** Studied (non-new) classified cards in this system, within plan scope. Lets the
     *  UI tell "not started" (0 studied) from "on track", and "fully studied" (0 unseen
     *  but >0 studied) from "no classified cards at all". */
    seenCards: number;
    cardsInPlan: number;
    cardsSkipped: number;
    coveragePct: number;
    performanceNeed: number;
}

export interface RebalanceDelta {
    previousNewPerDay: number;
    newNewPerDay: number;
    daysMissed: number;
    availableDaysRemaining: number;
    canExtendTimeline: boolean;
    /** Start of the evaluation window (ISO): when the current rate took effect.
     *  daysMissed only counts days after this, so it resets when a rate is accepted. */
    evaluatedSince: string;
}

export interface Plan {
    id: string;
    userId: string;
    examKey: string;
    name: string;
    /** The number the user chose to commit to. */
    cardsPerDay: number;
    /** What computePlan recommended at creation time. */
    suggestedPerDay: number;
    /** Full PlanResult snapshot at commit time. */
    snapshot: PlanResult;
    /** Deck IDs this plan was scoped to; null = all decks, [] = no decks. */
    deckFilter: string[] | null;
    status: 'active' | 'archived';
    activatedAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface DeckUnseenCount {
    deckId: string;
    name: string;
    unseenCount: number;
}

export interface ActivePlanResult {
    plan: Plan;
    /** Live-recomputed display view (coverage / weekly projection / system coverage /
     *  current unseen pool / days-to-exam) derived from the plan's committed inputs.
     *  null when a recompute isn't possible (e.g. exam date cleared) — callers fall
     *  back to the frozen plan.snapshot. The stored plan.snapshot stays the immutable
     *  commit-time record used by the plan history. */
    liveView: PlanResult | null;
    /** plan_override_expires_at from user_profiles; null when no override is active. */
    overrideExpiresAt: string | null;
    /** user_profiles.daily_new_limit — equals cardsPerDay normally, override value when active. */
    currentDailyNewLimit: number;
}

// ── Cohort review-load math lives in lib/planMath (shared with the renderer's
//    live creation preview so the two cannot drift). dailyMinutes / weekMultiplier
//    / buildWeeklyProjection are imported above.

// ── Yield level helpers ───────────────────────────────────────────────────────
// toYieldLevel / YIELD_LEVEL_ORDER + the yield CTE now live in ./yieldSql so the
// scoring model can't drift between the plan engine and the study queue.

// ── Row → Plan deserialiser ───────────────────────────────────────────────────

type PlanRow = {
    id: string;
    user_id: string;
    exam_key: string;
    name: string;
    cards_per_day: number;
    suggested_per_day: number;
    snapshot: string;
    deck_filter: string | null;
    status: string;
    activated_at: string;
    created_at: string;
    updated_at: string;
};

/** plans.deck_filter → scope. NULL = all decks; '[]' = NO decks (kept distinct —
 *  an empty scope must never widen to "all decks"). */
function parseDeckFilter(raw: string | null): string[] | null {
    return raw ? JSON.parse(raw) as string[] : null;
}

/**
 * SQL fragment restricting `column` to a plan's deck scope: null → no restriction
 * (all decks); [] → matches nothing; otherwise `AND column IN (…)`.
 */
function deckScopeClause(column: string, deckFilter: string[] | null): { sql: string; params: string[] } {
    if (deckFilter === null) return { sql: '', params: [] };
    if (deckFilter.length === 0) return { sql: 'AND 0', params: [] };
    return { sql: `AND ${column} IN (${deckFilter.map(() => '?').join(',')})`, params: deckFilter };
}

/** The user's primary exam key — the exam getActivePlan / the study queue resolve to. */
function resolvePrimaryExamKey(userId: string): string | undefined {
    return (getDb().prepare(`
        SELECT be.exam_key
        FROM user_exam_profiles uep
        JOIN blueprint_exams be ON be.id = uep.exam_id
        WHERE uep.user_id = ? AND uep.is_primary = 1
    `).get(userId) as { exam_key: string } | undefined)?.exam_key;
}

function rowToPlan(row: PlanRow): Plan {
    return {
        id:              row.id,
        userId:          row.user_id,
        examKey:         row.exam_key,
        name:            row.name,
        cardsPerDay:     row.cards_per_day,
        suggestedPerDay: row.suggested_per_day,
        snapshot:        JSON.parse(row.snapshot) as PlanResult,
        deckFilter:      parseDeckFilter(row.deck_filter),
        status:          row.status as 'active' | 'archived',
        activatedAt:     row.activated_at,
        createdAt:       row.created_at,
        updatedAt:       row.updated_at,
    };
}

// ── Core: computePlan (pure — no DB writes) ───────────────────────────────────

const EXAM_DATE_SENTINEL = '9999-12-31';
/** Reviews with fewer than this many measured durations fall back to model defaults. */
const MIN_DURATION_SAMPLES = 20;
/** New-card allowance behind the daily time budget (and the no-plan default cap). */
const DEFAULT_DAILY_NEW_LIMIT = 20;

/**
 * @param deckIds plan scope — undefined/null = all decks; an EMPTY array is a real,
 *   empty scope (e.g. every scoped deck was deleted) and yields no cards rather
 *   than silently widening to all decks.
 * @param cardsPerDay committed rate (plan creation / active-plan live view). When
 *   omitted the result is a fresh suggestion.
 */
export function computePlan(userId: string, examKey: string, deckIds?: string[] | null, cardsPerDay?: number): PlanResult | null {
    const deckFilter = deckIds ?? null;
    const db = getDb();

    // 1. Exam profile — must exist and have a real date
    const examRow = db.prepare(`
        SELECT uep.exam_date, be.exam_key, be.label AS exam_label, be.id AS exam_id
        FROM user_exam_profiles uep
        JOIN blueprint_exams be ON be.id = uep.exam_id
        WHERE uep.user_id = ? AND be.exam_key = ? AND uep.is_primary = 1
    `).get(userId, examKey) as {
        exam_date: string;
        exam_key: string;
        exam_label: string;
        exam_id: number;
    } | undefined;

    if (!examRow || examRow.exam_date === EXAM_DATE_SENTINEL) return null;

    // 1b. Available days until exam — LOCAL calendar days (see daysUntilExamLocal).
    //     Exam day itself still counts as one study day (clamped to ≥1). Once the
    //     exam has PASSED there is no study window left, so nothing is recommended:
    //       • a fresh suggestion (no committed rate) returns null — the creation
    //         panel asks for a new exam date and rebalance stays quiet;
    //       • a committed plan's live view still recomputes the current unseen pool
    //         and system coverage, over a 0-day window (no projected coverage, empty
    //         projection, recommendedNewPerDay 0) instead of clamping to 1 day and
    //         recommending up to 100 new cards/day.
    const daysUntilExam    = daysUntilExamLocal(examRow.exam_date);
    const examPassed       = daysUntilExam < 0;
    const hasCommittedRate = cardsPerDay != null && cardsPerDay > 0;
    if (examPassed && !hasCommittedRate) return null;
    const availableDays = examPassed ? 0 : Math.max(1, daysUntilExam);

    // 2. Daily limits behind the time budget. user_profiles.daily_new_limit is NOT
    //    used: locally it is only ever written by plan code (create / reactivate /
    //    accept-rate / one-session override) and never mirrored from the user's
    //    settings, so reading it made each recommendation feed on the previously
    //    committed (or overridden) rate. daily_review_limit is never written locally.
    const profileRow = db.prepare(
        'SELECT daily_review_limit FROM user_profiles WHERE id = ?'
    ).get(userId) as { daily_review_limit: number | null } | undefined;

    const dailyNewLimit    = DEFAULT_DAILY_NEW_LIMIT;
    const dailyReviewLimit = profileRow?.daily_review_limit ?? 200;

    // 2b. Calibrated per-card time from the user's own measured review durations, so
    // the projection reflects how fast THEY actually study. Falls back to the model
    // defaults until there's enough signal (≥ MIN_DURATION_SAMPLES of each kind).
    const durRow = db.prepare(`
        SELECT
            AVG(CASE WHEN state_before =  'new' THEN review_duration_ms END) AS new_ms,
            AVG(CASE WHEN state_before <> 'new' THEN review_duration_ms END) AS review_ms,
            SUM(CASE WHEN state_before =  'new' THEN 1 ELSE 0 END) AS new_n,
            SUM(CASE WHEN state_before <> 'new' THEN 1 ELSE 0 END) AS review_n
        FROM reviews
        WHERE user_id = ? AND review_duration_ms IS NOT NULL
    `).get(userId) as { new_ms: number | null; review_ms: number | null; new_n: number; review_n: number } | undefined;

    const clampMin = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const minutesPerNewCard = durRow && durRow.new_n >= MIN_DURATION_SAMPLES && durRow.new_ms
        ? clampMin(durRow.new_ms / 60_000, 0.15, 3)
        : MINUTES_PER_NEW_CARD;
    const minutesPerReview = durRow && durRow.review_n >= MIN_DURATION_SAMPLES && durRow.review_ms
        ? clampMin(durRow.review_ms / 60_000, 0.05, 2)
        : MINUTES_PER_REVIEW;
    const cal = { minutesPerNewCard, minutesPerReview };

    const dailyTimeBudgetMinutes = Math.round(dailyNewLimit * minutesPerNewCard + dailyReviewLimit * minutesPerReview);

    // 4. Unseen cards with yield levels via inline yield-score CTE
    type UnseenRow = {
        card_id: string;
        system_key: string | null;
        yield_score: number | null;
        max_confidence: number | null;
    };

    const yieldCte = `WITH yield_cte AS (${yieldCteBody()})`;

    let unseenRows: UnseenRow[];
    if (deckFilter && deckFilter.length === 0) {
        unseenRows = []; // empty scope — no decks, no cards
    } else if (deckFilter) {
        const placeholders = deckFilter.map(() => '?').join(',');
        unseenRows = db.prepare(`
            ${yieldCte}
            SELECT c.id AS card_id, ys.system_key, ys.yield_score, ys.max_confidence
            FROM cards c
            JOIN notes n ON n.id = c.note_id
            LEFT JOIN yield_cte ys ON ys.card_id = c.id
            WHERE c.user_id = ? AND c.state = 'new' AND n.deck_id IN (${placeholders})
        `).all(examRow.exam_id, userId, ...deckFilter) as UnseenRow[];
    } else {
        unseenRows = db.prepare(`
            ${yieldCte}
            SELECT c.id AS card_id, ys.system_key, ys.yield_score, ys.max_confidence
            FROM cards c
            LEFT JOIN yield_cte ys ON ys.card_id = c.id
            WHERE c.user_id = ? AND c.state = 'new'
        `).all(examRow.exam_id, userId) as UnseenRow[];
    }

    const withLevels = unseenRows.map(row => ({
        ...row,
        level: toYieldLevel(row.yield_score, row.max_confidence),
    }));

    const unseenTotal          = withLevels.length;
    const unseenHighYield      = withLevels.filter(c => c.level === 'high').length;
    const unseenMediumYield    = withLevels.filter(c => c.level === 'medium').length;
    const unseenLowYield       = withLevels.filter(c => c.level === 'low').length;
    const unseenUnclassified   = withLevels.filter(c => c.level === 'unclassified').length;

    // 5. Recommended new per day — the max rate whose projected PEAK daily load
    //    (over the whole study window, calibrated to the user's timings) still fits
    //    their daily time budget. Peak rises monotonically with the rate, so break
    //    on the first rate that overshoots. Nothing to recommend once the exam passed.
    let recommendedNewPerDay = 0;
    if (!examPassed) {
        const maxNeeded = unseenTotal > 0 ? Math.ceil(unseenTotal / availableDays) : 100;
        recommendedNewPerDay = 5;
        for (let n = 5; n <= 100; n++) {
            const { peakMinutes } = buildWeeklyProjection(n, unseenTotal, availableDays, 16, cal);
            if (peakMinutes <= dailyTimeBudgetMinutes) recommendedNewPerDay = n;
            else break;
        }
        recommendedNewPerDay = Math.min(recommendedNewPerDay, maxNeeded, 100);
    }

    // When a committed rate is supplied (plan creation), coverage / system breakdown /
    // weekly projection are all computed for THAT rate; recommendedNewPerDay stays the
    // suggestion. Without it (suggestion preview) effectiveRate === recommendedNewPerDay,
    // so this is a no-op for the live suggestion path.
    const effectiveRate = hasCommittedRate ? cardsPerDay : recommendedNewPerDay;

    // 6. Projected coverage — sort by yield priority, take first projectedCoverageCount
    const projectedCoverageCount = Math.min(unseenTotal, effectiveRate * availableDays);
    const sorted = [...withLevels].sort((a, b) => YIELD_LEVEL_ORDER[a.level] - YIELD_LEVEL_ORDER[b.level]);
    const inPlanIds = new Set(sorted.slice(0, projectedCoverageCount).map(c => c.card_id));
    const projectedCoverage = unseenTotal > 0 ? projectedCoverageCount / unseenTotal : 1;

    // 7. Weekly projection — exhaustion-aware (shared cohort math, lib/planMath).
    //    16 rows for display; peakMinutes is measured over the FULL window regardless.
    const { weeks: weeklyProjection, peakMinutes: projectedPeakDailyMinutes } =
        buildWeeklyProjection(effectiveRate, unseenTotal, availableDays, 16, cal);

    // 8. System coverage — join with performance needs
    type SysRow = { system_key: string; label: string; weight_min: number | null; weight_max: number | null };
    const systemRows = db.prepare(
        'SELECT system_key, label, weight_min, weight_max FROM blueprint_systems WHERE exam_id = ?'
    ).all(examRow.exam_id) as SysRow[];

    const perfNeeds = getSystemPerformanceNeeds(userId, examKey);
    const perfMap   = new Map(perfNeeds.map(n => [n.system_key, n.performance_need]));

    // Studied (non-new) classified cards per DOMINANT system (max split_weight),
    // matching how unseen cards are bucketed — so seen + unseen describe the same
    // per-system population. Scoped to the plan's decks when a deck filter is set.
    type SeenRow = { system_key: string; seen: number };
    const domSubquery = `
        SELECT cc.card_id,
            (SELECT bs2.system_key FROM card_classifications cc2
             JOIN blueprint_systems bs2 ON bs2.id = cc2.system_id
             WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
             ORDER BY cc2.split_weight DESC LIMIT 1) AS system_key
        FROM card_classifications cc WHERE cc.exam_id = ? GROUP BY cc.card_id`;
    let seenRows: SeenRow[];
    if (deckFilter && deckFilter.length === 0) {
        seenRows = []; // empty scope
    } else if (deckFilter) {
        const ph = deckFilter.map(() => '?').join(',');
        seenRows = db.prepare(`
            SELECT dom.system_key, COUNT(*) AS seen
            FROM cards c
            JOIN notes n ON n.id = c.note_id
            JOIN (${domSubquery}) dom ON dom.card_id = c.id
            WHERE c.user_id = ? AND c.state != 'new' AND dom.system_key IS NOT NULL AND n.deck_id IN (${ph})
            GROUP BY dom.system_key
        `).all(examRow.exam_id, userId, ...deckFilter) as SeenRow[];
    } else {
        seenRows = db.prepare(`
            SELECT dom.system_key, COUNT(*) AS seen
            FROM cards c
            JOIN (${domSubquery}) dom ON dom.card_id = c.id
            WHERE c.user_id = ? AND c.state != 'new' AND dom.system_key IS NOT NULL
            GROUP BY dom.system_key
        `).all(examRow.exam_id, userId) as SeenRow[];
    }
    const seenMap = new Map(seenRows.map(r => [r.system_key, r.seen]));

    const systemCoverage: SystemCoverageRow[] = systemRows.map(sys => {
        const sysCards   = withLevels.filter(c => c.system_key === sys.system_key);
        const totalCards = sysCards.length;
        const cardsInPlan = sysCards.filter(c => inPlanIds.has(c.card_id)).length;
        const wMin = sys.weight_min ?? 0;
        const wMax = sys.weight_max ?? 0;
        return {
            systemKey: sys.system_key,
            label: sys.label,
            blueprintWeightMidpoint: (wMin + wMax) / 2,
            totalCards,
            seenCards: seenMap.get(sys.system_key) ?? 0,
            cardsInPlan,
            cardsSkipped: totalCards - cardsInPlan,
            coveragePct: totalCards > 0 ? Math.round((cardsInPlan / totalCards) * 100) : 100,
            performanceNeed: perfMap.get(sys.system_key) ?? 0,
        };
    }).sort((a, b) => {
        if (b.cardsSkipped !== a.cardsSkipped) return b.cardsSkipped - a.cardsSkipped;
        return b.blueprintWeightMidpoint - a.blueprintWeightMidpoint;
    });

    return {
        examKey: examRow.exam_key,
        examDate: examRow.exam_date,
        availableDays,
        unseenTotal,
        unseenHighYield,
        unseenMediumYield,
        unseenLowYield,
        unseenUnclassified,
        recommendedNewPerDay,
        projectedCoverage,
        projectedCoverageCount,
        weeklyProjection,
        systemCoverage,
        dailyTimeBudgetMinutes,
        projectedPeakDailyMinutes,
        minutesPerNewCard,
        minutesPerReview,
        deckFilter,
        generatedAt: new Date().toISOString(),
    };
}

// ── user_profiles mirror ──────────────────────────────────────────────────────

/** Mirror a committed rate into user_profiles.daily_new_limit and clear any
 *  one-session override. Callers run it inside their plan-write transaction. */
function mirrorCommittedRate(userId: string, rate: number, now: string): void {
    getDb().prepare(`
        INSERT INTO user_profiles (id, daily_new_limit, plan_override_expires_at, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            daily_new_limit          = excluded.daily_new_limit,
            plan_override_expires_at = NULL,
            updated_at               = excluded.updated_at
    `).run(userId, rate, now, now);
}

// ── createPlan ────────────────────────────────────────────────────────────────

/**
 * Commit a plan.  Archives any currently-active plan for the same exam,
 * inserts the new plan as 'active', and updates user_profiles.daily_new_limit
 * so fetchDueCards picks up the committed rate immediately. The three writes are
 * one transaction — a failure can't leave the exam with no active plan, or with
 * a plan whose rate isn't mirrored.
 */
export function createPlan(
    userId: string,
    examKey: string,
    cardsPerDay: number,
    name: string,
    snapshot: PlanResult,
): Plan {
    const db  = getDb();
    const id  = randomUUID();
    const now = new Date().toISOString();

    // Recompute the snapshot for the committed rate so coverage, the per-system
    // breakdown, and the weekly projection reflect cards_per_day — not the original
    // suggestion. computePlan keeps recommendedNewPerDay as the suggestion. Only the
    // client snapshot's deck scope is consumed; fall back to it if a fresh compute
    // isn't available (e.g. exam date cleared between preview and commit).
    const committedSnapshot =
        computePlan(userId, examKey, snapshot.deckFilter, cardsPerDay) ?? snapshot;

    const deckFilterJson = committedSnapshot.deckFilter ? JSON.stringify(committedSnapshot.deckFilter) : null;

    db.transaction(() => {
        db.prepare(`
            UPDATE plans SET status = 'archived', updated_at = ?
            WHERE user_id = ? AND exam_key = ? AND status = 'active'
        `).run(now, userId, examKey);

        db.prepare(`
            INSERT INTO plans
                (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
                 snapshot, deck_filter, status, activated_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).run(id, userId, examKey, name, cardsPerDay, committedSnapshot.recommendedNewPerDay,
               JSON.stringify(committedSnapshot), deckFilterJson, now, now, now);

        // Mirror committed rate into user_profiles so session card cap is immediate
        mirrorCommittedRate(userId, cardsPerDay, now);
    })();

    return {
        id, userId, examKey, name, cardsPerDay,
        suggestedPerDay: committedSnapshot.recommendedNewPerDay,
        snapshot: committedSnapshot, deckFilter: committedSnapshot.deckFilter,
        status: 'active',
        activatedAt: now, createdAt: now, updatedAt: now,
    };
}

// ── getActivePlan ─────────────────────────────────────────────────────────────

/**
 * Returns the active plan plus override metadata from user_profiles.
 * If examKey is omitted the most-recently-activated plan across all exams is returned.
 */
export function getActivePlan(userId: string, examKey?: string): ActivePlanResult | null {
    const db = getDb();

    // When no examKey is given, scope to the user's primary exam profile.
    // This prevents a stale/leftover active plan from a different (or removed)
    // exam from leaking onto the dashboard.
    const resolvedExamKey = examKey ?? resolvePrimaryExamKey(userId);

    if (!resolvedExamKey) return null;

    const row = db.prepare(`
        SELECT * FROM plans
        WHERE user_id = ? AND exam_key = ? AND status = 'active'
        ORDER BY activated_at DESC LIMIT 1
    `).get(userId, resolvedExamKey) as PlanRow | undefined;

    if (!row) return null;

    const profileRow = db.prepare(
        'SELECT daily_new_limit, plan_override_expires_at FROM user_profiles WHERE id = ?'
    ).get(userId) as { daily_new_limit: number | null; plan_override_expires_at: string | null } | undefined;

    const plan = rowToPlan(row);

    // Live view — recompute coverage / weekly projection / system coverage / current
    // unseen pool / days-to-exam from the plan's committed inputs (its chosen rate and
    // deck scope) so the active-plan screen reflects reality (moved exam date, cards
    // studied since commit, cards re-classified) instead of the frozen commit-time
    // snapshot. Falls back to null when a recompute isn't possible; callers then use
    // plan.snapshot. History (listPlans) always reads the frozen snapshot.
    const liveView = computePlan(userId, resolvedExamKey, plan.deckFilter, plan.cardsPerDay);

    return {
        plan,
        liveView,
        overrideExpiresAt:   profileRow?.plan_override_expires_at ?? null,
        currentDailyNewLimit: profileRow?.daily_new_limit ?? row.cards_per_day,
    };
}

// ── listPlans ─────────────────────────────────────────────────────────────────

export function listPlans(userId: string): Plan[] {
    return (getDb().prepare(
        'SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as PlanRow[]).map(rowToPlan);
}

// ── archivePlan ───────────────────────────────────────────────────────────────

export function archivePlan(userId: string, planId: string): void {
    const now = new Date().toISOString();
    getDb().prepare(
        'UPDATE plans SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run('archived', now, planId, userId);
}

export function getPlanById(userId: string, planId: string): Plan | null {
    const row = getDb().prepare(
        'SELECT * FROM plans WHERE id = ? AND user_id = ?'
    ).get(planId, userId) as PlanRow | undefined;
    return row ? rowToPlan(row) : null;
}

// ── deletePlan ────────────────────────────────────────────────────────────────

export function deletePlan(userId: string, planId: string): void {
    getDb().prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(planId, userId);
}

// ── fetchPlansReferencingDecks ────────────────────────────────────────────────

/**
 * Returns active plans that reference any of the given deck IDs in their deck_filter.
 * Used to warn users before deck deletion that their plan scope will be affected.
 */
export function fetchPlansReferencingDecks(
    userId: string,
    deckIds: string[],
): { id: string; name: string }[] {
    if (deckIds.length === 0) return [];
    const rows = getDb().prepare(`
        SELECT id, name, deck_filter FROM plans
        WHERE user_id = ? AND status = 'active' AND deck_filter IS NOT NULL
    `).all(userId) as { id: string; name: string; deck_filter: string }[];

    const deckIdSet = new Set(deckIds);
    return rows
        .filter(row => {
            try {
                const filter = JSON.parse(row.deck_filter) as string[];
                return filter.some(id => deckIdSet.has(id));
            } catch { return false; }
        })
        .map(row => ({ id: row.id, name: row.name }));
}

// ── reactivatePlan ────────────────────────────────────────────────────────────

/**
 * Archives the current active plan (if any) and reactivates the requested plan.
 * Updates activated_at so rebalance detection uses the new activation date. All
 * writes are one transaction.
 *
 * Returns null (no-op) for a plan whose deck scope is empty — every deck it was
 * scoped to has been deleted, so there's nothing left to study (deck deletion
 * archives such plans; reactivating would just recreate an empty active plan).
 */
export function reactivatePlan(userId: string, planId: string): Plan | null {
    const db  = getDb();
    const now = new Date().toISOString();

    return db.transaction((): Plan | null => {
        const row = db.prepare(
            'SELECT * FROM plans WHERE id = ? AND user_id = ?'
        ).get(planId, userId) as PlanRow | undefined;

        if (!row) return null;
        const deckFilter = parseDeckFilter(row.deck_filter);
        if (deckFilter && deckFilter.length === 0) return null;

        // Archive current active for same exam
        db.prepare(`
            UPDATE plans SET status = 'archived', updated_at = ?
            WHERE user_id = ? AND exam_key = ? AND status = 'active' AND id != ?
        `).run(now, userId, row.exam_key, planId);

        // Reactivate, resetting activated_at so rebalance window starts fresh
        db.prepare(`
            UPDATE plans SET status = 'active', activated_at = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        `).run(now, now, planId, userId);

        // Mirror rate back to user_profiles and clear any stale override
        mirrorCommittedRate(userId, row.cards_per_day, now);

        return rowToPlan({ ...row, status: 'active', activated_at: now, updated_at: now });
    })();
}

// ── Rate changes / overrides ──────────────────────────────────────────────────

/**
 * Commit a new rate to the exam's active plan (rebalance "accept") and mirror it
 * to user_profiles.daily_new_limit, clearing any live override — one transaction.
 *
 * Bumping plans.updated_at here is what marks "the current rate took effect":
 * getPlanRebalanceDelta only judges days after it, so days already missed under
 * the old rate aren't re-judged against the new one.
 */
export function updatePlanRate(userId: string, examKey: string, newRate: number): void {
    const db   = getDb();
    const now  = new Date().toISOString();
    const rate = Math.max(1, Math.round(newRate));

    db.transaction(() => {
        db.prepare(`
            UPDATE plans SET cards_per_day = ?, updated_at = ?
            WHERE user_id = ? AND exam_key = ? AND status = 'active'
        `).run(rate, now, userId, examKey);

        mirrorCommittedRate(userId, rate, now);
    })();
}

/**
 * Clear a one-session override: restore the committed rate of the active plan for
 * `examKey` (default: the user's primary exam — the plan getActivePlan and the
 * study queue use), not whichever active plan was activated most recently across
 * all exams. Falls back to the default limit when that exam has no active plan.
 */
export function clearPlanOverride(userId: string, examKey?: string): void {
    const db  = getDb();
    const now = new Date().toISOString();

    db.transaction(() => {
        const resolvedExamKey = examKey ?? resolvePrimaryExamKey(userId);
        const activeRow = resolvedExamKey
            ? db.prepare(`
                SELECT cards_per_day FROM plans
                WHERE user_id = ? AND exam_key = ? AND status = 'active'
                ORDER BY activated_at DESC LIMIT 1
            `).get(userId, resolvedExamKey) as { cards_per_day: number } | undefined
            : undefined;

        mirrorCommittedRate(userId, activeRow?.cards_per_day ?? DEFAULT_DAILY_NEW_LIMIT, now);
    })();
}

// ── Rebalance detection ───────────────────────────────────────────────────────

/**
 * "You missed N days — your plan adjusted to M new cards/day." Returns null when
 * there's nothing to say: no active plan, exam today / passed / unset, no new cards
 * studied yet under the current rate, no missed days, nothing left unseen in scope,
 * or a recomputed rate within ±1 of the committed one.
 *
 * Days are LOCAL calendar days. A day counts as missed when fewer than the
 * committed number of new cards (within the plan's deck scope) were introduced.
 */
export function getPlanRebalanceDelta(userId: string, examKey: string): RebalanceDelta | null {
    const db = getDb();

    const activeRow = db.prepare(`
        SELECT cards_per_day, activated_at, updated_at, deck_filter FROM plans
        WHERE user_id = ? AND exam_key = ? AND status = 'active'
        ORDER BY activated_at DESC LIMIT 1
    `).get(userId, examKey) as
        { cards_per_day: number; activated_at: string; updated_at: string; deck_filter: string | null } | undefined;

    if (!activeRow) return null;

    // On or after exam day there's no window left to rebalance into.
    const examRow = db.prepare(`
        SELECT uep.exam_date
        FROM user_exam_profiles uep
        JOIN blueprint_exams be ON be.id = uep.exam_id
        WHERE uep.user_id = ? AND be.exam_key = ? AND uep.is_primary = 1
    `).get(userId, examKey) as { exam_date: string } | undefined;
    if (!examRow || examRow.exam_date === EXAM_DATE_SENTINEL) return null;
    if (daysUntilExamLocal(examRow.exam_date) <= 0) return null;

    const previousNewPerDay = activeRow.cards_per_day;
    const deckFilter        = parseDeckFilter(activeRow.deck_filter);

    // Judge only days since the CURRENT rate took effect: activation, or the last
    // change to the plan's commitment — accepting a rebalanced rate (updatePlanRate)
    // or its deck scope being pruned — both of which bump updated_at. Otherwise an
    // accepted higher rate re-judged every earlier day against itself.
    const evaluatedSince = activeRow.updated_at > activeRow.activated_at
        ? activeRow.updated_at
        : activeRow.activated_at;

    // New cards introduced since then, within the plan's deck scope.
    const scope = deckScopeClause('deck_id', deckFilter);
    const newReviewTimes = (db.prepare(`
        SELECT review_time FROM reviews
        WHERE user_id = ? AND review_time >= ? AND state_before = 'new' ${scope.sql}
        ORDER BY review_time ASC
    `).all(userId, evaluatedSince, ...scope.params) as { review_time: string }[]).map(r => r.review_time);

    // A plan that has never been studied shouldn't accumulate "missed" days —
    // those days never had a study commitment in practice. Anchor the walk to the
    // first new-card review so missed days only count *after* the user actually
    // started reviewing under this rate.
    if (newReviewTimes.length === 0) return null;

    // Per LOCAL-day new-card counts (SQLite's DATE() would bucket by UTC and push a
    // west-of-UTC user's evening session into the next day).
    const studiedMap = new Map<string, number>();
    for (const t of newReviewTimes) {
        const key = localDateKey(new Date(t));
        studiedMap.set(key, (studiedMap.get(key) ?? 0) + 1);
    }

    // Walk local days from the day after the first review up to yesterday.
    const cursor = new Date(newReviewTimes[0]);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() + 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysMissed = 0;
    while (cursor < today) {
        if ((studiedMap.get(localDateKey(cursor)) ?? 0) < previousNewPerDay) daysMissed++;
        cursor.setDate(cursor.getDate() + 1);
    }

    if (daysMissed === 0) return null;

    // Recompute over the plan's own deck scope, not every deck.
    const freshPlan = computePlan(userId, examKey, deckFilter);
    if (!freshPlan) return null;

    // Scope fully introduced → nothing to catch up on (and no "100/day" fallback).
    if (freshPlan.unseenTotal === 0) return null;

    // Only surface the banner when the new rate differs by more than 1
    if (Math.abs(freshPlan.recommendedNewPerDay - previousNewPerDay) <= 1) return null;

    return {
        previousNewPerDay,
        newNewPerDay:          freshPlan.recommendedNewPerDay,
        daysMissed,
        availableDaysRemaining: freshPlan.availableDays,
        canExtendTimeline:      freshPlan.availableDays > 7,
        evaluatedSince,
    };
}

// ── getPlanProgress ───────────────────────────────────────────────────────────

export interface PlanActivityCounts {
    again: number;
    hard:  number;
    good:  number;
    easy:  number;
    total: number;
}

export interface PlanProgress {
    /** New cards introduced (state_before = 'new') since plan was activated. */
    studiedSincePlanStart: number;
    /** Cards still in state = 'new' right now (within plan scope). */
    currentUnseen: number;
    /** New cards introduced today. */
    studiedToday: number;
    /** Rating breakdown of all reviews (new + review states) for cards in scope. */
    activityToday:           PlanActivityCounts;
    activityLast7Days:       PlanActivityCounts;
    activitySincePlanStart:  PlanActivityCounts;
}

/**
 * Live progress counters for an active plan.
 * activatedAt / deckFilter come from the Plan record so we don't re-fetch it.
 */
export function getPlanProgress(
    userId: string,
    activatedAt: string,
    deckFilter: string[] | null,
): PlanProgress {
    const db = getDb();

    // Deck filter clause — reviews table has deck_id directly. An empty filter ('[]'
    // — every scoped deck deleted) matches nothing rather than every deck.
    const { sql: reviewDeckClause, params: deckParams } = deckScopeClause('deck_id', deckFilter);

    // New cards introduced since plan activation
    const sinceRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) AS cnt
        FROM reviews
        WHERE user_id = ? AND state_before = 'new' AND review_time >= ?
        ${reviewDeckClause}
    `).get(userId, activatedAt, ...deckParams) as { cnt: number };

    // New cards introduced today
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const todayRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) AS cnt
        FROM reviews
        WHERE user_id = ? AND state_before = 'new' AND review_time >= ?
        ${reviewDeckClause}
    `).get(userId, midnight.toISOString(), ...deckParams) as { cnt: number };

    // Current unseen count — cards still untouched
    let currentUnseen: number;
    if (deckFilter) {
        const unseenScope = deckScopeClause('n.deck_id', deckFilter);
        const unseenRow = db.prepare(`
            SELECT COUNT(*) AS cnt
            FROM cards c
            JOIN notes n ON n.id = c.note_id
            WHERE c.user_id = ? AND c.state = 'new' ${unseenScope.sql}
        `).get(userId, ...unseenScope.params) as { cnt: number };
        currentUnseen = unseenRow.cnt;
    } else {
        const unseenRow = db.prepare(`
            SELECT COUNT(*) AS cnt
            FROM cards c
            WHERE c.user_id = ? AND c.state = 'new'
        `).get(userId) as { cnt: number };
        currentUnseen = unseenRow.cnt;
    }

    // ── Rating breakdown (Again/Hard/Good/Easy) for three windows ────────────
    type ActivityRow = {
        again: number | null;
        hard:  number | null;
        good:  number | null;
        easy:  number | null;
        total: number | null;
    };

    const activityStmt = db.prepare(`
        SELECT
            SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END) AS again,
            SUM(CASE WHEN rating = 'hard'  THEN 1 ELSE 0 END) AS hard,
            SUM(CASE WHEN rating = 'good'  THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN rating = 'easy'  THEN 1 ELSE 0 END) AS easy,
            COUNT(*)                                          AS total
        FROM reviews
        WHERE user_id = ? AND review_time >= ?
        ${reviewDeckClause}
    `);

    const toCounts = (row: ActivityRow): PlanActivityCounts => ({
        again: row.again ?? 0,
        hard:  row.hard  ?? 0,
        good:  row.good  ?? 0,
        easy:  row.easy  ?? 0,
        total: row.total ?? 0,
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activityToday = toCounts(
        activityStmt.get(userId, midnight.toISOString(), ...deckParams) as ActivityRow
    );
    const activityLast7Days = toCounts(
        activityStmt.get(userId, sevenDaysAgo.toISOString(), ...deckParams) as ActivityRow
    );
    const activitySincePlanStart = toCounts(
        activityStmt.get(userId, activatedAt, ...deckParams) as ActivityRow
    );

    return {
        studiedSincePlanStart: sinceRow.cnt,
        currentUnseen,
        studiedToday: todayRow.cnt,
        activityToday,
        activityLast7Days,
        activitySincePlanStart,
    };
}

// ── getDeckUnseenCounts ───────────────────────────────────────────────────────

/**
 * Returns all decks for a user with their current unseen card count.
 * Used to populate the deck-scope picker in the plan creation panel.
 */
export function getDeckUnseenCounts(userId: string): DeckUnseenCount[] {
    type Row = { deck_id: string; name: string; unseen_count: number };
    const rows = getDb().prepare(`
        SELECT d.id AS deck_id, d.name, COUNT(c.id) AS unseen_count
        FROM decks d
        LEFT JOIN notes n ON n.deck_id = d.id
        LEFT JOIN cards c ON c.note_id = n.id AND c.state = 'new' AND c.user_id = ?
        WHERE d.user_id = ?
        GROUP BY d.id, d.name
        ORDER BY d.name COLLATE NOCASE
    `).all(userId, userId) as Row[];

    return rows.map(r => ({ deckId: r.deck_id, name: r.name, unseenCount: r.unseen_count }));
}
