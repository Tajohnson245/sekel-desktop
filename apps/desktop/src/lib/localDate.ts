/**
 * Local-calendar date helpers — pure and dependency-free, so both the main
 * process and the renderer can import them (same pattern as `lib/planMath`).
 *
 * Timestamps are stored as UTC ISO strings, but "a day" to the user is a LOCAL
 * calendar day. Slicing `toISOString()` or bucketing with SQLite's `DATE()`
 * groups by UTC instead, which moves a west-of-UTC user's evening study into the
 * next day (and an east-of-UTC user's early morning into the previous one).
 * Likewise `new Date('YYYY-MM-DD')` parses a bare date as UTC midnight. Use these
 * helpers whenever a value is meant to be a calendar day.
 *
 * For "days until the exam", use `daysUntilExamLocal` in `lib/planMath`.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the LOCAL calendar day containing `d`. */
export function localDateKey(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Add whole calendar days to a 'YYYY-MM-DD' date and return the result as
 * 'YYYY-MM-DD'. Built from the date's parts in local time, so it never loses or
 * gains a day across a daylight-saving transition. Returns the input unchanged
 * when it isn't a valid 'YYYY-MM-DD' string.
 */
export function addDaysToDateKey(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return localDateKey(new Date(y, m - 1, d + days));
}

/**
 * Week bucket 'YYYY-Www' for the LOCAL day containing `d`, numbered exactly like
 * SQLite's `strftime('%Y-W%W', …)`: weeks start on Monday, and days before the
 * year's first Monday fall in week 00.
 */
export function localWeekKey(d: Date): string {
    const year = d.getFullYear();
    const dayOfYear = Math.round(
        (new Date(year, d.getMonth(), d.getDate()).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000,
    );
    const mondayBasedWeekday = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
    return `${year}-W${pad2(Math.floor((dayOfYear + 7 - mondayBasedWeekday) / 7))}`;
}
