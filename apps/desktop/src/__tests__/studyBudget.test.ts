import { describe, it, expect } from 'vitest';
import { computeReviewAllTotals, type DeckDueCount } from '../lib/studyBudget';

const decks: DeckDueCount[] = [
    { deckId: 'a', newCount: 5, learningCount: 20, reviewCount: 0 },
    { deckId: 'b', newCount: 4, learningCount: 28, reviewCount: 0 },
];

describe('computeReviewAllTotals', () => {
    it('sums new per deck when no plan governs the scope (globalNewRemaining = null)', () => {
        const t = computeReviewAllTotals(decks, null);
        expect(t.totalNew).toBe(9);        // 5 + 4, the legacy per-deck sum
        expect(t.totalLearning).toBe(48);
        expect(t.reviewAllCount).toBe(57);
        // per-deck rows include their own new
        expect(t.perDeckActionable).toEqual({ a: 25, b: 32 });
    });

    it('uses the shared global budget for new and drops per-deck new from the rows', () => {
        // Plan rate met today → 0 new remaining. Matches the 48-card session.
        const t = computeReviewAllTotals(decks, 0);
        expect(t.totalNew).toBe(0);
        expect(t.reviewAllCount).toBe(48);           // only the 48 learning cards
        expect(t.perDeckActionable).toEqual({ a: 20, b: 28 }); // learning+review only
    });

    it('reflects a partial remaining budget in the headline total, not per deck', () => {
        const t = computeReviewAllTotals(decks, 3); // 3 new left today, shared
        expect(t.totalNew).toBe(3);
        expect(t.reviewAllCount).toBe(51);           // 3 + 48
        // rows still show only deck-specific due work; the 3 shared new aren't attributed
        expect(t.perDeckActionable).toEqual({ a: 20, b: 28 });
    });

    it('handles an empty scope', () => {
        const t = computeReviewAllTotals([], 0);
        expect(t).toEqual({ totalNew: 0, totalLearning: 0, totalReview: 0, reviewAllCount: 0, perDeckActionable: {} });
    });
});
