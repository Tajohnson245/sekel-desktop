# Card Generation Animation
> A looping three-card shuffle shown while AI card generation and refinement run, with the real progress bar underneath.

---

**Status:** `In Progress`
**Target Version:** TBD
**Branch:** `SEKEL-156-card-generation-animation`
**Created:** 2026-11-11
**Last Updated:** 2026-11-11
**Shipped:** —

---

## Overview

AI card generation takes 30–90 seconds. The loading screen used to be a sparkle icon and a thin progress bar, which jumps around between stages. It now shows a stack of three cards. The front card's loading bar fills, the card slides off and tucks in at the back, the next card comes forward and its bar fills, and so on. The loop runs at a fixed pace through every stage (reading the document, generating, refining) and doesn't track real progress. Real progress is still shown as a thin bar with a stage label underneath.

## Where it shows

- **First generation** (the one-shot flow from Documents): a large stack replaces the sparkle icon above "Generating your cards".
- **Regenerating from the settings panel:** a compact stack sits next to the progress bar, in the same spot the bar used to be.

## Timeline

One 6-second cycle per card; the three cards are offset by 2 seconds, so a new card reaches the front every 2 seconds.

| Time in cycle | Card |
|---|---|
| 0.00–1.30s | Front: loading bar fills in two spurts with a short stall |
| 1.30–1.45s | Front: bar full |
| 1.45–2.00s | Slides off to the right, drops behind the stack at the peak, settles at the back |
| 2.00–3.45s | Back (bar resets here, out of sight) |
| 3.45–4.00s | Moves up to the middle |
| 4.00–5.45s | Middle |
| 5.45–6.00s | Moves up to the front |

## Architecture

- `apps/desktop/src/components/AIStudy/GenerationProgress.tsx`:
  - `CardShuffleStack` (`size: 'large' | 'compact'`), decorative and `aria-hidden`.
  - `GenerationProgressBar`: the real bar, driven by `ai-progress` events. Translated stage labels; an indeterminate bar before the first event.
  - `InlineGenerationProgress`: the compact stack and the bar on one row.
  - `progressPercent`.
- `GenerationProgress.css`: all motion, as CSS keyframes. Only `transform`, `opacity` and `z-index` animate, so the loop costs no React re-renders and stays on the compositor. Sizes are CSS variables per variant (`--cs-w`, `--cs-h`, `--cs-peek`, …).
- `AICardGenerator.tsx`: uses the components above. The old inline bar and its hard-coded English labels are gone.
- i18n: `ai.progress_working`, `ai.progress_chunking`, `ai.progress_generating`, `ai.progress_refining` and `ai.progress_done` in all 5 locales.
- Tests: `src/__tests__/GenerationProgress.test.tsx`.

## Key Decisions

1. **Decorative, not tied to progress.** Real progress events are uneven: refinement restarts the bar and backfill rounds jump it around. A fixed-pace loop always looks alive. The honest number stays in the thin bar.
2. **Pure CSS.** Three negative animation delays put the cards in their starting slots. There are no timers and no state, so nothing can drift or leak when generation ends and the component unmounts.
3. **Dimming with an overlay, not opacity.** Back cards fade toward the panel colour through a `::after` overlay, so stacked cards never show through each other.
4. **Reduced motion.** With the OS "reduce motion" setting, the stack is a still frame (front card's bar at 60%) and only the real bar moves.

## Known Limitations / Future Work

- The card editor's single-card "Regenerate with AI" button keeps its own small button spinner.
- The document-analysis step before generation keeps its step list.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-11 | Created; card shuffle loader, translated stage labels |
