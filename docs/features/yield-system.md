# Yield Scoring & Classification System
> GPT-powered card classification, exam blueprint taxonomy, yield scoring, session prioritization, and time-pressure multipliers.

---

## Overview

The yield system classifies flashcards against a structured exam blueprint (e.g. USMLE Step 1) and computes a **yield score** for each card. High-yield cards cover heavily weighted exam topics; low-yield cards cover peripheral content. During study sessions, yield scores are combined with a time-pressure multiplier (based on days until the exam) to prioritize cards that matter most.

The system has four layers:

1. **Blueprint taxonomy** — exam structure (systems, topics, weights) seeded into SQLite
2. **Card classification** — GPT-4.1 Mini maps each card to one or more blueprint topics
3. **Yield scoring** — weighted formula produces a 0–100 score per card
4. **Session queue builder** — ranks due cards by yield score * time multiplier

---

## Architecture

```
ExamOnboardingModal (renderer)
  ↓ user selects exam + deck + date
  ↓ exam:upsert-profile IPC → saves user_exam_profiles row
  ↓ fetchAllCardsForDeck(deckId) → card IDs
  ↓ yield:classify-batch IPC (fire-and-forget)
Main: classify.ts
  → classifyCardsBatch() — loops cards, calls GPT for each
  → upsertClassification() — writes card_classifications rows
  → 200ms delay between cards to avoid rate limits

StudySession (renderer)
  → useYieldScores(examKey, cardIds) → yield:get-scores IPC
  → YieldBadge component — shows level + score, click for explanation
  → UrgencyChip component — shows T-minus tier + next shift countdown
  → notify:threshold-shift IPC — fires Electron Notification on tier change
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/ipc/classify.ts` | Classification, yield scoring, session queue — all IPC handlers |
| `src/ipc/notifications.ts` | Threshold shift notification handler |
| `src/main/db/blueprints.ts` | Embedded USMLE Step 1 blueprint data |
| `src/main/db/index.ts` | Auto-seeds blueprint on first run via `seedBlueprints()` |
| `src/hooks/useYield.ts` | TanStack Query hooks: `useYieldScores`, `useYieldExplanation` |
| `src/components/Study/YieldBadge.tsx` | Pill badge showing yield level per card |
| `src/components/Study/YieldBadge.css` | Badge styling — color-coded by level |
| `src/components/Study/UrgencyChip.tsx` | Session header chip — T-minus indicator |
| `src/components/Study/UrgencyChip.css` | Chip styling — MetaChip pattern |
| `src/components/Study/StudySession.tsx` | Integration point — wires badge, chip, and notification |
| `src/components/ExamOnboarding/ExamOnboardingModal.tsx` | 3-step onboarding: exam → deck → date |

---

## Blueprint Taxonomy

### Database Schema

```
blueprint_exams
  id, exam_key, label, source_url, version, updated_at

blueprint_systems
  id, exam_id (FK), system_key, label, weight_min, weight_max
  UNIQUE(exam_id, system_key)

blueprint_topics
  id, system_id (FK), topic_key, label, physician_task, relative_weight
  UNIQUE(system_id, topic_key)
```

### Auto-Seeding

On first run, `initDatabase()` calls `seedBlueprints()` which checks if `blueprint_exams` is empty. If so, it inserts the USMLE Step 1 blueprint from the embedded `STEP1_BLUEPRINT` constant in `blueprints.ts`. This includes 12 organ systems and ~70 topics.

The data can also be seeded manually via `npx tsx scripts/seed-blueprint.ts`.

---

## Card Classification

### GPT Call

Each card is classified by sending its front/back content plus the full blueprint taxonomy to GPT-4.1 Mini. The model returns one of two response shapes:

**Single-system card:**
```json
{ "exam_key": "step1", "system_key": "cardiovascular", "topic_key": "cardiac-pharmacology", "confidence": 0.92, "reasoning": "..." }
```

