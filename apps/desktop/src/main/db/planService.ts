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
    totalCards: number;
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
    /** plan_override_expires_at from user_profiles; null when no override is active. */
    overrideExpiresAt: string | null;
    /** user_profiles.daily_new_limit — equals cardsPerDay normally, override value when active. */
    currentDailyNewLimit: number;
}

// ── Cohort review-load approximation ─────────────────────────────────────────
//
// reviews_per_new_card_by_week:
//   week 1:  0.5  (cards just introduced, few due yet)
//   week 2:  0.9
//   week 3:  1.2
//   week 4+: 1.5  (steady state — each new card generates ~1.5 reviews/week)
//
// dailyMinutes(n, week) = (n × 0.75) + ((n × cumulativeReviews(week) / 7) × 0.33)
//   where 0.75 min ≈ 45 s per new card, 0.33 min ≈ 20 s per review

const WEEKLY_MULTIPLIERS: readonly number[] = [0.5, 0.9, 1.2];
const STEADY_STATE_MULTIPLIER = 1.5;

function weekMultiplier(week: number): number {
    if (week <= 0) return 0;
    const idx = week - 1;
    return idx < WEEKLY_MULTIPLIERS.length ? WEEKLY_MULTIPLIERS[idx] : STEADY_STATE_MULTIPLIER;
}

function cumulativeReviews(week: number): number {
    let sum = 0;
    for (let w = 1; w <= week; w++) sum += weekMultiplier(w);
    return sum;
}

function dailyMinutes(newPerDay: number, week: number): number {
    const dailyReviews = (newPerDay * cumulativeReviews(week)) / 7;
    return newPerDay * 0.75 + dailyReviews * 0.33;
}

// ── Yield level helpers ───────────────────────────────────────────────────────

type YieldLevel = 'high' | 'medium' | 'low' | 'unclassified';
const LEVEL_ORDER: Record<YieldLevel, number> = { high: 0, medium: 1, low: 2, unclassified: 3 };

function toYieldLevel(score: number | null, confidence: number | null): YieldLevel {
    if (score === null || confidence === null || confidence < 0.5) return 'unclassified';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}

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
const PEAK_WEEK = 8;

