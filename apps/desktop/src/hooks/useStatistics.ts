import { useQuery } from '@tanstack/react-query';
import {
    fetchTodaySummary,
    fetchCardCountsByMaturity,
    fetchRetentionByMaturity,
    type TodaySummary,
    type CardCountsByMaturity,
    type RetentionByMaturity,
} from '../lib/queries';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const statisticsKeys = {
    todaySummary: (userId: string) => ['statistics', 'todaySummary', userId] as const,
    cardCounts: (userId: string, deckId?: string) => ['statistics', 'cardCounts', userId, deckId] as const,
    retention: (userId: string, days?: number) => ['statistics', 'retention', userId, days] as const,
};

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

export function useTodaySummary(userId: string | undefined) {
    return useQuery<TodaySummary>({
        queryKey: statisticsKeys.todaySummary(userId ?? ''),
        queryFn: () => fetchTodaySummary(userId!),
        enabled: !!userId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

export function useCardCountsByMaturity(userId: string | undefined, deckId?: string) {
    return useQuery<CardCountsByMaturity>({
        queryKey: statisticsKeys.cardCounts(userId ?? '', deckId),
        queryFn: () => fetchCardCountsByMaturity(userId!, deckId),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

export function useRetentionByMaturity(userId: string | undefined, days?: number) {
    return useQuery<RetentionByMaturity>({
        queryKey: statisticsKeys.retention(userId ?? '', days),
        queryFn: () => fetchRetentionByMaturity(userId!, days),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
