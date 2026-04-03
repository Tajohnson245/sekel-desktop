# User Flows
> End-to-end journeys through the Sekel desktop app — from first install to daily study habits and advanced features.

---

## Overview

These flows describe the primary usage patterns in the Sekel desktop app. Each flow maps the user's perspective: what they click, what they see, and what happens. For feature-specific mechanics, see the linked feature docs.

## Architecture

The flows below map to these app routes and components:

```
/              → Dashboard
/plan          → Plan page
/decks         → Deck list
/decks/:id     → Deck detail + card browser
/decks/:id/study → Study session
/documents     → AI card generation (rendered by AppLayout)
/image-occlusion → Image occlusion editor
/drafts        → Drafts tray
/statistics    → Statistics page
/profile       → Settings (5 tabs)
```

## Key Decisions

1. **No mandatory onboarding wizard** — users can start studying without setting up an exam profile. Exam mode is opt-in and unlocks additional features (yield scores, plan page, missed topics) progressively.

2. **Drafts as a natural transition from AI to study** — the Generate → Drafts → Deck promotion flow is intentional. Users review AI output before it enters their library.

3. **Settings are non-blocking** — all preferences (theme, language, FSRS algorithm, daily limits) can be changed at any time from the Profile page without disrupting active study.

---

## Flow 1: New User Onboarding

**Who:** Someone who just downloaded and installed Sekel for the first time.

```
1. Install the app (Windows .exe or macOS .dmg)
2. Launch Sekel → Auth screen appears
3. Click "Sign up" → enter email + password → account created
4. App loads to Dashboard — empty state with "Create your first deck" prompt
5. (Optional) Open Settings → Profile tab → fill in name, school, degree
6. Create a deck: click "New Deck" → enter name → create
   OR import an Anki deck: Settings → Account tab → "Import Anki Deck" → select .apkg
7. (Optional) Set up Exam Mode: Settings → Study tab → "Set Up Exam"
   → select exam (USMLE Step 1) → select deck → set exam date → confirm
   → classification runs in background (cards mapped to blueprint topics)
8. Dashboard now shows due card count, streak, and (if exam set) plan summary
```

**What's unlocked after exam setup:** yield badges in study, missed topics in Statistics, Plan page access, urgency chip.

---

## Flow 2: Daily Study Loop

**Who:** A returning user starting their morning review session.

```
1. Open app → Dashboard shows due card count and current streak
2. Click "Study" button on a specific deck (or the global due count)
   → Study session opens for that deck in due-cards mode
3. Card appears face-down (question side only)
4. Read the question; recall the answer
5. Press Spacebar or click the card to reveal the answer
6. See the answer; rate recall:
   - Again  → complete blank or wrong
   - Hard   → recalled with significant difficulty
   - Good   → recalled correctly with normal effort
   - Easy   → recalled instantly, felt obvious
7. Next card appears automatically
8. Repeat until queue is empty
9. Session complete modal appears:
   - Cards reviewed count
   - Ratings breakdown (Again / Hard / Good / Easy)
   - Session retention rate
   - Total time spent
10. If 2+ consecutive study days: streak notification fires
11. Return to Dashboard — due count has reset for the day
```

**Related:** [study-session.md](study-session.md)

---

## Flow 3: AI Card Generation from a Document

**Who:** A user who wants to convert a textbook chapter or lecture slide into flashcards.

```
1. Navigate to "Generate" in the sidebar (or click the FileText icon)
2. Upload step:
   - Drag-and-drop or browse for a PDF, DOCX, PPTX, XLSX/CSV, TXT, Markdown, or image file
   OR paste a YouTube URL (2-hour max duration, 50K character transcript cap)
3. App parses the document / fetches YouTube transcript
4. A document summary appears: 2–3 sentence overview, key topics, estimated card count
5. Review the summary; adjust settings if desired:
   - Target card count
   - Card format (Basic / Cloze / Reversed)
   - Difficulty (Essential / Detailed)
   - Language (defaults to app language)
   - Optional: free-text instructions for the AI
6. Click "Generate" → 4-stage pipeline runs:
   Stage 1: Document chunked into 100–400 word sections
   Stage 2: Cards generated per chunk
   Stage 3: LLM-as-judge evaluates each card (atomicity, testability, clarity)
   Stage 4: Backfill if evaluation dropped cards below target count
7. Generated cards appear in the Drafts tray (up to 5 at a time)
8. Navigate to Drafts page
9. For each draft card:
   - Review front and back
   - Select a target deck from the dropdown
   - Click "Promote" → card moves to the selected deck
   OR click delete to discard
10. Promoted cards are live in the deck, immediately due for study
```

**Related:** [drafts.md](drafts.md)

---

## Flow 4: Exam Setup and Yield-Aware Study

**Who:** A medical student who wants to align their studying with the USMLE Step 1 blueprint.

