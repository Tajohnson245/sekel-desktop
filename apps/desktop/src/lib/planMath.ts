/**
 * Plan cohort math — pure, dependency-free.
 *
 * Shared by the main-process plan engine (`main/db/planService.ts`, which
 * computes and persists the committed snapshot) and the renderer's live
 * creation-panel preview (`components/Plan/PlanPage.tsx`, which needs instant
 * client-side feedback as the rate slider moves). Keeping the model in one
 * place means the preview the user sees and the snapshot that gets persisted
 * can't drift. Imported into the main process the same way `lib/fsrs` is.
 *
 * Model — a "cohort" is one day's batch of newly-introduced cards. Each cohort
 * generates reviews at a weekly rate that RAMPS during the learning phase, then
 * DECAYS as the cards mature into longer FSRS intervals:
 *   reviews per new card by cohort-week → wk1 0.5, wk2 0.9, wk3 1.2 (peak),
 *   then a geometric decay toward a small steady floor (~0.15/wk), reflecting a
 *   mature card reviewed roughly monthly. (The old model held a flat 1.5/wk
 *   forever, which implied an unbounded review pile 5–15× larger than reality.)
 *
 * Per-card time cost defaults to ~0.75 min/new + ~0.33 min/review but callers
 * pass calibrated values derived from the user's own measured review durations.
 */

export const WEEKLY_MULTIPLIERS: readonly number[] = [0.5, 0.9, 1.2];
/** Peak cohort-week (index into the ramp) after which review load decays. */
export const DECAY_FROM_WEEK = 3;
/** Geometric decay applied to (peak − floor) each week past the peak. */
export const DECAY_FACTOR = 0.7;
/** Steady-state floor: reviews/card/week for a fully mature card (~monthly). */
export const STEADY_FLOOR = 0.15;
export const MINUTES_PER_NEW_CARD = 0.75;
export const MINUTES_PER_REVIEW = 0.33;

/** Per-card time costs, calibrated from the user's real review durations. */
export interface TimeCalibration {
    minutesPerNewCard?: number;
    minutesPerReview?: number;
}

/** Reviews generated per new card during the given week of that cohort's life. */
export function weekMultiplier(week: number): number {
    if (week <= 0) return 0;
    if (week <= DECAY_FROM_WEEK) return WEEKLY_MULTIPLIERS[week - 1];
    // Past the ramp peak, decay geometrically from the peak toward the floor so a
    // maturing cohort's review load shrinks instead of holding flat forever.
    const peak = WEEKLY_MULTIPLIERS[DECAY_FROM_WEEK - 1];
    return STEADY_FLOOR + (peak - STEADY_FLOOR) * Math.pow(DECAY_FACTOR, week - DECAY_FROM_WEEK);
}

/** Sum of weekly multipliers from week 1..`week` (a cohort's cumulative review load). */
export function cumulativeReviews(week: number): number {
    let sum = 0;
    for (let w = 1; w <= week; w++) sum += weekMultiplier(w);
    return sum;
}

/** Estimated daily minutes at `week` for a steady intake of `newPerDay` new cards/day. */
export function dailyMinutes(newPerDay: number, week: number, cal: TimeCalibration = {}): number {
    const minNew = cal.minutesPerNewCard ?? MINUTES_PER_NEW_CARD;
    const minReview = cal.minutesPerReview ?? MINUTES_PER_REVIEW;
    const dailyReviews = (newPerDay * cumulativeReviews(week)) / 7;
    return newPerDay * minNew + dailyReviews * minReview;
}

/**
 * Whole calendar days from today until an exam date, in LOCAL time.
 * `examDate` is a 'YYYY-MM-DD' string. Returns 0 on the exam day and a negative
 * number if it has passed.
 *
 * Parsing the bare date via `new Date('YYYY-MM-DD')` treats it as UTC midnight,
 * which shaves up to a full day off "days away" for users west of UTC. Building
 * the date from its parts pins it to LOCAL midnight instead, and `Math.round`
 * keeps it correct across daylight-saving transitions (a 23/25-hour day).
 */
export function daysUntilExamLocal(examDate: string, now: Date = new Date()): number {
    const [y, m, d] = examDate.split('-').map(Number);
    if (!y || !m || !d) return 0;
    const exam  = new Date(y, m - 1, d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((exam.getTime() - today.getTime()) / 86_400_000);
}

export interface WeeklyProjectionRow {
    week: number;
    newCardsPerDay: number;
    estimatedReviewsPerDay: number;
    estimatedTotalMinutes: number;
}

export interface WeeklyProjection {
    weeks: WeeklyProjectionRow[];
    peakMinutes: number;
    /** Day (from plan start) the unseen pool is fully introduced. */
    daysToExhaust: number;
}

/**
 * Exhaustion-aware weekly projection: new-card intake drops to 0 once the unseen
 * pool runs out, and reviews accrue only from cohorts actually introduced.
 *
 * `peakMinutes` is computed over the ENTIRE study window (every week until the
 * exam), even though only the first `maxWeeks` rows are returned for display —
 * so the peak the UI reports is the true maximum, not the tail of a truncated
 * window. Returns empty when there's nothing to project.
 */
export function buildWeeklyProjection(
    rate: number,
    unseenTotal: number,
    availableDays: number,
    maxWeeks: number,
    cal: TimeCalibration = {},
): WeeklyProjection {
    if (rate <= 0 || unseenTotal <= 0 || availableDays <= 0) {
        return { weeks: [], peakMinutes: 0, daysToExhaust: 0 };
    }

    const minNew = cal.minutesPerNewCard ?? MINUTES_PER_NEW_CARD;
    const minReview = cal.minutesPerReview ?? MINUTES_PER_REVIEW;

    const daysToExhaust = Math.min(Math.ceil(unseenTotal / rate), availableDays);
    const exhaustWeek   = Math.ceil(daysToExhaust / 7);
    const lastWeekDays  = daysToExhaust % 7 || 7;
    const fullWeeks     = Math.ceil(availableDays / 7);

    const weeks: WeeklyProjectionRow[] = [];
    let peakMinutes = 0;

    for (let w = 1; w <= fullWeeks; w++) {
        const newCardsPerDay =
            w < exhaustWeek   ? rate :
            w === exhaustWeek ? Math.round(rate * lastWeekDays / 7) :
            0;

        let weeklyReviews = 0;
        for (let c = 1; c <= Math.min(w, exhaustWeek); c++) {
            const fraction = c === exhaustWeek ? lastWeekDays / 7 : 1;
            weeklyReviews += rate * weekMultiplier(w - c + 1) * fraction;
        }
        const estimatedReviewsPerDay = Math.round(weeklyReviews / 7);
        const estimatedTotalMinutes  = Math.round(newCardsPerDay * minNew + estimatedReviewsPerDay * minReview);

        // Peak is tracked across the whole window; rows are capped for display only.
        if (estimatedTotalMinutes > peakMinutes) peakMinutes = estimatedTotalMinutes;
        if (w <= maxWeeks) weeks.push({ week: w, newCardsPerDay, estimatedReviewsPerDay, estimatedTotalMinutes });
    }

    return { weeks, peakMinutes, daysToExhaust };
}
