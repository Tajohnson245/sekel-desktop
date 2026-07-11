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
    /** Deck IDs this plan was scoped to; null = all decks. */
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
    /** Deck IDs this plan was scoped to; null = all decks. */
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

function rowToPlan(row: PlanRow): Plan {
    return {
        id:              row.id,
        userId:          row.user_id,
        examKey:         row.exam_key,
        name:            row.name,
        cardsPerDay:     row.cards_per_day,
        suggestedPerDay: row.suggested_per_day,
        snapshot:        JSON.parse(row.snapshot) as PlanResult,
        deckFilter:      row.deck_filter ? JSON.parse(row.deck_filter) as string[] : null,
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

export function computePlan(userId: string, examKey: string, deckIds?: string[], cardsPerDay?: number): PlanResult | null {
    const deckFilter = deckIds && deckIds.length > 0 ? deckIds : null;
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

    // 2. User profile for daily limits
    const profileRow = db.prepare(
        'SELECT daily_new_limit, daily_review_limit FROM user_profiles WHERE id = ?'
    ).get(userId) as { daily_new_limit: number | null; daily_review_limit: number | null } | undefined;

    const dailyNewLimit    = profileRow?.daily_new_limit    ?? 20;
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

    // 3. Available days until exam — LOCAL calendar days (see daysUntilExamLocal).
    //    Clamped to ≥1 so the projection math stays well-defined even on/after exam
    //    day (a today-or-past exam yields daysUntil ≤ 0).
    const availableDays = Math.max(1, daysUntilExamLocal(examRow.exam_date));

    // 4. Unseen cards with yield levels via inline yield-score CTE
    type UnseenRow = {
        card_id: string;
        system_key: string | null;
        yield_score: number | null;
        max_confidence: number | null;
    };

    const yieldCte = `WITH yield_cte AS (${yieldCteBody()})`;

    let unseenRows: UnseenRow[];
    if (deckFilter) {
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
    //    on the first rate that overshoots.
    const maxNeeded = unseenTotal > 0 ? Math.ceil(unseenTotal / availableDays) : 100;
    let recommendedNewPerDay = 5;
    for (let n = 5; n <= 100; n++) {
        const { peakMinutes } = buildWeeklyProjection(n, unseenTotal, availableDays, 16, cal);
        if (peakMinutes <= dailyTimeBudgetMinutes) recommendedNewPerDay = n;
        else break;
    }
    recommendedNewPerDay = Math.min(recommendedNewPerDay, maxNeeded, 100);

    // When a committed rate is supplied (plan creation), coverage / system breakdown /
    // weekly projection are all computed for THAT rate; recommendedNewPerDay stays the
    // suggestion. Without it (suggestion preview) effectiveRate === recommendedNewPerDay,
    // so this is a no-op for the live suggestion path.
    const effectiveRate = cardsPerDay != null && cardsPerDay > 0 ? cardsPerDay : recommendedNewPerDay;

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
    if (deckFilter) {
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

// ── createPlan ────────────────────────────────────────────────────────────────

/**
 * Commit a plan.  Archives any currently-active plan for the same exam,
 * inserts the new plan as 'active', and updates user_profiles.daily_new_limit
 * so fetchDueCards picks up the committed rate immediately.
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
        computePlan(userId, examKey, snapshot.deckFilter ?? undefined, cardsPerDay) ?? snapshot;

    db.prepare(`
        UPDATE plans SET status = 'archived', updated_at = ?
        WHERE user_id = ? AND exam_key = ? AND status = 'active'
    `).run(now, userId, examKey);

    const deckFilterJson = committedSnapshot.deckFilter ? JSON.stringify(committedSnapshot.deckFilter) : null;

    db.prepare(`
        INSERT INTO plans
            (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
             snapshot, deck_filter, status, activated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, userId, examKey, name, cardsPerDay, committedSnapshot.recommendedNewPerDay,
           JSON.stringify(committedSnapshot), deckFilterJson, now, now, now);

    // Mirror committed rate into user_profiles so session card cap is immediate
    db.prepare(`
        INSERT INTO user_profiles (id, daily_new_limit, plan_override_expires_at, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            daily_new_limit          = excluded.daily_new_limit,
            plan_override_expires_at = NULL,
            updated_at               = excluded.updated_at
    `).run(userId, cardsPerDay, now, now);

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
    const resolvedExamKey = examKey ?? (db.prepare(`
        SELECT be.exam_key
        FROM user_exam_profiles uep
        JOIN blueprint_exams be ON be.id = uep.exam_id
        WHERE uep.user_id = ? AND uep.is_primary = 1
    `).get(userId) as { exam_key: string } | undefined)?.exam_key;

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
    const liveView = computePlan(userId, resolvedExamKey, plan.deckFilter ?? undefined, plan.cardsPerDay);

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
 * Updates activated_at so rebalance detection uses the new activation date.
 */
export function reactivatePlan(userId: string, planId: string): Plan | null {
    const db  = getDb();
    const now = new Date().toISOString();

    const row = db.prepare(
        'SELECT * FROM plans WHERE id = ? AND user_id = ?'
    ).get(planId, userId) as PlanRow | undefined;

    if (!row) return null;

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
    db.prepare(`
        INSERT INTO user_profiles (id, daily_new_limit, plan_override_expires_at, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            daily_new_limit          = excluded.daily_new_limit,
            plan_override_expires_at = NULL,
            updated_at               = excluded.updated_at
    `).run(userId, row.cards_per_day, now, now);

    return rowToPlan({ ...row, status: 'active', activated_at: now, updated_at: now });
}

// ── Rebalance detection ───────────────────────────────────────────────────────

export function getPlanRebalanceDelta(userId: string, examKey: string): RebalanceDelta | null {
    const db = getDb();

    const activeRow = db.prepare(`
        SELECT cards_per_day, activated_at FROM plans
        WHERE user_id = ? AND exam_key = ? AND status = 'active'
        ORDER BY activated_at DESC LIMIT 1
    `).get(userId, examKey) as { cards_per_day: number; activated_at: string } | undefined;

    if (!activeRow) return null;

    const previousNewPerDay = activeRow.cards_per_day;
    const activatedAt       = activeRow.activated_at;

    // A plan that has never been studied shouldn't accumulate "missed" days —
    // those days never had a study commitment in practice. Anchor the walk to
    // MAX(activated_at, first_review_date) so missed days only count *after*
    // the user actually started reviewing under this plan.
    const firstReviewRow = db.prepare(`
        SELECT MIN(review_time) AS first_review
        FROM reviews
        WHERE user_id = ? AND review_time >= ? AND state_before = 'new'
    `).get(userId, activatedAt) as { first_review: string | null } | undefined;

    if (!firstReviewRow?.first_review) return null;

    // Per-day new card counts since the plan was activated
    type DayRow = { review_date: string; new_count: number };
    const studiedDays = db.prepare(`
        SELECT DATE(review_time) AS review_date, COUNT(*) AS new_count
        FROM reviews
        WHERE user_id = ? AND review_time >= ? AND state_before = 'new'
        GROUP BY DATE(review_time)
    `).all(userId, activatedAt) as DayRow[];

    const studiedMap = new Map(studiedDays.map(r => [r.review_date, r.new_count]));

    // Walk from day after first review to yesterday, count missed days
    const startDate = new Date(firstReviewRow.first_review);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() + 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysMissed = 0;
    const cursor   = new Date(startDate);
    while (cursor < today) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if ((studiedMap.get(dateStr) ?? 0) < previousNewPerDay) daysMissed++;
        cursor.setDate(cursor.getDate() + 1);
    }

    if (daysMissed === 0) return null;

    const freshPlan = computePlan(userId, examKey);
    if (!freshPlan) return null;

    // Only surface the banner when the new rate differs by more than 1
    if (Math.abs(freshPlan.recommendedNewPerDay - previousNewPerDay) <= 1) return null;

    return {
        previousNewPerDay,
        newNewPerDay:          freshPlan.recommendedNewPerDay,
        daysMissed,
        availableDaysRemaining: freshPlan.availableDays,
        canExtendTimeline:      freshPlan.availableDays > 7,
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

    // Deck filter clause — reviews table has deck_id directly
    const reviewDeckClause = deckFilter && deckFilter.length > 0
        ? `AND deck_id IN (${deckFilter.map(() => '?').join(',')})`
        : '';

    // New cards introduced since plan activation
    const sinceParams: (string | number | null)[] = [userId, activatedAt, ...(deckFilter ?? [])];
    const sinceRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) AS cnt
        FROM reviews
        WHERE user_id = ? AND state_before = 'new' AND review_time >= ?
        ${reviewDeckClause}
    `).get(...sinceParams) as { cnt: number };

    // New cards introduced today
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const todayParams: (string | number | null)[] = [userId, midnight.toISOString(), ...(deckFilter ?? [])];
    const todayRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) AS cnt
        FROM reviews
        WHERE user_id = ? AND state_before = 'new' AND review_time >= ?
        ${reviewDeckClause}
    `).get(...todayParams) as { cnt: number };

    // Current unseen count — cards still untouched
    let currentUnseen: number;
    if (deckFilter && deckFilter.length > 0) {
        const placeholders = deckFilter.map(() => '?').join(',');
        const unseenRow = db.prepare(`
            SELECT COUNT(*) AS cnt
            FROM cards c
            JOIN notes n ON n.id = c.note_id
            WHERE c.user_id = ? AND c.state = 'new' AND n.deck_id IN (${placeholders})
        `).get(userId, ...deckFilter) as { cnt: number };
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
        activityStmt.get(userId, midnight.toISOString(), ...(deckFilter ?? [])) as ActivityRow
    );
    const activityLast7Days = toCounts(
        activityStmt.get(userId, sevenDaysAgo.toISOString(), ...(deckFilter ?? [])) as ActivityRow
    );
    const activitySincePlanStart = toCounts(
        activityStmt.get(userId, activatedAt, ...(deckFilter ?? [])) as ActivityRow
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
