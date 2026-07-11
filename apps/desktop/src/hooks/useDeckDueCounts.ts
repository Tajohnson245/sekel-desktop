/**
 * Reconciled deck due counts — the single source of truth behind the sidebar
 * DECKS pills, the Dashboard count triad, and the Decks summary line (spec §10:
 * "Numbers reconcile across screens"). Every consumer reads from this hook, so
 * the same values back every surface.
 *
 * It reuses the exact query keys of `useDeckStats`, so the per-deck stat caches
 * are shared — there is no second fetch path that could drift.
 */
import { useQueries } from '@tanstack/react-query';
import { fetchDeckStats } from '../lib/queries';
import type { DeckStats } from '../lib/queries';
import { deckKeys, useDecks } from './useDecks';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useEffectivePlan } from './usePlan';

/** Cards actionable *now* for a deck = review-state due + learning-step cards.
 *  Matches the long-standing DeckCard "cards due" definition; new cards are
 *  reported separately (the count triad keeps New / Learning / Due distinct). */
export function deckDueTotal(s?: Pick<DeckStats, 'reviewCount' | 'learningCount'> | null): number {
    if (!s) return 0;
    return (s.reviewCount ?? 0) + (s.learningCount ?? 0);
}

export interface DeckDueCounts {
    /** deckId → full stats (undefined until that deck's query resolves). */
    byDeck: Map<string, DeckStats>;
    /** Σ (review + learning) across all decks — the reconciled "due today". */
    totalDue: number;
    totalNew: number;
    totalLearning: number;
    totalReview: number;
    totalCards: number;
    /** Deck with the most cards due now, or null when nothing is due. */
    topDueDeckId: string | null;
    isLoading: boolean;
}

export function useDeckDueCounts(): DeckDueCounts {
    const { data: decks = [] } = useDecks();
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    // Same limit precedence as useDeckStats / useDueCards so the badge matches
    // what a study session will actually serve.
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;

    const results = useQueries({
        queries: decks.map((d) => ({
            queryKey: [...deckKeys.stats(d.id), newLimit, reviewLimit],
            queryFn: () => fetchDeckStats(d.id, userId, newLimit, reviewLimit),
            enabled: !!userId,
        })),
    });

    const byDeck = new Map<string, DeckStats>();
    let totalDue = 0;
    let totalNew = 0;
    let totalLearning = 0;
    let totalReview = 0;
    let totalCards = 0;
    let topDueDeckId: string | null = null;
    let topDue = 0;

    decks.forEach((d, i) => {
        const data = results[i]?.data;
        if (!data) return;
        byDeck.set(d.id, data);
        const due = deckDueTotal(data);
        totalDue += due;
        totalNew += data.newCount ?? 0;
        totalLearning += data.learningCount ?? 0;
        totalReview += data.reviewCount ?? 0;
        totalCards += data.totalCount ?? 0;
        if (due > topDue) {
            topDue = due;
            topDueDeckId = d.id;
        }
    });

    return {
        byDeck,
        totalDue,
        totalNew,
        totalLearning,
        totalReview,
        totalCards,
        topDueDeckId,
        isLoading: results.some((r) => r.isLoading),
    };
}
