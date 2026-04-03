# Study Session
> Card review mechanics, the FSRS-5 algorithm, rating system, card states, session modes, and post-session analytics.

---

## Overview

The study session is where users review their flashcards. Each session works through a queue of due cards, one at a time. After revealing the answer, the user rates their recall on a 4-point scale. The app uses that rating to schedule the next review date using the FSRS-5 algorithm, targeting ~90% long-term recall.

Sessions can be started from any deck's detail page or from the Dashboard's global due count. An optional exam profile unlocks session modes, yield badges, and urgency chips that surface the most exam-relevant cards first.

## Architecture

```
apps/desktop/src/components/Study/
├── StudySession.tsx     — Main session controller (state, IPC, session lifecycle)
├── RatingButtons.tsx    — Again / Hard / Good / Easy rating UI
├── StudyTimer.tsx       — Countdown timer with auto-advance support
├── YieldBadge.tsx       — Low / Med / High / Exam-Critical badge
├── UrgencyChip.tsx      — T-minus tier display
├── SessionAnalytics.tsx — Post-session summary modal

apps/desktop/src/lib/
├── fsrs.ts              — FSRS-5 wrapper around ts-fsrs; getSchedulingOptions()
└── types.ts             — Rating, CardUpdate, CardWithNote types

apps/desktop/src/hooks/
├── useDecks.ts          — useDueCards, useAllCardsForStudy, useUpdateCard
├── useSessions.ts       — useCreateSession, useCompleteSession, useInsertReview
└── useYield.ts          — useYieldScores (exam profile required)
```

## Card States

Cards move through four states, each with different scheduling intervals:

| State | Description | Typical interval |
|-------|-------------|-----------------|
| New | Never reviewed before | Minutes (first introduction) |
| Learning | Recently introduced; short intervals | Minutes to hours |
| Review | Stable; scheduled in days or weeks | Days to months |
| Relearning | Previously learned, rated "Again"; back in short intervals | Minutes to days |

State transitions are computed by the FSRS-5 algorithm and stored in the `cards` SQLite table alongside `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, and `lapses`.

## The FSRS-5 Algorithm

FSRS (Free Spaced Repetition Scheduler, version 5) schedules each card based on the user's actual recall history. It estimates memory strength and calculates the optimal next review date.

**Parameters in use:**

| Parameter | Value | Effect |
|-----------|-------|--------|
| Request retention | 0.90 | Schedules cards so you recall them ~90% of the time |
| Max interval | 36,500 days | Upper bound; fully mastered cards are never buried indefinitely |
| Fuzz | enabled | Small random variation prevents all cards clustering on the same day |

**Per-card state tracked:** `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `last_review`, `due` (ISO date string for next review).

SM-2 (the classic Anki algorithm) is also supported and can be selected per deck in Settings → Study.

## Ratings

| Rating | When to use | What happens |
|--------|-------------|-------------|
| **Again** | Complete blank or wrong answer | Card re-enters Learning queue; stability resets; lapse count increments |
| **Hard** | Recalled but with significant difficulty | Shorter interval than Good; difficulty factor increases slightly |
| **Good** | Recalled correctly with normal effort | Standard FSRS interval applied |
| **Easy** | Recalled instantly; felt obvious | Longer interval; difficulty factor decreases |

The four scheduling previews (next intervals for each rating) are computed before the answer is revealed and displayed on the rating buttons.

## Session Modes

Session modes require an exam profile to be set. Without one, all sessions use standard FSRS due-date ordering.

| Mode | Behavior | Time multiplier |
|------|----------|----------------|
| **Auto** | Cards ranked by `yield_score × time_multiplier`; highest priority cards first | Scales with days to exam |
| **Mixed** | Standard due-date order; yield badge and urgency chip shown for context | Scales with days to exam |
| **Triage** | Highest urgency cards shown first; maximum time pressure applied | Fixed 2.5× |

Mode is set in Settings → Study tab and applies to all study sessions.

## Study Timer

Each card has an optional countdown timer:

- **Max seconds**: configurable (default: 60 seconds). Set in Settings → Study.
- **Show timer**: can be hidden via toggle. Timer still runs for duration_ms tracking even when hidden.
- **Auto-advance on timeout**: when enabled, the card is automatically flipped when the timer expires. Disabled by default.

Time spent on each card (`duration_ms`) is recorded in the `reviews` table.

## Yield Badge and Urgency Chip

When an exam profile is active, each card in a session shows:

- **Yield Badge** — exam relevance level: Low (score < 40), Medium (40–69), High (≥70), or Unclassified
- **Urgency Chip** — T-minus tier based on days until exam: T-365+, T-180, T-90, T-30, T-14, T-7

Yield score formula: `system_weight × topic_weight × confidence × split_weight × 100`

See [yield-system.md](yield-system.md) for the full classification system.

## Session Analytics

After every session completes, a summary modal is shown:

- Total cards reviewed
- Ratings breakdown: count and percentage for Again / Hard / Good / Easy
- Session retention rate (Good + Easy ÷ total)
- Total time spent

A study streak notification fires automatically if the user has studied 2+ consecutive days. See [notifications.md](notifications.md).

## Key Decisions

1. **Spacebar and click-anywhere to flip** — both keyboard and click reveal the answer. This accommodates users who study with their hands on the keyboard (common for medical students using a keyboard-centric workflow).

2. **Scheduling previews before rating** — the next intervals (e.g. "Again: 1 min / Good: 4 days / Easy: 2 weeks") are shown on the rating buttons. This gives users meaningful information rather than abstract labels, making rating decisions faster and more accurate.

3. **Session created at start, completed at end** — a `deck_sessions` record is opened when the first card is shown and closed when the session ends. This ensures session analytics are persisted even if the user closes mid-session.

## Known Limitations / Future Work

- No keyboard shortcuts for ratings (1/2/3/4 keys) — only button clicks
- Session mode cannot be changed mid-session
- No undo for a submitted rating
