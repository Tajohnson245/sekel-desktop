import type Database from 'better-sqlite3';
import { createLogger, consoleTransport } from '@sekel/observability';

const log = createLogger({ module: 'db', transports: [consoleTransport] });

type SnapSystem = { totalCards: number; cardsInPlan: number; cardsSkipped: number; coveragePct: number };
type PlanSnapshot = {
    unseenTotal?: unknown;
    availableDays?: unknown;
    projectedCoverageCount?: unknown;
    projectedCoverage?: number;
    systemCoverage?: SnapSystem[];
    [key: string]: unknown;
};

/**
 * Recompute a plan snapshot's coverage for the committed rate, in place, from the
 * snapshot's own FROZEN inputs (unseenTotal, availableDays). Pure arithmetic — no
 * I/O, no recompute against current DB state — so the result is creation-time
 * accurate. Returns true if anything changed.
 *
 * Plans committed before computePlan became rate-aware stored projectedCoverageCount
 * / projectedCoverage at the SUGGESTED rate; this corrects them to the committed
 * cards_per_day. When the committed rate now reaches the whole scope, every system
 * ring is set to full coverage. Partial coverage can't be redistributed without the
 * original per-card yield selection (not stored), so those rings are left untouched.
 */
export function correctPlanCoverage(snapshot: PlanSnapshot, cardsPerDay: number): boolean {
    const { unseenTotal, availableDays } = snapshot;
    if (typeof unseenTotal !== 'number' || typeof availableDays !== 'number') return false;

    const correctCount = Math.min(unseenTotal, cardsPerDay * availableDays);
    if (snapshot.projectedCoverageCount === correctCount) return false; // already correct

    snapshot.projectedCoverageCount = correctCount;
    snapshot.projectedCoverage = unseenTotal > 0 ? correctCount / unseenTotal : 1;

    if (correctCount >= unseenTotal && Array.isArray(snapshot.systemCoverage)) {
        for (const sys of snapshot.systemCoverage) {
            sys.cardsInPlan = sys.totalCards;
            sys.cardsSkipped = 0;
            sys.coveragePct = 100;
        }
    }
    return true;
}

/**
 * Boot-time backfill pass: correct every plan whose stored coverage was computed
 * at the suggested rate rather than the committed rate. Idempotent and cheap —
 * only writes plans that are actually stale (so it's a no-op once corrected and
 * for plans created after the fix), reads no other tables, and intentionally
 * leaves updated_at alone so archived plans keep their real date range.
 */
export function backfillPlanCoverage(database: Database.Database): void {
    const rows = database.prepare(
        `SELECT id, cards_per_day, snapshot FROM plans`
    ).all() as { id: string; cards_per_day: number; snapshot: string }[];
    if (rows.length === 0) return;

    const update = database.prepare(`UPDATE plans SET snapshot = ? WHERE id = ?`);
    let fixed = 0;

    for (const row of rows) {
        let snap: PlanSnapshot;
        try { snap = JSON.parse(row.snapshot) as PlanSnapshot; }
        catch { continue; }

        if (correctPlanCoverage(snap, row.cards_per_day)) {
            update.run(JSON.stringify(snap), row.id);
            fixed++;
        }
    }

    if (fixed > 0) log.info('Backfilled plan coverage to committed rate', { plansUpdated: fixed });
}
