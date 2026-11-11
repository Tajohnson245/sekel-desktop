# Exam-Relevance Classification
> How SEKEL decides whether cards belong to the user's exam before mapping them to blueprint topics, and how to measure classification quality.

---

**Status:** `In Progress`
**Target Version:** TBD
**Branch:** `SEKEL-155-classification-relevance`
**Created:** 2026-11-11
**Last Updated:** 2026-11-11
**Shipped:** —

---

## Overview

Classification maps flashcards to an exam blueprint (systems and topics), which drives the yield chips, deck counts, plans and study queues. The old classifier sent one card at a time with no context and asked only "which topic is this?". On a 100-card "C# Fundamentals" deck it gave 12 cards Step 1 topics with 0.9+ confidence ("garbage collector" → Cell Biology, "memory" → Biochemistry). It also counted the 88 off-blueprint cards as "classified".

The new flow checks the deck first, classifies in batches with the deck name as context, asks "is this exam material?" before any topic, and reports what really happened.

## Flow

```
cards ─► group by deck ─► deck check (1 request, ~25 evenly spread notes)
                               │
          < 30% exam material ─┼─► skip deck → result.skippedDecks ("Classify anyway" overrides)
                               │
          ≥ 30% / small deck ──┴─► classify 10 cards per request (deck name + blueprint)
                                       │
                                       ├─ exam_relevant: false → stored as off-exam row → "not related"
                                       └─ mapped (valid keys only) → replaces old rows → "classified"
```

All four entry points go through `classifyCardsBatch`, so all of them get the deck check:
- manual Classify (Profile → Study)
- after an Anki import
- exam onboarding
- AI card generation

## Architecture

- `apps/desktop/src/main/ai/classification.ts` — pure prompts and answer checking:
  - `buildScreeningMessages` / `buildClassificationMessages`
  - `parseScreeningResponse` / `parseClassificationResponse` (only blueprint keys accepted; same-system entries merged; split weights rescaled to 1; max 3 per card)
  - `cleanCardText` (HTML, cloze, entities) and `pickEvenlySpaced`
- `apps/desktop/src/ipc/classify.ts`:
  - `classifyCardsBatch(cardIds, examKey, force, { skipRelevanceCheck })` → `{ classified, notRelated, skipped, errors, skippedDecks, stoppedEarly }`
  - `clearDeckClassifications` (IPC `yield:clear-deck-classifications`)
  - `getDeckClassificationCount` → `{ classified, notRelated, total }`
- **UI:**
  - `StudyTab` shows the summary, a "Classify anyway" card per skipped deck, and "Clear classifications".
  - `DeckList` shows the not-related count as a tooltip on the Classified column.
- **Tests:**
  - `classification.test.ts` (pure module).
  - `classifyBatch.test.ts` (in-memory SQLite + scripted AI).
  - `classificationEval.live.test.ts` + `fixtures/classificationEval.ts` (live, opt-in).

## Measuring quality

`classificationEval.live.test.ts` runs the real prompts through the `ai-proxy` function against two labelled 30-card decks (C# and Step 1, both full of shared vocabulary). It is skipped unless `SEKEL_AI_EVAL_TOKEN` is set; the file header lists the env vars. `SEKEL_AI_EVAL_BASELINE=1` also runs the old prompt.

Results on dev (2026-11-11, gpt-4.1-mini):

| | Old prompt | New flow |
|---|---|---|
| C# cards given a Step 1 topic | 10 / 30 | 0 / 30 |
| Step 1 cards mapped | 30 / 30 | 30 / 30 |
| Deck check (C# / Step 1 relevant) | — | 0 / 30 · 30 / 30 |
| Requests for 60 cards | 60 | 8 |

Re-run it after any prompt or model change.

## Key Decisions

1. **Screen notes, not cards.** Sampling notes evenly across the deck avoids counting a cloze note's sibling cards several times. Decks under 5 notes skip the check; the per-card verdict still applies.
2. **Skipped decks aren't written to the database.** The check is a sample. Marking every card "not related" from it would hide relevant cards in mixed decks, so skipped cards stay unclassified.
3. **Off-exam cards are stored** as a row with no system and confidence 0. They aren't re-sent on the next run and count as "not related". Yield queries already ignore rows without a system.
4. **"Classified" means it gets a yield level:** a system and confidence ≥ 0.5 (`MIN_YIELD_CONFIDENCE`, shared with `toYieldLevel`). Legacy low-confidence and "other" rows now count as not related.
5. **Every write replaces the card's rows for that exam.** A forced re-run of a deck the check skips clears its old rows, which removes earlier false positives.
6. **Fail safe:** if the deck check errors or returns junk, the deck is classified with the per-card check rather than skipped. Signed-out and daily-limit errors stop the batch (`stoppedEarly`).

## Known Limitations / Future Work

- **Mixed decks** above the 30% threshold are classified card by card; the per-card verdict is the only filter there.
- **Off-exam cards in a relevant deck** are stored as "not related" and skipped on later runs. Use "Re-classify" to re-check them.
- **Subdecks:** the deck check and "Clear" work on a deck's own cards only, matching the Classify picker.
- **Automatic runs** (after an Anki import, during onboarding, after AI card generation) don't show the skipped-deck message.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-11 | Created; deck check, batched classifier, honest counts, clear action, live eval |
