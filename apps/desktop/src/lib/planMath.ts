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
 * generates reviews at a rising weekly rate until it reaches steady state:
 *   reviews per new card by week → wk1 0.5, wk2 0.9, wk3 1.2, wk4+ 1.5
 * Time cost ≈ 0.75 min (45 s) per new card + 0.33 min (20 s) per review.
 */

export const WEEKLY_MULTIPLIERS: readonly number[] = [0.5, 0.9, 1.2];
export const STEADY_STATE_MULTIPLIER = 1.5;
export const MINUTES_PER_NEW_CARD = 0.75;
export const MINUTES_PER_REVIEW = 0.33;

/** Reviews generated per new card during the given week of that cohort's life. */
export function weekMultiplier(week: number): number {
    if (week <= 0) return 0;
    const idx = week - 1;
    return idx < WEEKLY_MULTIPLIERS.length ? WEEKLY_MULTIPLIERS[idx] : STEADY_STATE_MULTIPLIER;
}

/** Sum of weekly multipliers from week 1..`week` (a cohort's cumulative review load). */
export function cumulativeReviews(week: number): number {
    let sum = 0;
    for (let w = 1; w <= week; w++) sum += weekMultiplier(w);
    return sum;
}

/** Estimated daily minutes at `week` for a steady intake of `newPerDay` new cards/day. */
export function dailyMinutes(newPerDay: number, week: number): number {
    const dailyReviews = (newPerDay * cumulativeReviews(week)) / 7;
    return newPerDay * MINUTES_PER_NEW_CARD + dailyReviews * MINUTES_PER_REVIEW;
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
 * Returns the per-week rows, the peak daily minutes, and the exhaustion day.
 * Capped at `maxWeeks` rows. Returns empty when there's nothing to project.
 */
export function buildWeeklyProjection(
    rate: number,
    unseenTotal: number,
    availableDays: number,
    maxWeeks: number,
): WeeklyProjection {
    if (rate <= 0 || unseenTotal <= 0 || availableDays <= 0) {
        return { weeks: [], peakMinutes: 0, daysToExhaust: 0 };
    }

    const daysToExhaust = Math.min(Math.ceil(unseenTotal / rate), availableDays);
    const exhaustWeek   = Math.ceil(daysToExhaust / 7);
    const lastWeekDays  = daysToExhaust % 7 || 7;
    const totalWeeks    = Math.min(Math.ceil(availableDays / 7), maxWeeks);

    const weeks: WeeklyProjectionRow[] = [];
    let peakMinutes = 0;

    for (let w = 1; w <= totalWeeks; w++) {
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
        const estimatedTotalMinutes  = Math.round(
            newCardsPerDay * MINUTES_PER_NEW_CARD + estimatedReviewsPerDay * MINUTES_PER_REVIEW,
        );

        if (estimatedTotalMinutes > peakMinutes) peakMinutes = estimatedTotalMinutes;
        weeks.push({ week: w, newCardsPerDay, estimatedReviewsPerDay, estimatedTotalMinutes });
    }

    return { weeks, peakMinutes, daysToExhaust };
}
