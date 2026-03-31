# Exam Onboarding & User Flows
> How users set up an exam profile, classify cards, and interact with yield data during study sessions.

---

## Overview

Exam onboarding connects a user to an exam blueprint (e.g. USMLE Step 1), selects a deck for classification, and optionally sets an exam date. Once configured, study sessions show yield badges on cards and urgency indicators in the header.

---

## Onboarding Modal

`ExamOnboardingModal.tsx` — a 3-step modal triggered from:
- **Settings → Study tab** → "Set Up Exam" / "Change Exam" button
- First-time setup or exam switching both use the same modal

> **Note:** The modal only captures exam selection, deck selection, and exam date. **Session mode (Auto / Mixed / Triage)** is a separate setting configured directly in the Study tab, not inside the modal. Users can change session mode at any time without re-running onboarding.

### Step 1: Select Exam

- Lists available exams from `blueprint_exams` table via `exam:list-exams` IPC
- User picks one (e.g. "USMLE Step 1")
- Blueprint data is auto-seeded on first app launch — no manual setup needed

### Step 2: Select Deck

- Lists the user's decks via `useDecks()` hook
- User picks which deck to classify against the exam blueprint
- Only cards in the selected deck are sent to the classifier

### Step 3: Pick Date (optional)

- Date picker with minimum = today
- "Skip for now" button saves the profile with no date (sentinel `9999-12-31`)
- User can set/change the date later in Settings → Study tab

### On Submit

1. Upserts `user_exam_profiles` row with exam ID, date, and `is_primary = 1`
2. Fetches all card IDs from the selected deck via `fetchAllCardsForDeck(deckId)`
3. Fires `yield:classify-batch` IPC (fire-and-forget) — classification runs in background
4. Shows success toast: "Exam profile created! SEKEL is scoring your cards in the background."

---

## User Flow: Existing Deck (e.g. Anki import)

```
Settings → "Set Up Exam"
  → Step 1: Select "USMLE Step 1"
  → Step 2: Select "Zanki Cardiology" deck
  → Step 3: Set exam date to June 15
  → Confirm
  → Background: ~300 cards classified via GPT (takes a few minutes)
  → Study session: cards show yield badges, header shows urgency chip
```

This is the primary use case — user has an imported Anki deck and wants yield-aware study sessions.

---

## User Flow: New User (no decks yet)

```
Settings → "Set Up Exam"
  → Step 1: Select "USMLE Step 1"
  → Step 2: Empty deck list — nothing to select
  → User is blocked (cannot proceed without selecting a deck)
```

**Current limitation:** The deck selection step requires at least one deck to exist. A new user with no decks cannot complete onboarding. They must first create or import a deck, then return to set up the exam.

**Possible future improvement:** Add a "Skip" option on the deck step so the profile can be created without classification. Cards would be classified later when the user creates/imports a deck.

---

## User Flow: Changing Exams

The same modal is used for changing exams. When the user clicks "Change Exam" in Settings:

1. The modal opens at Step 1
2. User selects a different exam
3. User selects a deck to re-classify
4. Existing classifications for the old exam remain in the database but are not queried
5. New classifications are written for the new exam

---

## Study Session Integration

Once an exam profile exists, study sessions automatically show yield data:

### YieldBadge (per card)

- Appears above the card viewer
- Color-coded pill: TEAL (high), AMBER (medium), MIST (low), SLATE (unclassified)
- Click to see explanation (lazy-loaded from `yield:get-explanation`)
- Only shows if the user has an exam profile and cards are classified

### UrgencyChip (session header)

- Shows between the timer and progress counter
- Displays urgency tier + days until next threshold shift
- Only appears if the user has set an exam date (not the sentinel)
- Session mode overrides: `triage` → always Final Sprint, `mixed` → always Standard

### Threshold Shift Notification

- Fires once per threshold crossing when a study session starts
- Electron native notification with title/body per tier
- Tracked via `last_notified_threshold` column — prevents repeats
- First session after profile creation seeds the threshold silently

---

## Data Flow Diagram

```
ExamOnboardingModal
  │
  ├─ exam:list-exams IPC ────────→ blueprint_exams table
  ├─ useDecks() ─────────────────→ decks table
  ├─ exam:upsert-profile IPC ───→ user_exam_profiles table
  └─ yield:classify-batch IPC ──→ GPT-4.1 Mini → card_classifications table
                                      │
StudySession                          │
  ├─ useExamProfile() ──────────→ user_exam_profiles table
  ├─ useYieldScores() ──────────→ card_classifications + blueprint tables
  │   └─ YieldBadge component        │
  ├─ UrgencyChip ───────────────→ pure computation from exam_date + session_mode
  └─ notify:threshold-shift ────→ user_exam_profiles.last_notified_threshold
```

---

## Settings Panel

The Study tab in Settings (`StudyTab.tsx`) shows:

| Field | Description |
|-------|-------------|
| Exam | Currently active exam (e.g. "USMLE Step 1") |
| Exam Date | Date picker, or "Not set" |
| Session Mode | Auto / Mixed / Triage |
| Change Exam | Opens the onboarding modal |
| Set Up Exam | Shows if no profile exists |

Date and session mode changes are saved via `exam:update-profile` IPC without re-triggering classification.

---

## Database Tables

### user_exam_profiles

| Column | Type | Notes |
|--------|------|-------|
| user_id | TEXT | FK to users |
| exam_id | INTEGER | FK to blueprint_exams |
| exam_date | TEXT | ISO date or `9999-12-31` sentinel |
| is_primary | INTEGER | 1 for active profile |
| session_mode | TEXT | `auto`, `mixed`, or `triage` |
| last_notified_threshold | REAL | Last multiplier tier notified (nullable) |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### card_classifications

| Column | Type | Notes |
|--------|------|-------|
| card_id | TEXT | FK to cards |
| exam_id | INTEGER | FK to blueprint_exams |
| system_id | INTEGER | FK to blueprint_systems (nullable for "other") |
| topic_id | INTEGER | FK to blueprint_topics (nullable) |
| confidence | REAL | 0.0–1.0 from GPT |
| split_weight | REAL | 1.0 for single-system, sums to 1.0 for multi |
| classified_at | TEXT | ISO timestamp |
| model_version | TEXT | e.g. "gpt-4.1-mini" |
