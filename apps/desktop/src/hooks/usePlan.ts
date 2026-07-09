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
    updatePlanRate,
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

// ── Active plan ───────────────────────────────────────────────────────────────

export function useActivePlan(examKey?: string | null) {
    const userId = useAuthStore(s => s.user?.id);

    return useQuery<ActivePlanResult | null>({
        queryKey: planKeys.active(userId ?? '', examKey ?? undefined),
        queryFn:  () => getActivePlan(userId!, examKey ?? undefined),
        enabled:   !!userId,
        staleTime: 0, // always re-fetch on mount (drives session card cap)
    });
}

// ── Effective plan (derived — single source of truth for the daily new cap) ───
//
// The number that gates the study queue is DERIVED from the active-plan query
// rather than mirrored into a Zustand store. This removes the side-effect-in-
// queryFn seeding and the cross-key races / drift it caused: every reader sees
// the same value off one cache entry, override expiry is resolved in one place
// (an expired override is treated as absent), and stale state can't outlive a
// session or login.

export interface EffectivePlan {
    activePlanId:       string | null;
    /** Effective new-cards-per-day: live override value, else the plan rate, else null. */
    effectiveNewPerDay: number | null;
    hasOverride:        boolean;
    /** Override expiry when an override is currently live; null otherwise. */
    overrideExpiresAt:  string | null;
}

export function deriveEffectivePlan(result: ActivePlanResult | null | undefined): EffectivePlan {
    if (!result) {
        return { activePlanId: null, effectiveNewPerDay: null, hasOverride: false, overrideExpiresAt: null };
    }
    const { plan, overrideExpiresAt, currentDailyNewLimit } = result;
    const overrideLive = overrideExpiresAt !== null && new Date(overrideExpiresAt) > new Date();
    return {
        activePlanId:       plan.id,
        effectiveNewPerDay: overrideLive ? currentDailyNewLimit : plan.cardsPerDay,
        hasOverride:        overrideLive,
        overrideExpiresAt:  overrideLive ? overrideExpiresAt : null,
    };
}

/** Derives the effective daily-new cap from the user's active plan (primary exam). */
export function useEffectivePlan(): EffectivePlan {
    const { data } = useActivePlan();
    return deriveEffectivePlan(data);
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
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

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
            // Seed the active-plan cache (the single source of truth) for both the
            // exam-scoped and unscoped query keys so the derived cap updates without
            // waiting for a refetch.
            qc.setQueryData(planKeys.active(userId ?? '', plan.examKey), result);
            qc.setQueryData(planKeys.active(userId ?? ''), result);
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Archive plan ──────────────────────────────────────────────────────────────

export function useArchivePlan() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: (planId: string) => archivePlan(userId!, planId),
        onSuccess: (_filePath, planId) => {
            // No active plan after archiving — clear the unscoped cache immediately and
            // invalidate the exam-scoped variants (partial key) so the derived cap reverts.
            qc.setQueryData(planKeys.active(userId ?? ''), null);
            qc.invalidateQueries({ queryKey: ['plan', 'active', userId ?? ''] });
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
        onSuccess: (_data, planId) => {
            // Eagerly remove the deleted plan so the UI doesn't flash stale data
            // while the background refetch is in-flight (mirrors useArchivePlan pattern)
            qc.setQueryData(planKeys.list(userId ?? ''), (old: Plan[] | undefined) =>
                old?.filter(p => p.id !== planId) ?? []
            );
            // In case the active plan was the one deleted: clear the unscoped cache
            // and broad-invalidate so the derived cap reverts to the profile limit.
            qc.setQueryData(planKeys.active(userId ?? ''), null);
            qc.invalidateQueries({ queryKey: ['plan', 'active', userId ?? ''] });
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Reactivate plan ───────────────────────────────────────────────────────────

export function useReactivatePlan() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: (planId: string) => reactivatePlan(userId!, planId),
        onSuccess: (plan) => {
            if (!plan) return;
            const result = { plan, overrideExpiresAt: null, currentDailyNewLimit: plan.cardsPerDay };
            qc.setQueryData(planKeys.active(userId ?? '', plan.examKey), result);
            qc.setQueryData(planKeys.active(userId ?? ''), result);
            qc.invalidateQueries({ queryKey: planKeys.list(userId ?? '') });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Override mutations ────────────────────────────────────────────────────────

export function useSetPlanOverride() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: (newPerDay: number) => setPlanOverride(userId!, newPerDay),
        onSuccess: () => {
            // Override is now persisted; re-read the active plan so the derived cap
            // reflects it, then refetch decks so the study queue picks up the limit.
            qc.invalidateQueries({ queryKey: ['plan', 'active', userId ?? ''] });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

export function useClearPlanOverride() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: () => clearPlanOverride(userId!),
        onSuccess: () => {
            // Override cleared in the DB; re-read the active plan so the derived cap
            // returns to the committed rate, and refetch decks for the study queue.
            qc.invalidateQueries({ queryKey: ['plan', 'active', userId ?? ''] });
            qc.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}

// ── Commit a rebalanced rate (rebalance "Got it" / accept) ────────────────────

export function useUpdatePlanRate() {
    const userId = useAuthStore(s => s.user?.id);
    const qc     = useQueryClient();

    return useMutation({
        mutationFn: ({ examKey, newRate }: { examKey: string; newRate: number }) =>
            updatePlanRate(userId!, examKey, newRate),
        onSuccess: () => {
            // Re-read active plan (derived cap), re-run rebalance detection (now
            // committed == recommended → no delta), and refresh the study queue.
            qc.invalidateQueries({ queryKey: ['plan'] });
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
