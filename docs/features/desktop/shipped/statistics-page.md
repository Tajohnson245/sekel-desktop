# Statistics Page
> Three-tab analytics dashboard showing daily study summary, card health, missed exam topics, and retention trends over time.

---

## Overview

The Statistics page gives users a data-driven view of their study habits and progress. It is organized into three tabs — Overview, Cards, and Reviews — each covering a different time horizon and analytical lens. The Cards tab's missed-topics breakdown is the most exam-specific feature and requires an active exam profile.

## Architecture

```
apps/desktop/src/components/Statistics/
├── StatisticsPage.tsx      — Tab container and date range state
├── tabs/
│   ├── OverviewTab.tsx     — Daily summary, pie chart, retention table, heatmap
│   ├── CardsTab.tsx        — Card counts, missed topics breakdown
│   └── ReviewsTab.tsx      — Miss rate trend chart, heatmap

apps/desktop/src/hooks/
├── useStatistics.ts        — Queries for summary stats, card counts, retention
└── useReviewHistory.ts     — Review heatmap data, miss rate trend data

apps/desktop/src/lib/queries.ts — fetchMissedTopicStats, SystemCoverageRow types
```

## Overview Tab

Shown on page load; gives a snapshot of today and overall card library health.

**Today's Summary card:**
- New cards studied today
- Reviews completed today
- Retention rate for the day (Good + Easy ÷ total)
- Total study time today

**Card Maturity Pie Chart:**
Breakdown of all cards in the library by state:
- New (never reviewed)
- Learning (in short-interval queue)
- Review (stable, scheduled in days or weeks)
- Relearning (lapsed; back in short intervals)

**Retention by Maturity Table:**
Retention rate grouped by state. Helps users see if their Review cards are holding stable or regressing.

**Review Activity Heatmap:**
GitHub-style calendar grid where each cell represents one day, colored by number of cards reviewed. Current streak displayed above the heatmap.

## Cards Tab

Focused on card library health and exam topic coverage.

**Date range selector:** 7 days / 30 days / 90 days / All time

**Card Counts:**
Total card count broken down by state (mirrors the pie chart from Overview for the selected date range context).

**Missed Topics Breakdown:**
Available only when an exam profile is active. Shows which exam blueprint organ systems have the most missed cards (rated "Again") in the selected date range.

- Bar chart ranked by missed card count
- Each row: system name, missed card count, total cards in system
- Helps users identify weak areas and redirect study effort
- Without an exam profile: placeholder message with a link to exam setup

## Reviews Tab

Focused on retention trends over time.

**Date range selector:** 7 days / 30 days / 90 days / All time

**Review Activity Heatmap:**
Same calendar heatmap as Overview, scoped to the selected date range.

**Miss Rate Trend Chart:**
Line chart showing the ratio of "Again" ratings to total ratings per day. A declining trend means retention is improving. A spike indicates a difficult new batch of cards or a review debt being worked through.

## Key Decisions

1. **Missed topics requires exam profile by design** — without blueprint classification, there is no meaningful way to group missed cards by exam system. The placeholder prompts exam setup rather than showing empty data.

2. **Local date components throughout** — all date keys use local time (not UTC). On DST transition days, `toISOString()` returns a UTC date that diverges from the local date, causing duplicate or missing day entries in the heatmap. The heatmap and streak computation use a local date formatter to avoid this.

3. **Streak shown on Overview, not Reviews** — streak is a motivational metric best seen at a glance on the daily summary, not buried in the analytics tab.

## Known Limitations / Future Work

- No deck-level filtering — all statistics aggregate across all decks
- Missed topics breakdown shows raw missed card counts, not percentage-adjusted for blueprint weights
- No export of statistics data