export function computePlan(userId: string, examKey: string, deckIds?: string[]): PlanResult | null {
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
    const dailyTimeBudgetMinutes = Math.round(dailyNewLimit * 0.75 + dailyReviewLimit * 0.33);

    // 3. Available days until exam
    const availableDays = Math.max(
        1,
        Math.floor((new Date(examRow.exam_date).getTime() - Date.now()) / 86_400_000),
    );

    // 4. Unseen cards with yield levels via inline yield-score CTE
    type UnseenRow = {
        card_id: string;
        system_key: string | null;
        yield_score: number | null;
        max_confidence: number | null;
    };

    const yieldCte = `
        WITH yield_cte AS (
            SELECT
                cc.card_id,
                ROUND(SUM(
                    ((bs.weight_min + bs.weight_max) / 2.0)
                    * bt.relative_weight
                    * cc.confidence
                    * cc.split_weight
                    * 100
                ), 1) AS yield_score,
                MAX(cc.confidence) AS max_confidence,
                (
                    SELECT bs2.system_key
                    FROM card_classifications cc2
                    JOIN blueprint_systems bs2 ON bs2.id = cc2.system_id
                    WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
                    ORDER BY cc2.split_weight DESC LIMIT 1
                ) AS system_key
            FROM card_classifications cc
            JOIN blueprint_systems bs ON bs.id = cc.system_id
            JOIN blueprint_topics bt ON bt.id = cc.topic_id
            WHERE cc.exam_id = ?
            GROUP BY cc.card_id
        )
    `;

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

    // 5. Recommended new per day — find max n where peak-week load fits budget
    const maxNeeded = unseenTotal > 0 ? Math.ceil(unseenTotal / availableDays) : 100;
    let recommendedNewPerDay = 5;
    for (let n = 5; n <= 100; n++) {
        if (dailyMinutes(n, PEAK_WEEK) <= dailyTimeBudgetMinutes) {
            recommendedNewPerDay = n;
        } else {
            break;
        }
    }
    recommendedNewPerDay = Math.min(recommendedNewPerDay, maxNeeded, 100);

    // 6. Projected coverage — sort by yield priority, take first projectedCoverageCount
    const projectedCoverageCount = Math.min(unseenTotal, recommendedNewPerDay * availableDays);
    const sorted = [...withLevels].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    const inPlanIds = new Set(sorted.slice(0, projectedCoverageCount).map(c => c.card_id));
    const projectedCoverage = unseenTotal > 0 ? projectedCoverageCount / unseenTotal : 1;

    // 7. Weekly projection array
    const totalWeeks = Math.min(Math.ceil(availableDays / 7), 16);
    const weeklyProjection: WeeklyProjection[] = [];
    let projectedPeakDailyMinutes = 0;

    for (let w = 1; w <= totalWeeks; w++) {
        const estimatedReviewsPerDay  = Math.round((recommendedNewPerDay * cumulativeReviews(w)) / 7);
        const estimatedTotalMinutes   = Math.round(dailyMinutes(recommendedNewPerDay, w));
        if (estimatedTotalMinutes > projectedPeakDailyMinutes) {
            projectedPeakDailyMinutes = estimatedTotalMinutes;
        }
        weeklyProjection.push({ week: w, newCardsPerDay: recommendedNewPerDay, estimatedReviewsPerDay, estimatedTotalMinutes });
    }

    // 8. System coverage — join with performance needs
    type SysRow = { system_key: string; label: string; weight_min: number | null; weight_max: number | null };
    const systemRows = db.prepare(
        'SELECT system_key, label, weight_min, weight_max FROM blueprint_systems WHERE exam_id = ?'
    ).all(examRow.exam_id) as SysRow[];

    const perfNeeds = getSystemPerformanceNeeds(userId, examKey);
    const perfMap   = new Map(perfNeeds.map(n => [n.system_key, n.performance_need]));

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

    db.prepare(`
        UPDATE plans SET status = 'archived', updated_at = ?
        WHERE user_id = ? AND exam_key = ? AND status = 'active'
    `).run(now, userId, examKey);

    const deckFilterJson = snapshot.deckFilter ? JSON.stringify(snapshot.deckFilter) : null;

    db.prepare(`
        INSERT INTO plans
            (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
             snapshot, deck_filter, status, activated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, userId, examKey, name, cardsPerDay, snapshot.recommendedNewPerDay,
           JSON.stringify(snapshot), deckFilterJson, now, now, now);

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
        suggestedPerDay: snapshot.recommendedNewPerDay,
        snapshot, deckFilter: snapshot.deckFilter,
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

    const row = examKey
        ? db.prepare(`
            SELECT * FROM plans
            WHERE user_id = ? AND exam_key = ? AND status = 'active'
            ORDER BY activated_at DESC LIMIT 1
          `).get(userId, examKey) as PlanRow | undefined
        : db.prepare(`
            SELECT * FROM plans
            WHERE user_id = ? AND status = 'active'
            ORDER BY activated_at DESC LIMIT 1
          `).get(userId) as PlanRow | undefined;

    if (!row) return null;

    const profileRow = db.prepare(
        'SELECT daily_new_limit, plan_override_expires_at FROM user_profiles WHERE id = ?'
    ).get(userId) as { daily_new_limit: number | null; plan_override_expires_at: string | null } | undefined;

    return {
        plan:                rowToPlan(row),
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

    // Per-day new card counts since the plan was activated
    type DayRow = { review_date: string; new_count: number };
    const studiedDays = db.prepare(`
        SELECT DATE(review_time) AS review_date, COUNT(*) AS new_count
        FROM reviews
        WHERE user_id = ? AND review_time >= ? AND state_before = 'new'
        GROUP BY DATE(review_time)
    `).all(userId, activatedAt) as DayRow[];

    const studiedMap = new Map(studiedDays.map(r => [r.review_date, r.new_count]));

    // Walk from day after activation to yesterday, count missed days
    const startDate = new Date(activatedAt);
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

export interface PlanProgress {
    /** New cards introduced (state_before = 'new') since plan was activated. */
    studiedSincePlanStart: number;
    /** Cards still in state = 'new' right now (within plan scope). */
    currentUnseen: number;
    /** New cards introduced today. */
    studiedToday: number;
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

    return {
        studiedSincePlanStart: sinceRow.cnt,
        currentUnseen,
        studiedToday: todayRow.cnt,
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