**Multi-system card:**
```json
{ "exam_key": "step1", "multi_system": true, "classifications": [
    { "system_key": "cardiovascular", "topic_key": "cardiac-pharmacology", "confidence": 0.85, "split_weight": 0.6, "reasoning": "..." },
    { "system_key": "renal-urinary", "topic_key": "renal-pharmacology", "confidence": 0.75, "split_weight": 0.4, "reasoning": "..." }
]}
```

### Database Schema

```
card_classifications
  card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version
  UNIQUE(card_id, exam_id, system_id)
```

Multi-system cards get multiple rows (one per system). `split_weight` values sum to 1.0.

### Batch Classification

`classifyCardsBatch(cardIds, examKey, force?)`:
- Skips cards already classified (unless `force = true`)
- Processes sequentially with 200ms delay between calls
- Returns `{ classified, skipped, errors }`

---

## Yield Score Formula

```
yield_score = SUM(
    ((weight_min + weight_max) / 2)   -- system midpoint weight (e.g. 7.5%)
    * relative_weight                  -- topic weight within system (e.g. 0.20)
    * confidence                       -- GPT confidence (0.0–1.0)
    * split_weight                     -- for multi-system cards (sums to 1.0)
    * 100                              -- scale to 0–100
)
```

### Yield Levels

| Level | Score Range | Badge Color |
|-------|-----------|-------------|
| High | >= 70 | TEAL |
| Medium | >= 40 | AMBER |
| Low | < 40 | MIST |
| Unclassified | null or confidence < 0.5 | SLATE (60% opacity) |

---

## Time-Pressure Multiplier

A step function based on days until exam:

| Days Until Exam | Multiplier | Mode Label |
|----------------|------------|------------|
| > 180 | 1.0x | Standard |
| <= 180 | 1.2x | Active |
| < 90 | 1.5x | Focused |
| < 30 | 2.0x | Intensive |
| < 7 | 2.5x | Final Sprint |

**Session mode overrides:**
- `triage` → always 2.5x (Final Sprint)
- `mixed` → always 1.0x (Standard)
- `auto` → uses the step function above

### Threshold Shift Notifications

When the user's time multiplier crosses a threshold boundary (e.g. from 1.5x to 2.0x), an Electron Notification fires once. The `last_notified_threshold` column in `user_exam_profiles` prevents repeat notifications.

On first session after profile creation, the threshold is seeded silently (no notification).

---

## Session Queue Builder

`buildSessionQueue(userId, examKey, limit?)`:

1. Fetches due/learning/new cards for the user
2. LEFT JOINs yield scores from `card_classifications`
3. Computes `prioritization_score = yield_score * time_multiplier`
4. Orders: classified cards first (by yield score DESC), then unclassified
5. Returns `SessionQueueCard[]` with yield metadata attached

---

## IPC Channels

| Channel | Handler | Purpose |
|---------|---------|---------|
| `yield:classify-card` | `classifyCard()` | Classify a single card |
| `yield:classify-batch` | `classifyCardsBatch()` | Classify multiple cards (fire-and-forget) |
| `yield:get-scores` | `getYieldScores()` | Batch fetch yield scores for card IDs |
| `yield:get-explanation` | `getYieldExplanation()` | Human-readable explanation for one card |
| `yield:build-session-queue` | `buildSessionQueue()` | Prioritized study queue |
| `notify:threshold-shift` | `checkThresholdShift()` | Check + fire threshold notification |

---

## UI Components

### YieldBadge

Pill-shaped badge rendered above the card during study sessions.

- Color dot + label text (e.g. "High (85)")
- Click toggles a tooltip with the yield explanation (lazy-loaded via `useYieldExplanation`)
- `e.stopPropagation()` prevents card flip when clicking the badge
- Placed inside `.study-content`, above `<CardViewer>`

### UrgencyChip

T-minus indicator in the study session header.

- Renders nothing if exam date is not set (sentinel `9999-12-31`)
- Shows emoji + mode label + days until next threshold shift
- At max urgency (< 7 days): shows "Max urgency" instead of countdown
- Placed between `<StudyTimer>` and `.progress-text`
