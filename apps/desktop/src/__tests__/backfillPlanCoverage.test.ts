import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// The boot logger isn't under test; stub it so the module resolves without the
// @sekel/observability workspace package (which nothing else in the test suite pulls in).
vi.mock('@sekel/observability', () => ({
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {} }),
    consoleTransport: {},
}));

import { backfillPlanCoverage, correctPlanCoverage } from '../main/db/backfill';

// ── In-memory test database ─────────────────────────────────────────────────

let db: Database.Database;

function setupDb(): Database.Database {
    const d = new Database(':memory:');
    d.pragma('foreign_keys = ON');
    d.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        d.exec(MIGRATIONS[i]);
        d.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return d;
}

interface SnapInput {
    unseenTotal: number;
    availableDays: number;
    projectedCoverageCount: number;
    projectedCoverage: number;
    systemCoverage?: { systemKey: string; totalCards: number; cardsInPlan: number; cardsSkipped: number; coveragePct: number }[];
    [k: string]: unknown;
}

const SEED_TS = '2026-01-01T00:00:00.000Z';
let planSeq = 0;

function insertPlan(cardsPerDay: number, snapshot: SnapInput, suggestedPerDay = 20): string {
    const id = `plan-${++planSeq}`;
    db.prepare(`
        INSERT INTO plans (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
            snapshot, deck_filter, status, activated_at, created_at, updated_at)
        VALUES (?, 'user-1', 'step1', 'Test Plan', ?, ?, ?, NULL, 'active', ?, ?, ?)
    `).run(id, cardsPerDay, suggestedPerDay, JSON.stringify(snapshot), SEED_TS, SEED_TS, SEED_TS);
    return id;
}

function readSnap(id: string): SnapInput {
    const row = db.prepare('SELECT snapshot FROM plans WHERE id = ?').get(id) as { snapshot: string };
    return JSON.parse(row.snapshot) as SnapInput;
}
function readUpdatedAt(id: string): string {
    return (db.prepare('SELECT updated_at FROM plans WHERE id = ?').get(id) as { updated_at: string }).updated_at;
}

beforeEach(() => {
    db = setupDb();
    planSeq = 0;
});

