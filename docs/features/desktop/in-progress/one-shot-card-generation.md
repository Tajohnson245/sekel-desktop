# One-Shot Card Generation

---

**Status:** `Planning`
**Target Version:** `desktop/vX.X.X` | TBD
**Branch:** `SEKEL-134-one-shot-card-generation`
**Created:** 2026-05-26
**Last Updated:** 2026-05-26
**Shipped:** —

---

## Overview

Two changes that compound: streamline the upload-to-cards flow into a single hands-off pipeline, and meaningfully improve card depth + volume so the output is worth the wait.

Today's flow makes the user click through three explicit gates — *upload* → *analyze* → *pick a chapter* → *generate* — and even then a single chapter's per-chunk estimate caps the result at ~10 cards. The reworked flow runs everything automatically the moment a file finishes parsing, generates across the whole document at once, and produces deeper cards by default (less atomic-recall bias, longer answers where warranted, a final refinement pass on every kept card).

## Architecture

```
apps/desktop/src/
  components/AIStudy/
    DocumentsPage.tsx               — rewritten: 3-step state machine → 1-step auto-pipeline
    DocumentsPage.css               — progress stepper + cleaner upload zone
    AICardGenerator.tsx             — default count clamp, slider max 500, collapsible settings panel
    AICardGenerator.css             — settings panel + tighter card grid
  ipc/
    ai.ts                           — basic prompt rewrite, focus criterion, refineCardsBatch,
                                      MAX_BACKFILL_ROUNDS 2→3, refinement wired into the handler
    document_parsing.ts             — estimatedCardCount multiplier ×2 → ×4
  locales/{en,de,es,fr,zh}/
    translation.json                — new keys for the unified progress meter labels
```

**New data flow:**
```
Drop file → parseDocument (per file)
         → after last parse completes, auto-call generateSummary
         → as soon as summary returns, auto-call generateCardsFromContext
            with the union of all content-classified chapter chunks
         → user lands on the cards preview, can edit / regenerate / add-to-deck

Inside generateCardsFromContext:
  ... existing chunk × format fan-out ...
  → backfill (up to 3 rounds, was 2)
  → refineCardsBatch (NEW: per format, batched on gpt-4.1-mini, sharpens kept cards)
  → slice to requested count, ship
```

## Key Decisions

1. **One-shot beats per-chapter as the default.** Per-chapter selection was added for fine-grained control, but in practice it caps users at a single chapter's chunk count (≈ 2 cards/chunk × 3 chunks = 6 cards). Whole-document generation across all content-classified chapters gives both more raw material and a more representative card mix. Per-chapter generation is removed for now; if we want it back it can return as an "advanced" mode without affecting the default.

2. **Auto-run, not auto-prompt.** Settings (formats, difficulty, count, custom instructions) get sensible defaults (all 6 formats checked, `detailed` difficulty, count = `min(estimatedCardCount, 100)`) and the pipeline launches without a confirmation click. A collapsed settings panel above the cards lets users tweak + regenerate after the fact. Trading "tweak-before" for "tweak-after" — first-run friction beats first-run flexibility for this audience.

3. **Estimate multiplier ×2 → ×4.** Each chunk genuinely supports more than 2 cards (definition + mechanism + application + contrast). The new estimate is `min(content_chunks × 4, 500)` and the slider default clamps to `min(estimate, 100)`. Slider max becomes a flat `500`.

4. **Basic prompt: depth over atomicity.** The current basic format prompt enforces "1-10 word answers" and "never start with What is", which biases output toward shallow recall. Rewritten to allow 1-3 sentence answers when warranted, integration of conceptually inseparable facts on one card, and case-based / mechanism / "why" framings. Evaluator's `Atomicity` criterion (non-MC only) is renamed `Focus` and softened so integration cards aren't penalized. MC criteria stay strict (distractors need atomic stems to work).

5. **Refinement pass on every kept card.** After backfill, every kept card runs through `refineCardsBatch` (gpt-4.1-mini, 8 cards per call, per format) that sharpens question/answer while preserving topic + format. Failure-tolerant: on parse or API failure, the original card is preserved unchanged. Costs ~12-15 extra calls on a 100-card batch — acceptable under the chosen "spend more for quality" ceiling.

6. **Eval-failure fallback unchanged for now.** The "treat batch as keep on eval failure" behavior is a known weakness, but flipping it to "reject on failure" would be a behavioral change in error-handling that warrants its own decision. Out of scope for SEKEL-134.

## UI: before vs after

### Before
```
┌─ Upload step ──────────────┐    ┌─ Review step ──────────────┐    ┌─ Generate step ─────┐
│ DocumentUpload zone        │ →  │ Summary banner             │ →  │ AICardGenerator     │
│ File list w/ status        │    │ Chapter grid (pickable)    │    │ Settings sidebar    │
│ [Process content] button   │    │ Filtered-out section list  │    │ Cards preview       │
└────────────────────────────┘    │ [Re-upload] button         │    └─────────────────────┘
                                  └────────────────────────────┘
                                  (user picks ONE chapter)
```

### After
```
┌─ Upload zone ────────────────────────────┐
│ DocumentUpload — primary visual          │
└──────────────────────────────────────────┘
   (files parse in-place, then…)
┌─ Auto-pipeline progress stepper ─────────┐
│ ✓ Parsed 3 files                         │
│ ✓ Analyzed document structure            │
│ ◐ Generating cards… [progress bar]       │
│ · Refining cards…                        │
└──────────────────────────────────────────┘
   (then lands here automatically:)
┌─ Cards ready ────────────────────────────┐
│ ▾ Generation settings (collapsed)        │
│ ┌─ Card preview grid ────────────────┐   │
│ │ ... ... ... ...                    │   │
│ │ ... ... ... ...                    │   │
│ │ [Add all to deck]                  │   │
│ └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

## Known Limitations / Future Work

- **No abort during auto-pipeline.** Once parsing kicks off, the user can't cancel until cards appear. Adding a cancel surface is a follow-up.
- **No per-chapter mode.** Power users who liked picking one chapter at a time lose that control. If feedback comes in, re-introduce as an "Advanced" toggle.
- **Refinement uses the same model as generation.** A cheaper "polish-only" model (e.g. gpt-4o-mini with a tight refinement prompt) could halve the refinement cost. Deferred until we see real cost numbers post-rollout.
- **Eval-failure-as-keep still silent.** Known weakness; needs its own branch.
- **Backfill chunk-prioritization unchanged.** Still longest-first; we don't track which chunks under-produced.
- **i18n keys for the new progress stepper need translations in 5 locales.** Will land in this branch.

## Test plan

- Drop a short text doc (≤ 5 chunks): pipeline auto-completes, count default ≤ 20.
- Drop a 200-page PDF: parsing succeeds, summary auto-runs, generation produces ~100 default (clamped), refinement runs without error.
- Drop a 600-page PDF: rejected at parse with the `pdf_page_limit` error (existing behavior, not changing).
- Drop a YouTube URL: same auto-flow.
- Drop 3 files at once: all parse, summary runs over combined content, generation produces a coherent mix.
- Trigger refinement failure (mock 500): kept cards pass through unchanged.
- Toggle every format off in settings: regenerate is disabled.
- Pick `essential` difficulty: prompt reflects "high-yield only" framing.
- Typecheck + lint clean across all 5 changed packages.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-05-26 | Plan doc created. Branch SEKEL-134-one-shot-card-generation cut from dev. |
| 2026-05-26 | .github/workflows/release.yml,apps/desktop/supabase/functions/feedback-email/index.ts |
