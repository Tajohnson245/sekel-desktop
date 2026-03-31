import { useQuery } from '@tanstack/react-query';
import {
    fetchTodaySummary,
    fetchCardCountsByMaturity,
    fetchRetentionByMaturity,
    fetchSessionClassificationBreakdown,
    fetchMissedCardStats,
    fetchMissRateTrend,
    type TodaySummary,
    type CardCountsByMaturity,
    type RetentionByMaturity,
    type MissedSystemBreakdown,
    type MissedCardStats,
    type MissRateTrendPoint,
    type DateRangeDays,
} from '../lib/queries';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const statisticsKeys = {
    todaySummary: (userId: string) => ['statistics', 'todaySummary', userId] as const,
    cardCounts: (userId: string, deckId?: string) => ['statistics', 'cardCounts', userId, deckId] as const,
    retention: (userId: string, days?: number) => ['statistics', 'retention', userId, days] as const,
    sessionClassification: (sessionId: string) => ['statistics', 'sessionClassification', sessionId] as const,
    missedCards: (userId: string, examKey: string, days: DateRangeDays) => ['statistics', 'missedCards', userId, examKey, days] as const,
    missRateTrend: (userId: string, days: DateRangeDays) => ['statistics', 'missRateTrend', userId, days] as const,
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

export function useSessionClassificationBreakdown(sessionId: string | null, enabled: boolean) {
    return useQuery<MissedSystemBreakdown[]>({
        queryKey: statisticsKeys.sessionClassification(sessionId ?? ''),
        queryFn: () => fetchSessionClassificationBreakdown(sessionId!),
        enabled: !!sessionId && enabled,
        staleTime: 0, // session data is immutable
    });
}

export function useMissedCardStats(
    userId: string | undefined,
    examKey: string | undefined,
    days: DateRangeDays,
) {
    return useQuery<MissedCardStats>({
        queryKey: statisticsKeys.missedCards(userId ?? '', examKey ?? '', days),
        queryFn: () => fetchMissedCardStats(userId!, examKey!, days),
        enabled: !!userId && !!examKey,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}

export function useMissRateTrend(userId: string | undefined, days: DateRangeDays) {
    return useQuery<MissRateTrendPoint[]>({
        queryKey: statisticsKeys.missRateTrend(userId ?? '', days),
        queryFn: () => fetchMissRateTrend(userId!, days),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