```
1. Open Settings → Study tab
2. Under "Exam Configuration", click "Set Up Exam"
3. Exam Onboarding modal appears (3 steps):
   Step 1: Select exam (e.g. "USMLE Step 1")
   Step 2: Select which deck to link to this exam
   Step 3: (Optional) Set exam date with the date picker
4. Click Confirm → modal closes
5. Background classification begins:
   - GPT-4 Mini maps every card in the linked deck to a blueprint system + topic
   - Confidence scores assigned; cards below 50% confidence → "Unclassified"
6. Return to a study session on that deck:
   - Each card now shows a Yield badge (Low / Med / High / Exam-Critical)
   - An Urgency chip shows the current T-minus tier (e.g. "T-90")
7. As exam date approaches, urgency tier upgrades automatically:
   - A Threshold Shift notification fires once per tier crossing
   - Session mode can be changed to Triage (highest urgency cards first)
8. Statistics → Cards tab now shows Missed Topics Breakdown:
   - Bar chart of exam blueprint systems ranked by missed card count
   - Helps identify weak areas to focus on
```

**Related:** [exam-onboarding.md](exam-onboarding.md), [yield-system.md](yield-system.md), [notifications.md](notifications.md)

---

## Flow 5: Image Occlusion Card Creation

**Who:** A user memorizing an anatomy diagram, lab value table, or any visual content.

```
1. Navigate to "Image Occlusion" in the sidebar
2. Click "Upload Image" → select a photo, screenshot, or diagram
3. Image appears on canvas with shape tools in the toolbar
4. Select a shape tool: Rectangle, Ellipse, or Polygon
5. Draw shapes over areas to memorize:
   - Rectangle: drag to cover a rectangular area
   - Ellipse: drag to draw a circle or oval
   - Polygon: click to place vertices for irregular shapes
6. Repeat for all areas that should become separate cards
7. (Optional) Group shapes:
   - Select multiple shapes (Shift+click or drag-select)
   - Click "Group" → the group becomes a single card unit
   - Grouped shapes are revealed together when studying that card
8. (Optional) Add a hint or context note in the fields panel
9. Select the target deck from the dropdown
10. Click "Create Cards" → one card created per shape unit (ungrouped shapes) or group
11. Cards are immediately available in the selected deck
```

**During study:** The card shows the full image with the target area masked in a contrasting color. The user recalls what's underneath, then flips to reveal the unmasked image.

**Related:** [image-occlusion.md](image-occlusion.md)

---

## Flow 6: Study Plan Creation

**Who:** A user with an exam profile and date set, who wants a structured daily study schedule.

```
1. Prerequisite: exam profile with a date must be set (Flow 4 above)
2. Navigate to "Plan" in the sidebar
3. If no active plan exists: creation panel shown
4. Configure the plan:
   - Name (auto-populated with today's date)
   - Scope: all decks, or select specific decks
5. Preview appears immediately:
   - Daily card target (calculated: unseen cards ÷ days remaining, with ramp-up)
   - Estimated minutes per day
   - Projected coverage percentage
6. Click "Create" → plan activates
7. Dashboard now shows today's target (e.g. "Study 28 cards today")
8. Plan page shows:
   - Active plan name and timeline (start date → exam date)
   - Today's target with progress bar
   - System Coverage Table:
     Column 1: Blueprint organ system (e.g. Cardiovascular)
     Column 2: Official exam weight (%)
     Column 3: Cards in plan / total for system
     Column 4: Coverage bar
     Column 5: Performance need (High / Med / Low)
9. (Optional) Override today's target: click the override field, enter a number → applies for today only
10. Target resets automatically the next day
```

**Related:** [plan-page.md](plan-page.md), [exam-onboarding.md](exam-onboarding.md)

---

## Flow 7: Anki Import

**Who:** A user migrating from Anki or importing a community .apkg deck.

```
1. Entry point A: Deck list → "Import Anki Deck" button
   Entry point B: Settings → Account tab → "Import Anki Deck" button
2. Native file dialog opens → select a .apkg file
3. Import preview modal appears:
   - Deck tree showing all decks and sub-decks in the file
   - Card count, note count, media file count
4. Configure import options per deck:
   - Conflict handling: Skip / Overwrite / Merge (for existing Anki deck IDs)
   - Scheduling strategy: preserve Anki scheduling, reset to new, or use FSRS defaults
   - Algorithm: FSRS or SM-2 for imported cards
5. Click "Import" → 6-phase pipeline runs:
   Phase 1: Archive validation (2GB size limit)
   Phase 2: Format detection (anki21 or anki2)
   Phase 3: Database validation (required tables check)
   Phase 4: Conflict detection (existing Anki IDs)
   Phase 5: Media extraction (files to {userData}/media/, SHA1 dedup)
   Phase 6: Data insertion in a single SQLite transaction (rolls back on error)
6. Progress bar with phase labels updates in real time
7. Import complete → success modal shows deck/card/media counts imported
8. Imported decks appear in the Deck list, ready to study
9. Media in card content is served via sekel-media:// protocol (no broken images)
```

**Related:** [anki-import.md](anki-import.md), [import-security.md](import-security.md)

## Known Limitations / Future Work

- No guest mode — an account is required to use the app
- YouTube import requires a public video with captions/transcript available
- Image Occlusion does not support audio-based cards
