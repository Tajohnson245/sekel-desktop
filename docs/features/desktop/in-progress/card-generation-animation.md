# Card Generation Animation
> One full-screen loading view, with the stage text on the left and a looping three-card shuffle on the right, from the moment Generate is clicked until the cards are ready.

---

**Status:** `In Progress`
**Target Version:** TBD
**Branch:** `SEKEL-156-card-generation-animation`
**Created:** 2026-11-11
**Last Updated:** 2026-11-11
**Shipped:** —

---

## Overview

AI card generation takes 30–90 seconds. It used to show three different loading views in a row:
1. a step list in a box while the document was analyzed;
2. one frame of the generator's settings screen;
3. a second box with a sparkle icon and a progress bar.

Now it's one screen with no box. "Generating your cards", the description, the current stage ("Analyzing your document…", "Generating cards…", "Refining cards…", "Finishing up…") and Cancel are on the left. A large stack of three cards is on the right. The front card's loading bar fills, the card lifts off and tucks in at the back, the next card comes forward and its bar fills, and so on. The loop runs at a fixed pace through every stage and doesn't track real progress. There is no progress bar; the stage text is the status.

## Where it shows

- **Analyzing the document and the first generation pass** (the one-shot flow from Documents): the full screen. DocumentsPage and AICardGenerator render the same `GenerationScreen` in the same place. The cards follow a shared clock, so the handoff between the two steps doesn't show.
- **Regenerating from the settings panel:** a compact stack with the stage text, in the spot the progress bar used to be. The existing cards stay in view.

## Timeline

One 6-second cycle per card; the three cards are offset by 2 seconds, so a new card reaches the front every 2 seconds.

| Time in cycle | Card |
|---|---|
| 0.00–1.20s | Front: loading bar fills in two spurts with a short stall |
| 1.20–1.30s | Front: bar full |
| 1.30–2.00s | Lifts up and off (to the right on the compact stack), drops behind the others at the peak, settles at the back |
| 2.00–3.30s | Back (bar resets here, out of sight) |
| 3.30–4.00s | Moves up to the middle |
| 4.00–5.30s | Middle |
| 5.30–6.00s | Moves up to the front |

## Architecture

- `apps/desktop/src/components/AIStudy/GenerationProgress.tsx`:
  - `GenerationScreen`: the full loading view (status text, optional note, optional Cancel).
  - `CardShuffleStack` (`size: 'large' | 'compact'`): decorative and `aria-hidden`.
  - `GenerationStatus`: the stage text, `role="status"`.
  - `InlineGenerationProgress`: the compact stack and the stage text on one row.
  - `stageLabelKey`, `shuffleSyncOffset`.
- `GenerationProgress.css`:
  - All motion is CSS keyframes. Only `transform`, `opacity` and `z-index` animate, so the loop costs no React re-renders.
  - Sizes are CSS variables per variant. The large card is `clamp(260px, 30vw, 420px)` wide.
- `DocumentsPage.tsx`:
  - Renders `GenerationScreen` while analyzing (the step list is gone).
  - Passes `onCancel` and `loadingNote` (files that failed to parse) to the generator.
  - Ignores an analysis that finishes after Cancel.
- `AICardGenerator.tsx`:
  - Starts in the generating state when it will auto-start, so the first frame is the loading screen.
  - Cancel discards the in-flight result: no cards and no "cards ready" notification.
- i18n: `ai.progress_chunking`, `ai.progress_generating`, `ai.progress_refining` and `ai.progress_done` in all 5 locales.
- Tests:
  - `src/__tests__/GenerationProgress.test.tsx`.
  - `src/__tests__/AICardGeneratorLoading.test.tsx`: renders the first frame on the server (where no effects run), plus the Cancel cases.

## Key Decisions

1. **Decorative, not tied to progress.** Real progress events are uneven: refinement restarts the count and backfill rounds jump it around. A fixed-pace loop always looks alive, and the stage text says what's happening.
2. **One screen, two owners.** DocumentsPage owns the analysis step and AICardGenerator owns generation. Both render `GenerationScreen` rather than lifting generation state up. `--cs-sync` (a negative delay from `performance.now() % 6000`) pins every stack to one clock, so the remount at the handoff continues the loop instead of restarting it.
3. **Pure CSS.** Negative animation delays put the cards in their starting slots. There are no timers, so nothing can drift or leak when generation ends.
4. **Lift, don't slide, on the full screen.** The stack sits on the right, so a sideways slide would run off the page. The card lifts up and over. `overflow-x: clip` on the screen guarantees the swing never flashes a horizontal scrollbar in the scrolling main area.
5. **Dimming with an overlay, not opacity.** Back cards fade toward the page colour through a `::after` overlay, so stacked cards never show through each other.
6. **Reduced motion.** With the OS "reduce motion" setting, the stack is a still frame (front card's bar at 60%); the stage text still updates.

## Known Limitations / Future Work

- **Cancel during generation** discards the result, but the request keeps running in the main process until it finishes. There is no abort path to the AI proxy yet.
- **The card editor's single-card "Regenerate with AI" button** keeps its own small spinner.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-11 | Created; card shuffle loader, translated stage labels |
| 2026-11-11 | apps/desktop/src/__tests__/GenerationProgress.test.tsx,apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/AIStudy/AICardGenerator.tsx,apps/desktop/src/components/AIStudy/GenerationProgress.css,apps/desktop/src/components/AIStudy/GenerationProgress.tsx,apps/desktop/src/locales/de/translation.json,apps/desktop/src/locales/en/translation.json,apps/desktop/src/locales/es/translation.json |
| 2026-11-11 | apps/desktop/src/__tests__/AICardGeneratorLoading.test.tsx,apps/desktop/src/__tests__/GenerationProgress.test.tsx,apps/desktop/src/components/AIStudy/AICardGenerator.css,apps/desktop/src/components/AIStudy/AICardGenerator.tsx,apps/desktop/src/components/AIStudy/DocumentsPage.css,apps/desktop/src/components/AIStudy/DocumentsPage.tsx,apps/desktop/src/components/AIStudy/GenerationProgress.css,apps/desktop/src/components/AIStudy/GenerationProgress.tsx |
