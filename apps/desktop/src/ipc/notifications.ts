/**
 * Desktop Notifications — IPC handlers + scheduler
 *
 * Two notification types:
 *   1. Cards Due Reminder — fires at user-configured times, checks due card count
 *   2. Study Streak — triggered from renderer after a study session completes
 */

import { ipcMain, Notification, BrowserWindow } from 'electron';
import { fetchAllDueCardsCount, fetchUserReviewHistory } from '../main/db/service';
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
}