describe('backfillPlanCoverage', () => {
    it('corrects a diverged plan whose committed rate now covers the whole scope (rings → full)', () => {
        const id = insertPlan(40, {            // 40 × 30 = 1200 ≥ 1000 → 100% coverage
            unseenTotal: 1000,
            availableDays: 30,
            projectedCoverageCount: 600,       // stale: computed at suggested rate 20
            projectedCoverage: 0.6,
            recommendedNewPerDay: 20,          // unrelated field must survive
            systemCoverage: [
                { systemKey: 'cardio', totalCards: 400, cardsInPlan: 240, cardsSkipped: 160, coveragePct: 60 },
                { systemKey: 'renal', totalCards: 0, cardsInPlan: 0, cardsSkipped: 0, coveragePct: 100 },
            ],
        });

        backfillPlanCoverage(db);

        const snap = readSnap(id);
        expect(snap.projectedCoverageCount).toBe(1000);
        expect(snap.projectedCoverage).toBe(1);
        expect(snap.recommendedNewPerDay).toBe(20);
        expect(snap.systemCoverage).toEqual([
            { systemKey: 'cardio', totalCards: 400, cardsInPlan: 400, cardsSkipped: 0, coveragePct: 100 },
            { systemKey: 'renal', totalCards: 0, cardsInPlan: 0, cardsSkipped: 0, coveragePct: 100 },
        ]);
    });

    it('corrects the coverage scalars but leaves system rings for partial coverage', () => {
        const id = insertPlan(10, {            // 10 × 30 = 300 < 1000 → partial coverage
            unseenTotal: 1000,
            availableDays: 30,
            projectedCoverageCount: 900,       // stale: suggested rate 30
            projectedCoverage: 0.9,
            systemCoverage: [
                { systemKey: 'cardio', totalCards: 400, cardsInPlan: 360, cardsSkipped: 40, coveragePct: 90 },
            ],
        });

        backfillPlanCoverage(db);

        const snap = readSnap(id);
        expect(snap.projectedCoverageCount).toBe(300);
        expect(snap.projectedCoverage).toBeCloseTo(0.3, 10);
        // rings can't be redistributed without the original per-card selection → untouched
        expect(snap.systemCoverage).toEqual([
            { systemKey: 'cardio', totalCards: 400, cardsInPlan: 360, cardsSkipped: 40, coveragePct: 90 },
        ]);
    });

    it('leaves an already-correct (non-diverged) plan untouched and does not bump updated_at', () => {
        const id = insertPlan(20, {            // committed == suggested; 20 × 30 = 600 already stored
            unseenTotal: 1000,
            availableDays: 30,
            projectedCoverageCount: 600,
            projectedCoverage: 0.6,
        }, 20);
        const before = readUpdatedAt(id);

        backfillPlanCoverage(db);

        const snap = readSnap(id);
        expect(snap.projectedCoverageCount).toBe(600);
        expect(snap.projectedCoverage).toBe(0.6);
        expect(readUpdatedAt(id)).toBe(before);
    });

    it('never bumps updated_at even when it rewrites the snapshot', () => {
        const id = insertPlan(40, {
            unseenTotal: 1000, availableDays: 30, projectedCoverageCount: 600, projectedCoverage: 0.6,
        });
        const before = readUpdatedAt(id);

        backfillPlanCoverage(db);

        expect(readSnap(id).projectedCoverageCount).toBe(1000); // snapshot was rewritten
        expect(readUpdatedAt(id)).toBe(before);                 // but the date range is preserved
    });

    it('is idempotent — a second pass changes nothing', () => {
        const id = insertPlan(40, {
            unseenTotal: 1000, availableDays: 30, projectedCoverageCount: 600, projectedCoverage: 0.6,
            systemCoverage: [{ systemKey: 'cardio', totalCards: 400, cardsInPlan: 240, cardsSkipped: 160, coveragePct: 60 }],
        });

        backfillPlanCoverage(db);
        const afterFirst = readSnap(id);

        backfillPlanCoverage(db);
        expect(readSnap(id)).toEqual(afterFirst);
    });

    it('skips a plan with a malformed snapshot without throwing', () => {
        db.prepare(`
            INSERT INTO plans (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
                snapshot, deck_filter, status, activated_at, created_at, updated_at)
            VALUES ('bad-1', 'user-1', 'step1', 'Bad', 40, 20, ?, NULL, 'active', ?, ?, ?)
        `).run('not valid json{', SEED_TS, SEED_TS, SEED_TS);

        expect(() => backfillPlanCoverage(db)).not.toThrow();
    });
});

describe('correctPlanCoverage (pure)', () => {
    it('returns false when frozen inputs are missing', () => {
        expect(correctPlanCoverage({ projectedCoverageCount: 5 }, 20)).toBe(false);
    });

    it('returns false when the stored count already matches the committed rate', () => {
        const snap = { unseenTotal: 100, availableDays: 10, projectedCoverageCount: 100, projectedCoverage: 1 };
        expect(correctPlanCoverage(snap, 20)).toBe(false); // min(100, 20×10) === 100
    });

    it('treats a 0-card scope as fully covered (coverage = 1)', () => {
        const snap: { unseenTotal: number; availableDays: number; projectedCoverageCount: number; projectedCoverage?: number } =
            { unseenTotal: 0, availableDays: 10, projectedCoverageCount: 5 };
        expect(correctPlanCoverage(snap, 20)).toBe(true);
        expect(snap.projectedCoverageCount).toBe(0);
        expect(snap.projectedCoverage).toBe(1);
    });
});
