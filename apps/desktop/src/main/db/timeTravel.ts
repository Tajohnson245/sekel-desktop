import { getDb } from './index';

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_DAILY_TARGET = 50;
const MAX_WINDOW_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimeTravelPreview {
    overdueCount: number;
    windowDays: number;
    dailyTarget: number;
    distribution: { date: string; count: number }[];
}

export interface TimeTravelResult {
    overdueCount: number;
    windowDays: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build the WHERE clause for overdue review cards. */
function overdueWhereClause(daysBack: number): string {
    return `
        WHERE due < datetime('now', '-${daysBack} day')
          AND state = 'review'
          AND last_review IS NOT NULL
    `;
}

/** Get local midnight for today + dayOffset as an ISO string. */
function localMidnightISO(dayOffset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

/** Format a date offset as YYYY-MM-DD in local timezone. */
function localDateString(dayOffset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Preview what a time-travel redistribution would do (read-only, no DB writes).
 */
export function timeTravelPreview(daysBack: number): TimeTravelPreview {
    const clampedDays = Math.max(1, Math.min(MAX_WINDOW_DAYS, Math.round(daysBack)));
    const db = getDb();

    const { overdue_count } = db.prepare(
        `SELECT COUNT(*) as overdue_count FROM cards ${overdueWhereClause(clampedDays)}`,
    ).get() as { overdue_count: number };

    if (overdue_count === 0) {
        return { overdueCount: 0, windowDays: 0, dailyTarget: DEFAULT_DAILY_TARGET, distribution: [] };
    }

    const windowDays = Math.min(MAX_WINDOW_DAYS, Math.ceil(overdue_count / DEFAULT_DAILY_TARGET));
    const batchSize = Math.ceil(overdue_count / windowDays);

    const distribution: { date: string; count: number }[] = [];
    for (let day = 0; day < windowDays; day++) {
        const start = day * batchSize;
        const count = Math.min(batchSize, overdue_count - start);
        distribution.push({ date: localDateString(day), count });
    }

    return { overdueCount: overdue_count, windowDays, dailyTarget: DEFAULT_DAILY_TARGET, distribution };
}

/**
 * Execute the time-travel redistribution — updates card `due` dates and logs
 * the event. Only `due` and `updated_at` are modified on cards.
 */
export function timeTravelExecute(daysBack: number): TimeTravelResult {
    const clampedDays = Math.max(1, Math.min(MAX_WINDOW_DAYS, Math.round(daysBack)));
    const db = getDb();

    const overdueCards = db.prepare(
        `SELECT id FROM cards ${overdueWhereClause(clampedDays)} ORDER BY due ASC`,
    ).all() as { id: string }[];

    const overdueCount = overdueCards.length;
    if (overdueCount === 0) {
        return { overdueCount: 0, windowDays: 0 };
    }

    const windowDays = Math.min(MAX_WINDOW_DAYS, Math.ceil(overdueCount / DEFAULT_DAILY_TARGET));
    const batchSize = Math.ceil(overdueCount / windowDays);
    const now = new Date().toISOString();

    const redistribute = db.transaction(() => {
        const updateStmt = db.prepare('UPDATE cards SET due = ?, updated_at = ? WHERE id = ?');

        for (let i = 0; i < overdueCards.length; i++) {
            const dayOffset = Math.floor(i / batchSize);
            updateStmt.run(localMidnightISO(dayOffset), now, overdueCards[i].id);
        }

        db.prepare(
            'INSERT INTO time_travel_log (triggered_at, overdue_count, window_days, daily_target) VALUES (?, ?, ?, ?)',
        ).run(now, overdueCount, windowDays, DEFAULT_DAILY_TARGET);
    });

    redistribute();

    console.log(
        `[TimeTravel] Redistributed ${overdueCount} overdue cards across ${windowDays} days (target: ${DEFAULT_DAILY_TARGET}/day)`,
    );

    return { overdueCount, windowDays };
}
