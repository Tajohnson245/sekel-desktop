import { instrumentedHandle } from '@sekel/observability';
import { getDb } from '../main/db/index';
import {
    computePlan,
    createPlan,
    getActivePlan,
    listPlans,
    archivePlan,
    deletePlan,
    reactivatePlan,
    getPlanRebalanceDelta,
    getDeckUnseenCounts,
    getPlanProgress,
    getPlanById,
    fetchPlansReferencingDecks,
    updatePlanRate,
    clearPlanOverride,
} from '../main/db/planService';
import { exportPlanToFile } from '../main/plan/exportService';

export function setupPlanHandlers(): void {

    // ── Compute suggestion (pure — no DB writes) ─────────────────────────────
    instrumentedHandle('plan:compute', (_e, userId: string, examKey: string, deckIds?: string[]) =>
        computePlan(userId, examKey, deckIds));

    // ── Deck unseen counts (for scope picker) ─────────────────────────────────
    instrumentedHandle('plan:getDeckUnseenCounts', (_e, userId: string) =>
        getDeckUnseenCounts(userId));

    // ── Create + commit a plan ────────────────────────────────────────────────
    instrumentedHandle('plan:create',
        (_e, userId: string, examKey: string, cardsPerDay: number, name: string, snapshot: ReturnType<typeof computePlan>) => {
            if (!snapshot) return null;
            return createPlan(userId, examKey, cardsPerDay, name, snapshot);
        }
    );

    // ── Read active plan (+ override metadata from user_profiles) ────────────
    instrumentedHandle('plan:getActive', (_e, userId: string, examKey?: string) =>
        getActivePlan(userId, examKey));

    // ── List all plans for a user ─────────────────────────────────────────────
    instrumentedHandle('plan:list', (_e, userId: string) =>
        listPlans(userId));

    // ── Archive a plan + auto-save JSON to userData/archived-plans/ ──────────
    instrumentedHandle('plan:archive', (_e, userId: string, planId: string) => {
        archivePlan(userId, planId);
        const plan = getPlanById(userId, planId);
        if (!plan) return '';
        try {
            return exportPlanToFile(plan);
        } catch {
            return '';
        }
    });

    // ── Delete a plan ─────────────────────────────────────────────────────────
    instrumentedHandle('plan:delete', (_e, userId: string, planId: string) =>
        deletePlan(userId, planId));

    // ── Plans referencing given deck IDs (pre-delete warning) ─────────────────
    instrumentedHandle('plan:fetchPlansReferencingDecks', (_e, userId: string, deckIds: string[]) =>
        fetchPlansReferencingDecks(userId, deckIds));

    // ── Reactivate an archived plan ───────────────────────────────────────────
    instrumentedHandle('plan:reactivate', (_e, userId: string, planId: string) =>
        reactivatePlan(userId, planId));

    // ── Rebalance delta ───────────────────────────────────────────────────────
    instrumentedHandle('plan:rebalance', (_e, userId: string, examKey: string) =>
        getPlanRebalanceDelta(userId, examKey));

    // ── Live progress ─────────────────────────────────────────────────────────
    instrumentedHandle('plan:getProgress',
        (_e, userId: string, activatedAt: string, deckFilter: string[] | null) =>
            getPlanProgress(userId, activatedAt, deckFilter)
    );

    // ── One-session override ──────────────────────────────────────────────────
    instrumentedHandle('plan:setOverride',
        (_e, userId: string, newPerDayOverride: number) => {
            const db = getDb();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO user_profiles (id, daily_new_limit, plan_override_expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    daily_new_limit          = excluded.daily_new_limit,
                    plan_override_expires_at = excluded.plan_override_expires_at,
                    updated_at               = excluded.updated_at
            `).run(userId, newPerDayOverride, tomorrow.toISOString(), now, now);
        }
    );

    // ── Commit a new committed rate to the active plan (rebalance "accept") ───
    // Persists the recomputed rate as the plan's cards_per_day and restarts the
    // rebalance evaluation window from now, so already-missed days aren't re-judged
    // against it; also mirrors it to user_profiles.daily_new_limit and clears any
    // live override. Atomic (see updatePlanRate).
    instrumentedHandle('plan:updateRate', (_e, userId: string, examKey: string, newRate: number) =>
        updatePlanRate(userId, examKey, newRate));

    // ── Clear override — restore the primary exam's active plan rate ──────────
    instrumentedHandle('plan:clearOverride', (_e, userId: string, examKey?: string) =>
        clearPlanOverride(userId, examKey));
}
