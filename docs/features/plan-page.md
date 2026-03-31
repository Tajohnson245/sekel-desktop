# Plan Page
> Study plan creation, daily pacing calculation, system coverage table, and plan lifecycle management.

---

## Overview

The Plan page creates a structured study schedule based on the user's exam date, available content, and daily study capacity. It answers "how many cards should I study today?" and "which exam topics am I not covering enough?" An active exam profile with an exam date is required.

## Architecture

```
apps/desktop/src/components/Plan/
├── PlanPage.tsx            — Main page: creation panel + active plan view

apps/desktop/src/hooks/
├── usePlan.ts              — useComputedSuggestion, useActivePlan, usePlans,
│                             useCreatePlan, useArchivePlan, useDeletePlan,
│                             useReactivatePlan, useSetPlanOverride,
│                             useClearPlanOverride, useDeckUnseenCounts,
│                             usePlanProgress, Plan, DeckUnseenCount types

apps/desktop/src/stores/
└── planStore.ts            — Zustand store for plan UI state

apps/desktop/src/ipc/plan.ts — Main-process plan computation handlers
apps/desktop/src/lib/queries.ts — SystemCoverageRow type
```

## Pacing Model

The plan uses a ramp-up multiplier to model how spaced repetition review load grows over time. New cards studied in week 1 generate review load in later weeks, so the early pace is intentionally lighter:

| Week | Multiplier | Rationale |
|------|-----------|-----------|
| 1 | 0.5× | Gentle start; minimal review debt yet |
| 2 | 0.9× | Reviews from week 1 start appearing |
| 3 | 1.2× | Review load accelerating |
| 4+ | 1.5× | Steady state — full review load has built up |

**Daily minutes estimate formula:** `n × 0.75 + (n × cumulative_reviews(week) / 7) × 0.33`
where `n` = new cards per day and `cumulative_reviews` sums the weekly multipliers.

## Creating a Plan

1. Navigate to Plan — creation panel appears if no active plan exists
2. Set a **name** (auto-populated with today's date; editable)
3. Select **deck scope**: all decks, or pick specific decks
4. The preview panel updates immediately showing:
   - Daily card target (unseen cards ÷ days remaining, with ramp-up)
   - Estimated minutes per day at week 1 pace
   - Projected coverage percentage
5. Click **Create** → plan activates

## Active Plan View

Once created, the plan page shows:

**Plan header:**
- Plan name and status (active / archived)
- Creation date and exam date
- Days remaining

**Today's target:**
- Card count for today (respects any override)
- Progress bar (cards studied today vs. target)
- Override field: enter a number to change today's target; resets automatically tomorrow
- "Undo override" button restores the calculated target

**System Coverage Table:**
Each row is one exam blueprint organ system.

| Column | Description |
|--------|-------------|
| System | Organ system name (e.g. Cardiovascular, Renal) |
| Blueprint weight | Official exam percentage for this system |
| Cards in plan | Cards in scope for this system / total cards for this system |
| Coverage bar | Visual proportion of system covered |
| Performance need | High / Med / Low — how urgently this system needs attention |

Performance need is calculated from the gap between blueprint weight and current card coverage rate.

## Plan Lifecycle

| Action | Effect |
|--------|--------|
| Archive | Plan moves to "Archived" list; no longer drives Dashboard target |
| Reactivate | Archived plan becomes active again |
| Delete | Permanently removes the plan (no recovery) |

Only one plan can be active at a time. Activating a new plan does not delete previous archived plans.

## Key Decisions

1. **Ramp-up pacing matches spaced repetition reality** — linear daily targets ignore that FSRS review load compounds over time. The multiplier model produces a schedule the user can actually sustain: week 1 is lighter, then load increases as review debt builds.

2. **System coverage table over a simple progress bar** — knowing "I've covered 60% overall" is less actionable than knowing "Renal is at 30% coverage but has 15% exam weight." The table gives users a directive: study these specific systems more.

3. **Daily override without plan mutation** — users sometimes have lighter or heavier days without wanting to recalculate the entire schedule. The override field lets them adjust a single day; the underlying plan math is preserved and recalculates from the next day.

4. **Exam profile required** — the plan depends on blueprint system weights for the coverage table and on the exam date for timeline calculations. Without a profile, the Plan page shows an empty state with a prompt to set up an exam.

## Known Limitations / Future Work

- Only one plan can be active at a time; multi-deck parallel plans are not supported
- The coverage table shows card counts, not weighted yield scores — a deck full of Low-yield cards could show high coverage but poor exam readiness
- No automatic plan adjustment if the exam date changes; user must create a new plan
