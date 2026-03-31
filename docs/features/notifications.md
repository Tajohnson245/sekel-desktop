# Notifications
> Desktop notification system with three types: cards due reminders, study streak rewards, and exam urgency tier shift alerts.

---

## Overview

Sekel sends native desktop notifications to help users maintain study habits and stay aware of their exam timeline. There are three distinct notification types, each with a different trigger, payload, and purpose. All use the Electron `Notification` API (Windows toast, macOS notification center). Clicking any notification brings the app window to focus.

## Architecture

```
apps/desktop/src/ipc/notifications.ts
  ├── setupNotificationHandlers()      — registers all three IPC handlers
  ├── startScheduler() / stopScheduler() — 30-second interval for reminder check
  ├── calculateStreak()                — counts consecutive study days from review history
  └── checkThresholdShift()           — queries user_exam_profiles, computes multiplier

IPC channels:
  notify:configure    — updates scheduler config (userId, enabled, reminderTimes[])
  notify:streak       — called from renderer after session completes
  notify:threshold-shift — called from renderer at session start
```

The scheduler state (userId, enabled, reminderTimes, lastFiredMinute) is in-memory in the main process. `notify:configure` is called every time the user saves notification settings.

## Notification 1: Cards Due Reminder

**Trigger:** Scheduler checks every 30 seconds. When the current HH:MM matches any user-configured reminder time AND due cards exist, the notification fires.

**Title:** "Cards Due"

**Body:** `"You have N card(s) waiting for review."`

**Behavior:**
- Only fires once per minute (`lastFiredMinute` guard prevents double-firing)
- Silent if `dueCount === 0` — no notification for zero due cards
- Clicking the notification shows and focuses the app window

**Configuration:** Settings → Study tab → Notifications section. User adds one or more times in HH:MM format (24-hour). The entire notification system can be toggled on/off with a single switch.

---

## Notification 2: Study Streak

**Trigger:** Renderer calls `notify:streak` after every study session completes. The main process checks the streak length.

**Threshold:** Only fires when `streak >= 2` (two or more consecutive study days).

**Title:** "Study Streak!"

**Body:**
- 2-day streak: `"You're on a 2-day streak. Keep it up!"`
- 3+ day streak: `"${streak}-day study streak! You're on fire."`

**Streak calculation:** Walks backwards from today through up to 365 days of review history. A day counts if at least one review was recorded. Today is always included in the window (users get credit for today's session even if it just completed).

---

## Notification 3: Threshold Shift (Exam Urgency Tier Change)

**Trigger:** Renderer calls `notify:threshold-shift` at the **start** of every study session. The main process checks whether the current time-pressure multiplier has crossed into a new tier since the last time it fired.

**Fires:** Once per tier crossing, upward only. If the user crosses from 1.2× to 1.5×, the notification fires. If they stay at 1.5× for two weeks, it does not fire again. The last-fired multiplier is persisted in `user_exam_profiles.last_notified_threshold`.

**First run behavior:** If `last_notified_threshold` is null (user just set up an exam profile), the current multiplier is seeded without firing a notification. This prevents a notification on the very first session after setup.

**Tier thresholds and copy:**

| Multiplier | Days until exam | Title | Body |
|-----------|----------------|-------|------|
| 1.2× | ≤ 180 days | "Exam Awareness" | "Your exam is less than 6 months away. SEKEL will now prioritize high-yield cards in your sessions — your full deck is always available to browse." |
| 1.5× | < 90 days | "Getting Closer" | "Your exam is less than 90 days away..." |
| 2.0× | < 30 days | "Crunch Time" | "Your exam is less than 30 days away..." |
| 2.5× | < 7 days | "Final Sprint" | "Your exam is less than a week away..." |

**Session mode overrides:**
- `triage` mode: multiplier is fixed at 2.5× regardless of days remaining
- `mixed` mode: multiplier is fixed at 1.0× (no urgency weighting)
- `auto` mode: multiplier scales with the tier table above

**Platform requirement:** Notifications only appear when the app is running. There is no background daemon or OS-scheduled notification system.

## Key Decisions

1. **30-second poll interval** — checking every 30 seconds is negligible CPU cost and reliably catches any user-configured minute. A 60-second interval would risk missing the minute if the app was busy.

2. **Threshold seeded on first run** — without this, a user who already has an exam set 3 months away would receive a "Getting Closer" notification on their very first session. Seeding on first run gives a clean starting point.

3. **Streak notification at session end, not session start** — the user just completed a study session, so this is the optimal moment to reinforce the habit. A start-of-session notification would arrive before the habit is complete.

## Known Limitations / Future Work

- No notification history — past notifications are not stored or viewable in-app
- No snooze or schedule options
- Notifications do not fire if the app is not open (no background process)
