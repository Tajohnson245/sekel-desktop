/**
 * Plan Mode store.
 *
 * Holds the effective daily new-card limit derived from the active plan.
 * useDueCards reads effectiveNewPerDay first; Supabase profile limits are the
 * fallback when no plan is active.
 *
 * Seeded on app start by useActivePlan() in AppLayout.
 */

import { create } from 'zustand';
import type { Plan } from '../types/electron';

interface PlanStoreState {
    /** ID of the currently active plan (null = no plan). */
    activePlanId:       string | null;
    /** Effective new-cards-per-day (plan rate, or override value). */
    effectiveNewPerDay: number | null;
    /** True when a one-session override is active for today. */
    hasOverride:        boolean;
    /** ISO timestamp when the override expires (tomorrow midnight). */
    overrideExpiresAt:  string | null;

    /**
     * Called by useActivePlan on successful fetch.
     * Handles override expiry check: if an override exists and is still valid
     * the override values are preserved; otherwise the plan's committed rate is used.
     */
    setActivePlan:   (plan: Plan, overrideExpiresAt: string | null, currentDailyNewLimit: number) => void;
    clearActivePlan: () => void;
    setOverride:     (newPerDay: number, expiresAt: string) => void;
    clearOverride:   (planCardsPerDay: number) => void;
    reset:           () => void;
}

export const usePlanStore = create<PlanStoreState>((set) => ({
    activePlanId:       null,
    effectiveNewPerDay: null,
    hasOverride:        false,
    overrideExpiresAt:  null,

    setActivePlan: (plan, overrideExpiresAt, currentDailyNewLimit) => {
        const overrideStillValid =
            overrideExpiresAt !== null && new Date(overrideExpiresAt) > new Date();

        set({
            activePlanId:       plan.id,
            effectiveNewPerDay: overrideStillValid ? currentDailyNewLimit : plan.cardsPerDay,
            hasOverride:        overrideStillValid,
            overrideExpiresAt:  overrideStillValid ? overrideExpiresAt : null,
        });
    },

    clearActivePlan: () =>
        set({ activePlanId: null, effectiveNewPerDay: null, hasOverride: false, overrideExpiresAt: null }),

    setOverride: (newPerDay, expiresAt) =>
        set({ effectiveNewPerDay: newPerDay, hasOverride: true, overrideExpiresAt: expiresAt }),

    clearOverride: (planCardsPerDay) =>
        set({ effectiveNewPerDay: planCardsPerDay, hasOverride: false, overrideExpiresAt: null }),

    reset: () =>
        set({ activePlanId: null, effectiveNewPerDay: null, hasOverride: false, overrideExpiresAt: null }),
}));
