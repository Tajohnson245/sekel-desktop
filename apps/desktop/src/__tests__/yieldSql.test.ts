import { describe, it, expect } from 'vitest';
import { toYieldLevel, YIELD_LEVEL_ORDER } from '../main/db/yieldSql';

// Pure thresholds for the normalized 0–100 yield scale (no DB).

describe('toYieldLevel', () => {
    it('treats a missing score or confidence as unclassified', () => {
        expect(toYieldLevel(null, 0.9)).toBe('unclassified');
        expect(toYieldLevel(80, null)).toBe('unclassified');
    });

    it('treats low-confidence (<0.5) mappings as unclassified regardless of score', () => {
        expect(toYieldLevel(95, 0.49)).toBe('unclassified');
        expect(toYieldLevel(95, 0.5)).toBe('high'); // 0.5 is the inclusive boundary
    });

    it('buckets the normalized score at the 66 / 33 boundaries', () => {
        expect(toYieldLevel(66, 0.9)).toBe('high');
        expect(toYieldLevel(65.9, 0.9)).toBe('medium');
        expect(toYieldLevel(33, 0.9)).toBe('medium');
        expect(toYieldLevel(32.9, 0.9)).toBe('low');
        expect(toYieldLevel(0, 0.9)).toBe('low');
        expect(toYieldLevel(100, 0.9)).toBe('high');
    });
});

describe('YIELD_LEVEL_ORDER', () => {
    it('ranks high-yield first and unclassified last', () => {
        expect(YIELD_LEVEL_ORDER.high).toBeLessThan(YIELD_LEVEL_ORDER.medium);
        expect(YIELD_LEVEL_ORDER.medium).toBeLessThan(YIELD_LEVEL_ORDER.low);
        expect(YIELD_LEVEL_ORDER.low).toBeLessThan(YIELD_LEVEL_ORDER.unclassified);
    });
});
