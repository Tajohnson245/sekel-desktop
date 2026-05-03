import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    computePlan,
    createPlan,
    getActivePlan,
    listPlans,
    archivePlan,
    deletePlan,
    reactivatePlan,
    rebalancePlan,
    setPlanOverride,
    clearPlanOverride,
    getDeckUnseenCounts,
    getPlanProgress,
    type PlanResult,
    type Plan,
    type ActivePlanResult,
    type RebalanceDelta,
    type DeckUnseenCount,
    type PlanProgress,
    type PlanActivityCounts,
} from '../lib/queries';
import { useAuthStore } from '../stores/authStore';
import { usePlanStore } from '../stores/planStore';

export const planKeys = {
    suggestion:         (userId: string, examKey: string, deckKey: string) => ['plan', 'suggestion', userId, examKey, deckKey] as const,
    active:             (userId: string, examKey?: string) => ['plan', 'active', userId, examKey ?? ''] as const,
    list:               (userId: string) => ['plan', 'list', userId] as const,
    rebalance:          (userId: string, examKey: string) => ['plan', 'rebalance', userId, examKey] as const,
    deckUnseenCounts:   (userId: string) => ['plan', 'deck-unseen-counts', userId] as const,
    progress:           (userId: string, planId: string) => ['plan', 'progress', userId, planId] as const,
};

// ── Computed suggestion (pure — no DB write; used in creation panel) ──────────

/**
 * deckIds = null  → all decks (no filter)
 * deckIds = []    → disabled (nothing to compute)
 * deckIds = [...]  → scoped to those decks
 */
export function useComputedSuggestion(
    examKey: string | null | undefined,
    deckIds: string[] | null,
    enabled = true,
) {
    const userId = useAuthStore(s => s.user?.id);
    const deckKey = deckIds === null ? 'all' : deckIds.join(',');
    const hasDecks = deckIds === null || deckIds.length > 0;

    return useQuery<PlanResult | null>({
        queryKey: planKeys.suggestion(userId ?? '', examKey ?? '', deckKey),
        queryFn:  () => computePlan(userId!, examKey!, deckIds ?? undefined),
        enabled:  !!userId && !!examKey && enabled && hasDecks,
        staleTime: 2 * 60 * 1000,
        gcTime:    5 * 60 * 1000,
    });
}

// ── Deck unseen counts (scope picker) ────────────────────────────────────────

export function useDeckUnseenCounts() {
    const userId = useAuthStore(s => s.user?.id);
    return useQuery<DeckUnseenCount[]>({
        queryKey: planKeys.deckUnseenCounts(userId ?? ''),
        queryFn:  () => getDeckUnseenCounts(userId!),
        enabled:  !!userId,
        staleTime: 60 * 1000,
    });
}

// ── Active plan (seeds planStore on success) ──────────────────────────────────

export function useActivePlan(examKey?: string | null) {
    const userId       = useAuthStore(s => s.user?.id);
    const setActivePlan = usePlanStore(s => s.setActivePlan);
    const clearActivePlan = usePlanStore(s => s.clearActivePlan);

    return useQuery<ActivePlanResult | null>({
        queryKey: planKeys.active(userId ?? '', examKey ?? undefined),
        queryFn:  async () => {
            const result = await getActivePlan(userId!, examKey ?? undefined);
            if (result) {
                setActivePlan(result.plan, result.overrideExpiresAt, result.currentDailyNewLimit);
            } else {
                clearActivePlan();
            }
            return result;
        },
        enabled:   !!userId,
        staleTime: 0, // always re-fetch on mount (drives session card cap)
    });
}

// ── Plan list ─────────────────────────────────────────────────────────────────

export function usePlans() {
    const userId = useAuthStore(s => s.user?.id);
    return useQuery<Plan[]>({
        queryKey: planKeys.list(userId ?? ''),
        queryFn:  () => listPlans(userId!),
        enabled:  !!userId,
        staleTime: 0,
    });
}

// ── Rebalance detection ───────────────────────────────────────────────────────

export function usePlanRebalance(examKey: string | null | undefined) {
    const userId = useAuthStore(s => s.user?.id);
    return useQuery<RebalanceDelta | null>({
        queryKey: planKeys.rebalance(userId ?? '', examKey ?? ''),
        queryFn:  () => rebalancePlan(userId!, examKey!),
        enabled:  !!userId && !!examKey,
        staleTime: 0,
        retry:    false,
    });
}

