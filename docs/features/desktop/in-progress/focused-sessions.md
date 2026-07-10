# Focused Sessions
> Auto-created by post-task hook. Update with intent and description.

---

**Status:** `In Progress`
**Target Version:** `desktop/vX.X.X` | TBD
**Branch:** `SEKEL-137-focused-sessions`
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Shipped:** —

---

## Overview

Studying used to be locked to a single deck (`/decks/:deckId/study`). This feature adds two
cross-deck modes, launched from a new routed pre-session hub at `/study`:

1. **Review All** — every due card across the (plan-scoped or all) decks, interleaved.
2. **Focused (SEKEL Intelligence)** — due cards across decks in weak blueprint systems
   (accuracy < 80%), widening the previously single-deck focused flow.

The hub adapts to whether cards are classified: Review All always works; Focused unlocks once
Intelligence has weak systems to target.

## Architecture

**Data model (`main/db/migrations.ts`).** One additive migration on `deck_sessions`:
`kind TEXT NOT NULL DEFAULT 'deck'`, `scope TEXT`, `system_keys TEXT`. Deliberately
**ADD COLUMN, never a rebuild** — `reviews.session_id` FKs `deck_sessions` with
`ON DELETE SET NULL`, so dropping the table under the runner's `foreign_keys = ON` transaction
would null `session_id` on every historical review. `deck_id` stays `NOT NULL`; cross-deck
sessions store a *representative* deck while each review carries its own real `deck_id`
(analytics key on `session_id`, never the session's `deck_id`).

**Service (`main/db/service.ts`).** `fetchDueCardsCrossDeck` / `fetchDueCardsFocusedCrossDeck`
delegate to the existing per-deck `fetchDueCards`/`fetchDueCardsFocused`, pool, and interleave
(learning → new → review) — so daily limits stay **per deck** for free. `createStudySession`
writes a typed session row. All wired through the five IPC layers, with hooks in `useDecks.ts` /
`useSessions.ts`. The hub counts each mode's queue with the **same query the session runs** (via
`useDueCardsFocusedCrossDeck` / per-deck stats), so the CTA badge equals exactly what Begin serves.

**Player (`components/Study/`).** The old engine was extracted into a shared **`StudyPlayer`**
driven by a `StudySource` (`studySource.ts`); `StudySession` is now a thin single-deck wrapper
and `CrossDeckStudySession` a cross-deck one. FSRS vs SM-2 is resolved **per card** so a mixed
pool shows the right rating UI.

**UI.** `StudyHub` (`/study`) is the routed summary (per-deck breakdown, scope toggle, weak-system
bars, two Begin CTAs). Dashboard CTAs route to `/study` (`?intent=focused`); `PreSessionBriefing`
was retired. The sidebar gains a single **Study** entry (and its items were regrouped into
primary / Create / More sections).

## Key Decisions

1. **ADD COLUMN, not a `deck_sessions` rebuild** — avoids nulling historical `reviews.session_id`
   via the `ON DELETE SET NULL` FK.
2. **Delegate per-deck, then pool** — reuses audited fetch bodies and gets per-deck daily-limit
   accounting for free, rather than a `deck_id IN (…)` rewrite with a global cap.
3. **Shared `StudyPlayer`, source injected** — wrappers own hooks (kept unconditional); the engine
   is queue-agnostic, with per-card algorithm resolution.
4. **Routed hub, not a modal** — `/study` is a real destination; `Begin` pushes into `/study/session`.
5. **`deck_id` added to `@sekel/db` `JoinedNote`** — the SQLite path always returns it, so per-card
   review attribution typechecks.

## Known Limitations / Future Work

- Estimated time is a flat `~15s/card` heuristic, not a per-user average.
- Cross-deck sessions are local-only (SQLite-first study model); no Supabase sync of session metadata.
- Manual Electron smoke-test (≥2 decks, partially classified, exam profile) still pending.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-07-09 | Doc created. apps/desktop/src/__tests__/db.service.test.ts,apps/desktop/src/components/Dashboard/Dashboard.tsx,apps/desktop/src/components/Dashboard/PreSessionBriefing.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/hooks/useAppNavigation.ts,apps/desktop/src/hooks/useDecks.ts,apps/desktop/src/hooks/useSessions.ts,apps/desktop/src/ipc/database.ts |
| 2026-07-09 | apps/desktop/src/__tests__/db.service.test.ts,apps/desktop/src/components/Dashboard/Dashboard.tsx,apps/desktop/src/components/Dashboard/PreSessionBriefing.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/hooks/useAppNavigation.ts,apps/desktop/src/hooks/useDecks.ts,apps/desktop/src/hooks/useSessions.ts,apps/desktop/src/index.css |
| 2026-07-09 | apps/desktop/src/__tests__/db.service.test.ts,apps/desktop/src/components/Dashboard/Dashboard.tsx,apps/desktop/src/components/Dashboard/PreSessionBriefing.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/hooks/useAppNavigation.ts,apps/desktop/src/hooks/useDecks.ts,apps/desktop/src/hooks/useSessions.ts,apps/desktop/src/index.css |
| 2026-07-09 | apps/desktop/src/__tests__/db.service.test.ts,apps/desktop/src/components/Dashboard/Dashboard.tsx,apps/desktop/src/components/Dashboard/PreSessionBriefing.tsx,apps/desktop/src/components/Study/CrossDeckStudySession.tsx,apps/desktop/src/components/Study/StudyHub.css,apps/desktop/src/components/Study/StudyHub.tsx,apps/desktop/src/components/Study/StudyPlayer.tsx,apps/desktop/src/components/Study/StudySession.tsx |
| 2026-07-09 | apps/desktop/src/components/Study/StudyHub.tsx,apps/desktop/src/main/db/service.ts,apps/desktop/src/types/electron.d.ts |
| 2026-07-09 | apps/desktop/src/components/Study/StudyHub.tsx,apps/desktop/src/main/db/service.ts,apps/desktop/src/types/electron.d.ts |
| 2026-07-09 | apps/desktop/src/components/Study/StudyHub.tsx,apps/desktop/src/main/db/service.ts,apps/desktop/src/types/electron.d.ts |
| 2026-07-09 | Task completed |
| 2026-07-09 | Task completed |
