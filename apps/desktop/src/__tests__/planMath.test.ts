import { describe, it, expect } from 'vitest';
import {
    weekMultiplier,
    cumulativeReviews,
    dailyMinutes,
    buildWeeklyProjection,
    daysUntilExamLocal,
    WEEKLY_MULTIPLIERS,
    STEADY_FLOOR,
} from '../lib/planMath';

// Characterization + behavior tests for the plan cohort model. Update the expected
// values intentionally when the model changes; a surprise failure here means the
// projection moved unexpectedly.

describe('weekMultiplier', () => {
    it('is 0 for week <= 0', () => {
        expect(weekMultiplier(0)).toBe(0);
        expect(weekMultiplier(-3)).toBe(0);
    });

    it('follows the ramp for weeks 1..3', () => {
        expect(weekMultiplier(1)).toBe(WEEKLY_MULTIPLIERS[0]); // 0.5
        expect(weekMultiplier(2)).toBe(WEEKLY_MULTIPLIERS[1]); // 0.9
        expect(weekMultiplier(3)).toBe(WEEKLY_MULTIPLIERS[2]); // 1.2 (peak)
    });

    it('DECAYS toward the steady floor after the peak (the key model fix)', () => {
        expect(weekMultiplier(4)).toBeCloseTo(0.885, 3);   // 0.15 + 1.05*0.7
        // strictly decreasing past the peak
        expect(weekMultiplier(4)).toBeGreaterThan(weekMultiplier(5));
        expect(weekMultiplier(5)).toBeGreaterThan(weekMultiplier(6));
        // asymptotes to the floor for a fully mature card (no longer a flat 1.5 forever)
        expect(weekMultiplier(60)).toBeCloseTo(STEADY_FLOOR, 3);
    });
});

describe('cumulativeReviews', () => {
    it('sums the weekly multipliers', () => {
        expect(cumulativeReviews(0)).toBe(0);
        expect(cumulativeReviews(3)).toBeCloseTo(2.6, 10);   // 0.5+0.9+1.2
        expect(cumulativeReviews(4)).toBeCloseTo(3.485, 10); // 2.6 + 0.885
    });
});

describe('dailyMinutes', () => {
    it('combines fixed new-card + review time at the model defaults', () => {
        // newPerDay=20, week 8: cumulative≈5.388, dailyReviews≈15.395 → ≈20.08 min
        expect(dailyMinutes(20, 8)).toBeCloseTo(20.08, 2);
        expect(dailyMinutes(0, 8)).toBe(0);
    });

    it('honors calibrated per-card timings', () => {
        // same reviews, but 1 min/new + 0.5 min/review
        expect(dailyMinutes(20, 8, { minutesPerNewCard: 1, minutesPerReview: 0.5 })).toBeCloseTo(27.70, 1);
    });
});

describe('daysUntilExamLocal', () => {
    it('counts whole local calendar days to a future exam', () => {
        expect(daysUntilExamLocal('2026-08-10', new Date(2026, 7, 1, 15, 30))).toBe(9);
    });

    it('is 0 on the exam day regardless of time of day (local)', () => {
        expect(daysUntilExamLocal('2026-08-01', new Date(2026, 7, 1, 0, 5))).toBe(0);
        expect(daysUntilExamLocal('2026-08-01', new Date(2026, 7, 1, 23, 59))).toBe(0);
    });

    it('is negative for a past exam', () => {
        expect(daysUntilExamLocal('2026-07-31', new Date(2026, 7, 1, 1, 0))).toBe(-1);
    });

    it('does not drop a day for late-evening local time (the UTC-parse bug)', () => {
        // 11pm local Jul 1, exam Jul 2 → exactly 1 day. Parsing the bare date as UTC
        // midnight could read this as 0 for users west of UTC.
        expect(daysUntilExamLocal('2026-07-02', new Date(2026, 6, 1, 23, 0))).toBe(1);
    });

    it('returns 0 for a malformed date string', () => {
        expect(daysUntilExamLocal('not-a-date')).toBe(0);
    });
});

describe('buildWeeklyProjection', () => {
    it('returns an empty projection when inputs are non-positive', () => {
        expect(buildWeeklyProjection(0, 100, 30, 8)).toEqual({ weeks: [], peakMinutes: 0, daysToExhaust: 0 });
        expect(buildWeeklyProjection(10, 0, 30, 8)).toEqual({ weeks: [], peakMinutes: 0, daysToExhaust: 0 });
        expect(buildWeeklyProjection(10, 100, 0, 8)).toEqual({ weeks: [], peakMinutes: 0, daysToExhaust: 0 });
    });

    it('models a front-loaded plan that exhausts in week 2', () => {
        const p = buildWeeklyProjection(10, 140, 56, 8);
        expect(p.daysToExhaust).toBe(14);
        expect(p.weeks).toHaveLength(8);
        expect(p.peakMinutes).toBe(8);

        expect(p.weeks[0]).toEqual({ week: 1, newCardsPerDay: 10, estimatedReviewsPerDay: 1, estimatedTotalMinutes: 8 });
        expect(p.weeks[1]).toEqual({ week: 2, newCardsPerDay: 10, estimatedReviewsPerDay: 2, estimatedTotalMinutes: 8 });
        expect(p.weeks[2].newCardsPerDay).toBe(0);
        expect(p.weeks[7].newCardsPerDay).toBe(0);
    });

    it('computes peakMinutes over the FULL window, independent of the row cap', () => {
        const capped = buildWeeklyProjection(20, 3000, 300, 4);   // 4 rows
        const full   = buildWeeklyProjection(20, 3000, 300, 100);  // all rows
        expect(capped.weeks).toHaveLength(4);
        expect(capped.peakMinutes).toBe(full.peakMinutes); // truncating display rows must not lower the peak
        expect(capped.daysToExhaust).toBe(150);            // ceil(3000/20)
    });

    it('keeps the mature review load bounded (decay), unlike the old flat model', () => {
        // 100-week paced plan that never exhausts. Old flat-1.5 model implied ~420
        // reviews/day at week 100; the decaying model settles far lower.
        const p = buildWeeklyProjection(20, 100_000, 700, 100);
        const last = p.weeks[p.weeks.length - 1];
        expect(last.estimatedReviewsPerDay).toBeLessThan(100);
    });

    it('scales projected minutes with calibrated timings', () => {
        const def  = buildWeeklyProjection(20, 500, 60, 8);
        const slow = buildWeeklyProjection(20, 500, 60, 8, { minutesPerNewCard: 2, minutesPerReview: 1 });
        expect(slow.peakMinutes).toBeGreaterThan(def.peakMinutes);
    });

    it('paces new cards through the whole window when the pool never exhausts early', () => {
        const p = buildWeeklyProjection(5, 3000, 56, 8);
        expect(p.daysToExhaust).toBe(56);
        expect(p.weeks.every(w => w.newCardsPerDay === 5)).toBe(true);
    });
});
