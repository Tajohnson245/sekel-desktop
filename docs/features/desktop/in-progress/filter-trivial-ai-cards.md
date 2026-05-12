# Filter Trivial Ai Cards
> Auto-created by post-task hook. Update with intent and description.

---

**Status:** `In Progress`
**Target Version:** `desktop/vX.X.X` | TBD
**Branch:** `SEKEL-130-filter-trivial-ai-cards`
**Created:** 2026-05-12
**Last Updated:** 2026-05-12
**Shipped:** —

---

## Overview

Two related changes to the AI card generation pipeline. First, a content filter: large uploads (comprehensive study guides, PDF books) were producing cards on exam-administration trivia ("What does NAPLEX stand for?", "How long is the exam?") instead of the clinical content users need. A shared META_EXCLUSIONS list is now applied at three pipeline stages (chunker, generator, evaluator) so trivial cards are rejected at the earliest stage and any survivors get filtered at the evaluator gate. Second, an architectural refactor: cards now persist their source format (basic, cloze, reversed, true-false, compare-contrast, multiple-choice) so renderers branch on `[data-card-format="..."]` instead of fishing for HTML shape patterns. This obsoletes a class of fragile CSS selectors and gives every new format a clean extension point.

## Architecture

```
packages/db/src/types.ts                       — canonical CardFormat type
packages/db/src/queries/cards.ts               — JoinedNote carries format
apps/desktop/supabase/migrations/
  20260512120000_add_notes_format.sql          — nullable text + CHECK constraint
apps/desktop/src/main/db/migrations.ts         — local SQLite mirror
apps/desktop/src/main/db/service.ts            — createNote INSERTs format,
                                                 CARD_WITH_NOTE_SQL projects it
apps/desktop/src/ipc/ai.ts                     — META_EXCLUSIONS shared block,
                                                 generator stamps format per card
apps/desktop/src/ipc/validation.ts             — IPC createNote rule + CARD_FORMATS
apps/desktop/src/components/AIStudy/
  AICardGenerator.{tsx,css}                    — preview: data-card-format
                                                 attribute + CSS rules
apps/desktop/src/components/Card/
  CardList.{tsx,css}                           — deck detail page renderer
  CardViewer.{tsx,css}                         — study mode renderer
apps/desktop/src/components/Study/
  StudySession.tsx                             — passes note.format → CardViewer
```

Data flow: generator emits `{front, back, format}` → AICardGenerator threads `card.format` into `createNote.mutateAsync` → `service.createNote` persists it → on read, `buildCardWithNote` exposes it via `note.format` → renderers set `data-card-format={note.format ?? undefined}` on the content wrapper → CSS keys off `[data-card-format="..."]`.

## Key Decisions

1. **Format lives on `notes`, not `cards`** — a note is the generation source; cards are (note, template) pairs. Format is a property of the content, so the note row is the natural place. Per-card overrides aren't needed today.

2. **Nullable column, no backfill** — pre-existing rows and imported Anki notes keep `format = NULL`. Renderers fall back to the shape-sniffing CSS for those, so nothing regresses without a migration sweep.

3. **Attribute selectors primary, shape-sniffing fallback** — CSS rules combine `[data-card-format="X"]` (for new/AI-generated content) with `:not([data-card-format])`-scoped shape selectors (for legacy/imported content). One rule covers both worlds during the long tail of imported-content migrations.

4. **Two-pronged trivia filter** — prompt-level guidance can be ignored by the model. Adding META_EXCLUSIONS at chunker (skip front-matter sections), generator (refuse meta cards), and evaluator (reject as non-trivial) means a card has to pass three filters to survive. The evaluator pass is the strictest because it sees the final card, not just the source.

5. **Bundle scope onto SEKEL-130** — kink-fix CSS commits, the format-tagging refactor, and the trivia filter all touch the same AI card surface and were validated in one testing pass. Splitting them into separate PRs would have made review harder, not easier.

## Known Limitations / Future Work

- **Pre-existing rows are not backfilled.** Inferring format from existing HTML would work but the shape-sniffing fallback handles them well enough; no need to spend a migration on it.
- **ImageOcclusionEditor and NoteEditor don't set `format`.** Manual cards and occlusion cards stay `NULL` — correct today, but if we ever want format-specific rendering for those, we'd extend the enum and thread it through both editors.
- **Server vs client release timing.** Migration is additive (nullable column, broader CHECK), so old clients keep working after the prod schema lands. New clients writing to old prod would also work — they'd just not get the new column. Safe either ordering.
- **No format selector in UI.** Format is determined by the AI pipeline; users can't manually tag a card's format. Not needed today.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-05-12 | Doc created. apps/desktop/src/ipc/ai.ts |
| 2026-05-12 | apps/desktop/src/components/AIStudy/AICardGenerator.css |
| 2026-05-12 | apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/Card/CardViewer.css |
| 2026-05-12 | apps/desktop/src/components/Card/CardList.css |
| 2026-05-12 | apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/Card/CardList.css,apps/desktop/src/components/Card/CardViewer.css |
| 2026-05-12 | apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/Card/CardList.css,apps/desktop/src/components/Card/CardViewer.css |
| 2026-05-12 | Task completed |
| 2026-05-12 | apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/AIStudy/AICardGenerator.tsx,apps/desktop/src/components/Card/CardList.css,apps/desktop/src/components/Card/CardList.tsx,apps/desktop/src/components/Card/CardViewer.css,apps/desktop/src/components/Card/CardViewer.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/ipc/ai.ts |
| 2026-05-12 | apps/desktop/src/components/Card/CardViewer.css |
