/**
 * Desktop Notifications — IPC handlers + scheduler
 *
 * Three notification types:
 *   1. Cards Due Reminder — fires at user-configured times, checks due card count
 *   2. Study Streak — triggered from renderer after a study session completes
 *   3. Threshold Shift — fires once when the user crosses a yield-multiplier tier
 */

import { ipcMain, Notification, BrowserWindow } from 'electron';
import { fetchAllDueCardsCount, fetchUserReviewHistory } from '../main/db/service';
import { getDb } from '../main/db/index';
import type { ReviewDayCount } from '@sekel/db';

// ── State ────────────────────────────────────────────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastFiredMinute = ''; // prevents firing multiple times in the same minute
let currentUserId: string | null = null;
let currentReminderTimes: string[] = [];
let notificationsEnabled = false;

// ── Streak Calculation ───────────────────────────────────────────────────────

function calculateStreak(history: ReviewDayCount[]): number {
    if (history.length === 0) return 0;

    // Build a set of dates that have reviews (YYYY-MM-DD)
    const reviewDates = new Set(history.map(r => r.date));

    let streak = 0;
    const today = new Date();

    // Walk backwards from today
    for (let i = 0; i <= 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);

        if (reviewDates.has(dateStr)) {
            streak++;
        } else if (i === 0) {
            // Today has no reviews yet — still check yesterday
            continue;
        } else {
            break;
        }
    }

    return streak;
}

// ── Scheduler ────────────────────────────────────────────────────────────────

function checkAndNotify() {
    if (!notificationsEnabled || !currentUserId || currentReminderTimes.length === 0) return;

    const now = new Date();
    const currentMinute = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Already fired this minute
    if (currentMinute === lastFiredMinute) return;

    // Check if current time matches any reminder
    if (!currentReminderTimes.includes(currentMinute)) return;

    lastFiredMinute = currentMinute;

    try {
        const dueCount = fetchAllDueCardsCount(currentUserId);
        if (dueCount > 0) {
            const notification = new Notification({
                title: 'Cards Due',
                body: `You have ${dueCount} card${dueCount === 1 ? '' : 's'} waiting for review.`,
                silent: false,
            });
            notification.on('click', () => {
                const win = BrowserWindow.getAllWindows()[0];
                if (win) {
                    win.show();
                    win.focus();
                }
            });
            notification.show();
        }
    } catch {
        // DB may not be initialized yet — skip silently
    }
}

function startScheduler() {
    if (schedulerInterval) return;
    // Check every 30 seconds — lightweight, catches the minute window reliably
    schedulerInterval = setInterval(checkAndNotify, 30_000);
}

function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupNotificationHandlers() {
    // Update scheduler config when profile settings change
    ipcMain.handle('notify:configure', (_e, config: {
        userId: string;
        enabled: boolean;
        reminderTimes: string[];
    }) => {
        currentUserId = config.userId;
        notificationsEnabled = config.enabled;
        currentReminderTimes = config.reminderTimes;
        lastFiredMinute = ''; // reset so new times can fire

        if (notificationsEnabled && currentReminderTimes.length > 0) {
            startScheduler();
        } else {
            stopScheduler();
        }
    });

    // Show a study streak notification (called from renderer after session complete)
    ipcMain.handle('notify:streak', (_e, userId: string) => {
        try {
            const history = fetchUserReviewHistory(userId, 365);
            const streak = calculateStreak(history);

            if (streak >= 2) {
                const notification = new Notification({
                    title: 'Study Streak!',
                    body: streak === 2
                        ? `You're on a 2-day streak. Keep it up!`
                        : `${streak}-day study streak! You're on fire.`,
                    silent: false,
                });
                notification.show();
            }

            return streak;
        } catch {
            return 0;
        }
    });

    // Check for yield-multiplier threshold crossing on session start
    ipcMain.handle('notify:threshold-shift', (_e, userId: string) => {
        try {
            return checkThresholdShift(userId);
        } catch {
            return { shifted: false, multiplier: 1.0, daysUntilExam: null };
        }
    });
}

