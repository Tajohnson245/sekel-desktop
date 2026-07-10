import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createDeckSession,
    createStudySession,
    completeDeckSession,
    insertReview,
    fetchSessionAnalytics,
    fetchUserReviewHistory,
    fetchAllDueCardsCount,
    fetchGlobalRetention,
    type InsertReviewParams,
    type ReviewDayCount,
} from '../lib/queries';
import type { SessionAnalytics, StudySessionKind } from '../lib/types';
import { intelligenceKeys } from './useSekelIntelligence';
import { useAuthStore } from '../stores/authStore';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const sessionKeys = {
    analytics: (sessionId: string) => ['sessions', sessionId, 'analytics'] as const,
    reviewHistory: (userId: string) => ['reviewHistory', userId] as const,
};

// ─────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────

export function useCreateSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, deckId }: { userId: string; deckId: string }) =>
            createDeckSession(userId, deckId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
    });
}

/**
 * Create a typed study session (SEKEL-137). Cross-deck sessions ('review_all' /
 * 'focused') persist a representative deck plus the scope/systemKeys they were
 * assembled from; per-review deck attribution still lives on reviews.deck_id.
 */
export function useCreateStudySession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, kind, representativeDeckId, scope, systemKeys }: {
            userId: string;
            kind: StudySessionKind;
            representativeDeckId: string;
            scope: 'all' | 'plan' | null;
            systemKeys: string[] | null;
        }) => createStudySession(userId, kind, representativeDeckId, scope, systemKeys),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
    });
}

export function useCompleteSession() {
    const queryClient = useQueryClient();
    const userId = useAuthStore((s) => s.user?.id);

    return useMutation({
        mutationFn: (sessionId: string) => completeDeckSession(sessionId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: sessionKeys.analytics(data.id) });
            if (userId) {
                queryClient.invalidateQueries({ queryKey: intelligenceKeys.summary(userId) });
            }
        },
    });
}

export function useInsertReview() {
    return useMutation({
        mutationFn: (params: InsertReviewParams) => insertReview(params),
    });
}

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

export function useSessionAnalytics(sessionId: string | null, enabled: boolean) {
    return useQuery<SessionAnalytics | null>({
        queryKey: sessionKeys.analytics(sessionId ?? ''),
        queryFn: () => fetchSessionAnalytics(sessionId!),
        enabled: !!sessionId && enabled,
    });
}

export function useReviewHistory(userId: string | undefined) {
    return useQuery<ReviewDayCount[]>({
        queryKey: sessionKeys.reviewHistory(userId ?? ''),
        queryFn: () => fetchUserReviewHistory(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

// ─────────────────────────────────────────────────────────────────
// Dashboard global stats
// ─────────────────────────────────────────────────────────────────

export function useGlobalDashboardStats(userId: string | undefined) {
    const dueQuery = useQuery<number>({
        queryKey: ['globalDueCount', userId ?? ''],
        queryFn: () => fetchAllDueCardsCount(userId!),
        enabled: !!userId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });

    const retentionQuery = useQuery<number | null>({
        queryKey: ['globalRetention', userId ?? ''],
        queryFn: () => fetchGlobalRetention(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    return {
        dueCount: dueQuery.data ?? 0,
        retention: retentionQuery.data ?? null,
        isLoading: dueQuery.isLoading || retentionQuery.isLoading,
    };
}
