/**
 * Study-hub Review-All total math — pure, so it can be unit-tested without a
 * React render (the repo has no component-test harness).
 *
 * The subtlety this encodes: when an active plan owns the study scope, new cards
 * are governed by a single GLOBAL daily budget (see fetchDueCardsCrossDeck), not
 * a per-deck limit. So the hub's "new" figure must be that shared remaining
 * budget, and per-deck rows must show only their deck-specific due work
 * (learning + review) — a new card can't be attributed to one deck ahead of
 * time because the session serves the highest-yield new cards across the scope.
 * Otherwise the hub advertises more new cards than the session will actually
 * serve (e.g. "Begin Review All (57)" handing you 48).
 */

export interface DeckDueCount {
    deckId: string;
    newCount: number;
    learningCount: number;
    reviewCount: number;
}

export interface ReviewAllTotals {
    totalNew: number;
    totalLearning: number;
    totalReview: number;
    reviewAllCount: number;
    /** deckId → the count shown on that deck's Review-All row. */
    perDeckActionable: Record<string, number>;
}

/**
 * @param globalNewRemaining shared new-card budget left today when a plan owns the
 * scope (`max(0, rate − new done today)`); pass `null` when no plan governs the
 * scope, in which case new cards fall back to the per-deck sum (legacy behavior).
 */
export function computeReviewAllTotals(
    decks: DeckDueCount[],
    globalNewRemaining: number | null,
): ReviewAllTotals {
    let perDeckNew = 0;
    let totalLearning = 0;
    let totalReview = 0;
    const perDeckActionable: Record<string, number> = {};

    for (const d of decks) {
        perDeckNew += d.newCount;
        totalLearning += d.learningCount;
        totalReview += d.reviewCount;
        // Under a global budget, per-deck rows drop new (it's a shared pool).
        const rowNew = globalNewRemaining === null ? d.newCount : 0;
        perDeckActionable[d.deckId] = rowNew + d.learningCount + d.reviewCount;
    }

    const totalNew = globalNewRemaining === null ? perDeckNew : globalNewRemaining;

    return {
        totalNew,
        totalLearning,
        totalReview,
        reviewAllCount: totalNew + totalLearning + totalReview,
        perDeckActionable,
    };
}
