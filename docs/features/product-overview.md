# Sekel — Product Overview
> Complete feature reference for the Sekel desktop app — what it is, who it's for, and everything it does. Start here if you're writing copy or need to understand the product.

---

## Overview

Sekel is a desktop flashcard app built for high-stakes learners — primarily medical students preparing for licensing exams like USMLE Step 1. It combines spaced repetition, AI-powered card generation, and exam blueprint alignment to help users study smarter, not just more.

It runs as a native desktop app on Windows and macOS. All study data is stored locally — no internet connection required to review cards. Supabase is used only for authentication; everything else lives on the user's machine.

## Who It's For

- Medical students preparing for USMLE Step 1 (primary audience)
- Any learner who studies from dense documents and needs to convert material into testable cards quickly
- Users who want Anki's structure with the intelligence of modern AI

## Core Value Propositions

1. **AI turns your notes into flashcards** — upload a PDF, slide deck, or YouTube link and get study-ready cards in seconds
2. **FSRS-5 schedules cards at the perfect time** — review cards only when you're about to forget them, keeping recall at ~90%
3. **Exam blueprint alignment shows what matters** — every card gets a yield score showing how testable and exam-relevant it is for USMLE
4. **Your data stays on your computer** — local-first SQLite, fully offline study, no cloud dependency

## Architecture

```
apps/desktop/     — Electron + Vite + React (Windows, macOS, Linux)
packages/db/      — Supabase client (auth only)
packages/components/ — Shared UI kit
```

## All Features

### Study
- FSRS-5 spaced repetition with 4 ratings (Again / Hard / Good / Easy)
- SM-2 algorithm available as an alternative, toggled per deck
- Session modes: **Auto** (system-ranked by yield), **Mixed** (standard order with yield badge), **Triage** (highest urgency first, 2.5× multiplier)
- Optional timer with configurable max seconds and auto-advance on timeout
- Yield badge on each card showing Low / Med / High / Exam-Critical exam relevance
- Urgency chip showing T-minus tier as exam date approaches (T-365, T-180, T-90, T-30, T-14, T-7)
- Post-session analytics: cards reviewed, ratings distribution, retention rate, time spent

### AI Card Generation
- Upload **PDF, DOCX, PPTX, XLSX/CSV, TXT, Markdown, images**, or paste a **YouTube URL**
- 4-stage pipeline: chunk text → generate cards → evaluate quality → backfill if below target count
- Card types: **Basic** (Q&A), **Cloze** (fill-in-the-blank), **Reversed**
- Customizable card count, difficulty (essential / detailed), output language, free-text instructions
- YouTube guardrails: 2-hour max duration, 50K character transcript cap
- Generated cards go to the **Drafts** tray for review before being added to a deck

### Image Occlusion
- Upload any image and draw **rectangles, ellipses, or polygons** over areas to memorize
- Each shape (or shape group) becomes a separate flashcard
- Grouping: select multiple shapes to reveal them all together as one card
- Target deck selected at creation time

### Exam Mode
- Link a deck to an exam (USMLE Step 1) and set an exam date
- GPT-4 Mini classifies every card against the official exam blueprint (systems → topics)
- **Yield score** (0–100): `system_weight × topic_weight × confidence × split_weight × 100`
- Yield levels: High (≥70), Medium (≥40), Low (<40), Unclassified (<50% confidence)
- **Time-pressure multiplier** scales urgency as exam date approaches (1.0× → 2.5×)
- Threshold shift notification fires once per urgency tier crossing

### Study Plan
- Create a plan from your exam profile and unseen card count
- Daily card target auto-calculated from days remaining and content volume
- Ramp-up pacing: lighter in week 1, reaching steady state by week 3+
- **System coverage table**: blueprint organ systems with weight vs. current card coverage
- Temporary daily override without changing the overall plan
- Plan lifecycle: active, archive, reactivate, delete

### Statistics
- **Overview tab**: today's summary, card maturity pie chart, retention by state, activity heatmap
- **Cards tab**: missed topics breakdown by exam system (requires exam profile), date range selector
- **Reviews tab**: miss rate trend chart, activity heatmap, date range selector (7 / 30 / 90 days / all time)

### Decks & Cards
- Create and nest decks (parent/child hierarchy)
- Rich text card editor with image support
- Import **Anki .apkg** files with full deck hierarchy, media, and scheduling state
- Export to **Anki .apkg** or native **.spkg** format (includes full FSRS state + media)
- Card browser within each deck: front/back preview, state badge, template label

### Drafts
- AI-generated cards held in an inbox (capacity: 5 cards) before being added to a deck
- Promote individual drafts to a selected deck or delete them
- Acts as a quality gate — AI suggestions never auto-add to a deck

### Notifications
- **Cards Due Reminder**: fires at user-configured times when cards are due
- **Study Streak**: fires after a session when the user has studied 2+ consecutive days
- **Threshold Shift**: fires once per urgency tier crossing as exam date approaches

### Settings
- **7 themes**: System, Dark, Light, Red, Purple, Pink, Turquoise
- **5 languages**: English, Spanish, French, German, Chinese
- Card style: Modern or Traditional
- Card flip animation toggle
- Custom background image
- Daily new card limit (default: 20) and review limit (default: 200)
- FSRS toggle per deck
- Timer with configurable max and auto-advance
- **Time Travel**: redistribute overdue cards into manageable daily batches

### Data & Sync
- All flashcard data in local SQLite (`sekel.db` in OS user data folder)
- Automatic periodic backups with rotation (daily / weekly / monthly)
- One-click restore from any backup
- Deletion log with 90-day retention for card recovery
- Supabase used only for authentication (login, signup, session)
- **Auto-updates** via Cloudflare R2, checked every 1 hour — no manual download needed

## Platforms

| Platform | Arch |
|----------|------|
| Windows 10/11 | x64 |
| macOS | Apple Silicon (arm64) |
| macOS | Intel (x64) |

## Current Version

v1.8.0

## Key Decisions

1. **Local-first by design** — all flashcard data stays on the user's machine. No cloud sync for cards means the app works fully offline and users own their data completely.

2. **FSRS-5 over SM-2 by default** — FSRS is the state of the art in spaced repetition research. SM-2 is retained as a per-deck option for users migrating from Anki who prefer the familiar algorithm.

3. **Drafts as quality gate** — AI-generated cards go to a pending tray rather than directly into decks. This preserves user trust: the AI assists but doesn't automatically change the study library.

4. **Exam blueprint as the ranking system** — rather than simple due-date ordering, cards are ranked by exam relevance × time pressure. This surfaces the most important cards first as the exam approaches.

## Known Limitations / Future Work

- No mobile app — desktop only
- Supabase sync for cards is not implemented; Anki-imported media in particular does not sync to cloud
- The community deck hub (`apps/community`) is a separate, unauthenticated web app — not integrated into the desktop