// ── Threshold Shift ─────────────────────────────────────────────────────────

const EXAM_DATE_SENTINEL = '9999-12-31';

function computeMultiplier(
    examDate: string,
    sessionMode: string,
): { multiplier: number; daysUntilExam: number | null } {
    if (examDate === EXAM_DATE_SENTINEL) return { multiplier: 1.0, daysUntilExam: null };

    if (sessionMode === 'triage') {
        const days = Math.floor((new Date(examDate).getTime() - Date.now()) / 86_400_000);
        return { multiplier: 2.5, daysUntilExam: days };
    }
    if (sessionMode === 'mixed') {
        return { multiplier: 1.0, daysUntilExam: null };
    }

    const daysUntilExam = Math.floor((new Date(examDate).getTime() - Date.now()) / 86_400_000);
    let multiplier = 1.0;
    if (daysUntilExam < 7)        multiplier = 2.5;
    else if (daysUntilExam < 30)  multiplier = 2.0;
    else if (daysUntilExam < 90)  multiplier = 1.5;
    else if (daysUntilExam <= 180) multiplier = 1.2;

    return { multiplier, daysUntilExam };
}

interface ThresholdShiftResult {
    shifted: boolean;
    multiplier: number;
    daysUntilExam: number | null;
}

const THRESHOLD_COPY: Record<number, { title: string; body: string }> = {
    2.5: {
        title: 'Final Sprint',
        body: 'Your exam is less than a week away. SEKEL will now prioritize high-yield cards in your sessions \u2014 your full deck is always available to browse.',
    },
    2.0: {
        title: 'Crunch Time',
        body: 'Your exam is less than 30 days away. SEKEL will now prioritize high-yield cards in your sessions \u2014 your full deck is always available to browse.',
    },
    1.5: {
        title: 'Getting Closer',
        body: 'Your exam is less than 90 days away. SEKEL will now prioritize high-yield cards in your sessions \u2014 your full deck is always available to browse.',
    },
    1.2: {
        title: 'Exam Awareness',
        body: 'Your exam is less than 6 months away. SEKEL will now prioritize high-yield cards in your sessions \u2014 your full deck is always available to browse.',
    },
};

function checkThresholdShift(userId: string): ThresholdShiftResult {
    const db = getDb();
    const row = db.prepare(`
        SELECT exam_date, session_mode, last_notified_threshold
        FROM user_exam_profiles
        WHERE user_id = ? AND is_primary = 1
    `).get(userId) as { exam_date: string; session_mode: string; last_notified_threshold: number | null } | undefined;

    if (!row || row.exam_date === EXAM_DATE_SENTINEL) {
        return { shifted: false, multiplier: 1.0, daysUntilExam: null };
    }

    const { multiplier, daysUntilExam } = computeMultiplier(row.exam_date, row.session_mode);
    const result: ThresholdShiftResult = { shifted: false, multiplier, daysUntilExam };

    // First run: seed the threshold without notifying
    if (row.last_notified_threshold === null) {
        db.prepare(
            'UPDATE user_exam_profiles SET last_notified_threshold = ?, updated_at = ? WHERE user_id = ? AND is_primary = 1'
        ).run(multiplier, new Date().toISOString(), userId);
        return result;
    }

    // Threshold crossed upward — fire notification
    if (multiplier > row.last_notified_threshold) {
        const copy = THRESHOLD_COPY[multiplier];
        if (copy) {
            const notification = new Notification({
                title: copy.title,
                body: copy.body,
                silent: false,
            });
            notification.on('click', () => {
                const win = BrowserWindow.getAllWindows()[0];
                if (win) { win.show(); win.focus(); }
            });
            notification.show();
        }

        db.prepare(
            'UPDATE user_exam_profiles SET last_notified_threshold = ?, updated_at = ? WHERE user_id = ? AND is_primary = 1'
        ).run(multiplier, new Date().toISOString(), userId);
        result.shifted = true;
    }

    return result;
}