// ── Create plan ───────────────────────────────────────────────────────────────

export function useCreatePlan() {
    const userId        = useAuthStore(s => s.user?.id);
    const setActivePlan = usePlanStore(s => s.setActivePlan);
    const qc            = useQueryClient();

    return useMutation({
        mutationFn: ({ examKey, cardsPerDay, name, snapshot }: {
            examKey: string;
            cardsPerDay: number;
            name: string;
            snapshot: PlanResult;
        }) => createPlan(userId!, examKey, cardsPerDay, name, snapshot),

        onSuccess: (plan) => {
            if (!plan) return;
            const result = { plan, overrideExpiresAt: null, currentDailyNewLimit: plan.cardsPerDay };
            // Immediately write into the cache so PlanPage renders without waiting for a refetch
            qc.setQueryData(planKeys.active(userId ?? '', plan.examKey), result);
            qc.setQueryData(planKeys.active(userId ?? ''), result);
            setActivePlan(plan, null, plan.cardsPerDay);
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Archive plan ──────────────────────────────────────────────────────────────

export function useArchivePlan() {
    const userId         = useAuthStore(s => s.user?.id);
    const clearActivePlan = usePlanStore(s => s.clearActivePlan);
    const qc             = useQueryClient();

    return useMutation({
        mutationFn: (planId: string) => archivePlan(userId!, planId),
        onSuccess: (_filePath, planId) => {
            clearActivePlan();
            qc.setQueryData(planKeys.active(userId ?? ''), null);
            // Immediately update list cache so archived plan stays visible without refetch delay
            qc.setQueryData(planKeys.list(userId ?? ''), (old: Plan[] | undefined) =>
                old?.map(p => p.id === planId ? { ...p, status: 'archived' as const } : p) ?? []
            );
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Delete plan ───────────────────────────────────────────────────────────────

export function useDeletePlan() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: (planId: string) => deletePlan(userId!, planId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: planKeys.active(userId ?? '') });
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
        },
    });
}

// ── Reactivate plan ───────────────────────────────────────────────────────────

export function useReactivatePlan() {
    const userId        = useAuthStore(s => s.user?.id);
    const setActivePlan = usePlanStore(s => s.setActivePlan);
    const qc            = useQueryClient();

    return useMutation({
        mutationFn: (planId: string) => reactivatePlan(userId!, planId),
        onSuccess: (plan) => {
            if (!plan) return;
            const result = { plan, overrideExpiresAt: null, currentDailyNewLimit: plan.cardsPerDay };
            qc.setQueryData(planKeys.active(userId ?? '', plan.examKey), result);
            qc.setQueryData(planKeys.active(userId ?? ''), result);
            setActivePlan(plan, null, plan.cardsPerDay);
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Override mutations ────────────────────────────────────────────────────────

export function useSetPlanOverride() {
    const userId     = useAuthStore(s => s.user?.id);
    const setOverride = usePlanStore(s => s.setOverride);
    const qc         = useQueryClient();

    return useMutation({
        mutationFn: (newPerDay: number) => setPlanOverride(userId!, newPerDay),
        onSuccess: (_data, newPerDay) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            setOverride(newPerDay, tomorrow.toISOString());
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

export function useClearPlanOverride() {
    const userId         = useAuthStore(s => s.user?.id);
    const clearOverride  = usePlanStore(s => s.clearOverride);
    const qc             = useQueryClient();

    // Need the committed rate to restore effectiveNewPerDay in the store
    const { data: activePlanResult } = useActivePlan();
    const planCardsPerDay = activePlanResult?.plan?.cardsPerDay ?? 20;

    return useMutation({
        mutationFn: () => clearPlanOverride(userId!),
        onSuccess: () => {
            clearOverride(planCardsPerDay);
            qc.invalidateQueries({ queryKey: planKeys.active(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Plan progress (live counters) ─────────────────────────────────────────────

export function usePlanProgress(plan: Plan | null | undefined) {
    const userId = useAuthStore(s => s.user?.id);
    return useQuery<PlanProgress | null>({
        queryKey: planKeys.progress(userId ?? '', plan?.id ?? ''),
        queryFn:  () => getPlanProgress(userId!, plan!.activatedAt, plan!.deckFilter),
        enabled:  !!userId && !!plan,
        staleTime: 0,
        refetchOnWindowFocus: true,
    });
}

export type { PlanResult, Plan, ActivePlanResult, RebalanceDelta, DeckUnseenCount, PlanProgress, PlanActivityCounts };
