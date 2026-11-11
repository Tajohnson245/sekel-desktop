import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { localDateKey, addDaysToDateKey, localWeekKey } from '../lib/localDate';
import { daysUntilExamLocal } from '../lib/planMath';

// Pin a west-of-UTC zone WITH daylight saving so the UTC-vs-local bugs these
// helpers replace actually manifest (in UTC they would pass vacuously). Node
// applies a runtime TZ change on every platform (incl. Windows) via ICU; the
// beforeAll guard fails loudly if it ever doesn't. Restored afterwards so a
// reused worker isn't left in this zone.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'America/New_York';

beforeAll(() => {
    // EST = UTC−5 in January, EDT = UTC−4 in July.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(240);
});

afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
});

describe('localDateKey', () => {
    it('uses the LOCAL calendar day, not the UTC one', () => {
        const eveningLocal = new Date(2026, 2, 2, 20, 0); // Mar 2, 8pm EST = Mar 3 01:00 UTC
        expect(eveningLocal.toISOString().slice(0, 10)).toBe('2026-03-03'); // the old bucket
        expect(localDateKey(eveningLocal)).toBe('2026-03-02');
    });

    it('zero-pads month and day', () => {
        expect(localDateKey(new Date(2026, 0, 5, 9))).toBe('2026-01-05');
    });
});

describe('addDaysToDateKey', () => {
    it('does not lose a day across the spring-forward DST change', () => {
        // US DST starts 2026-03-08. The old "UTC parse + setDate + toISOString" path
        // landed on Mar 10 here.
        const legacy = new Date('2026-03-01');
        legacy.setDate(legacy.getDate() + 10);
        expect(legacy.toISOString().slice(0, 10)).toBe('2026-03-10');

        expect(addDaysToDateKey('2026-03-01', 10)).toBe('2026-03-11');
    });

    it('handles fall-back DST, month and year rollovers, and negative offsets', () => {
        expect(addDaysToDateKey('2026-10-30', 5)).toBe('2026-11-04'); // DST ends Nov 1
        expect(addDaysToDateKey('2026-12-30', 5)).toBe('2027-01-04');
        expect(addDaysToDateKey('2028-02-28', 1)).toBe('2028-02-29'); // leap year
        expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDaysToDateKey('2026-03-01', 0)).toBe('2026-03-01');
    });

    it('returns a malformed input unchanged', () => {
        expect(addDaysToDateKey('not-a-date', 3)).toBe('not-a-date');
    });
});

describe('localWeekKey', () => {
    it("numbers weeks exactly like SQLite's strftime('%Y-W%W') for every day of 2025–2028", () => {
        const db = new Database(':memory:');
        const stmt = db.prepare(`SELECT strftime('%Y-W%W', ?) AS w`);
        const mismatches: string[] = [];
        for (let d = new Date(2025, 0, 1, 12); d.getFullYear() < 2029; d.setDate(d.getDate() + 1)) {
            const key = localDateKey(d); // bare date → strftime treats it as that calendar day
            const expected = (stmt.get(key) as { w: string }).w;
            if (localWeekKey(d) !== expected) mismatches.push(`${key}: ${localWeekKey(d)} != ${expected}`);
        }
        db.close();
        expect(mismatches).toEqual([]);
    });

    it('buckets by the LOCAL day (late Sunday evening stays in its own week)', () => {
        // Sun 2026-03-08 22:00 EDT = Mon 02:00 UTC — UTC would roll it into the next week.
        const sundayNight = new Date(2026, 2, 8, 22, 0);
        expect(localWeekKey(sundayNight)).toBe(localWeekKey(new Date(2026, 2, 8, 9, 0)));
        expect(localWeekKey(sundayNight)).not.toBe(localWeekKey(new Date(2026, 2, 9, 9, 0)));
    });
});

describe('daysUntilExamLocal (west-of-UTC, across DST)', () => {
    it('is exact on late evenings and across the DST change', () => {
        // 10pm local the day before → 1 (the old floor(UTC-midnight − now) gave 0 or −1).
        expect(daysUntilExamLocal('2026-03-05', new Date(2026, 2, 4, 22, 0))).toBe(1);
        // Spans the Mar 8 spring-forward (a 23-hour day).
        expect(daysUntilExamLocal('2026-03-10', new Date(2026, 2, 1, 23, 30))).toBe(9);
        expect(daysUntilExamLocal('2026-03-10', new Date(2026, 2, 10, 23, 59))).toBe(0);
        expect(daysUntilExamLocal('2026-03-10', new Date(2026, 2, 11, 0, 1))).toBe(-1);
    });
});
