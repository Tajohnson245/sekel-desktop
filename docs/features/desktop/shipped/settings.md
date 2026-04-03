# Settings (Profile Page)
> All five settings tabs: Profile, Preferences, Study, Backup, and Account — what each setting does and where to find it.

---

## Overview

The Profile page is Sekel's settings hub, accessible via the profile icon in the navigation sidebar. It is organized into five tabs, each covering a distinct area: personal information, visual preferences, study behavior, data management, and account actions.

## Architecture

```
apps/desktop/src/components/Profile/
├── UserProfilePage.tsx         — Tab container, tab switcher
└── sections/
    ├── ProfileTab.tsx          — Name, school, degree, avatar
    ├── PreferencesTab.tsx      — Theme, language, card style, background
    ├── StudyTab.tsx            — Daily limits, FSRS, exam config, notifications, Time Travel, classify
    ├── BackupTab.tsx           — Backup list, create/restore, integrity check
    └── AccountTab.tsx          — Password, import, export, feedback, delete account
```

Settings are persisted in two locations:
- **Appearance + study preferences** → `user_profiles` table in Supabase (synced across installs)
- **Deck algorithm (FSRS/SM-2)** → `decks` table in local SQLite
- **Exam profile** → `user_exam_profiles` table in local SQLite

---

## Tab 1 — Profile

Personal information shown on the user's profile and used in admin analytics.

| Field | Notes |
|-------|-------|
| First name, last name | Plain text; synced to Supabase `user_profiles` |
| Medical school | Free text |
| Degree | Free text |
| Location | Free text |
| Avatar | Upload an image; stored in Supabase Storage `avatars` bucket; displayed in the nav sidebar |

---

## Tab 2 — Preferences

Visual and language personalization. All changes apply immediately without a save button.

### Language
Options: English (`en`), Spanish (`es`), French (`fr`), German (`de`), Chinese (`zh`)

Changing language calls `i18n.changeLanguage()` immediately (all UI strings update live) and persists to `user_profiles.language`.

### Theme
7 color swatches:

| Theme | Description |
|-------|-------------|
| System | Matches OS light/dark mode |
| Dark | Dark background (default) |
| Light | Light background |
| Red | Accent color: `#E05252` |
| Purple | Accent color: `#8B5CF6` |
| Pink | Accent color: `#EC4899` |
| Turquoise | Accent color: `#06B6D4` |

Selected via color swatch; applies instantly via `setTheme()`; persists to `user_profiles.theme_preference`.

### Card Style
**Modern** or **Traditional** — controls card visual presentation during study (font, layout, border style).

### Card Flip Animation
Toggle on/off. When on, cards use a smooth CSS flip transition when revealing the answer. When off, the answer appears instantly. Only available when Card Style is set to Modern.

### Background Image
Upload a custom background image shown behind the app UI. Stored locally; can be removed with the × button.

---

## Tab 3 — Study

Study behavior, algorithm, exam configuration, notification times, and power-user tools.

### Daily Limits
| Setting | Default | Notes |
|---------|---------|-------|
| New cards per day | 20 | Caps new card introductions regardless of what's due |
| Reviews per day | 200 | Caps total reviews per day |

Saved with a "Save limits" button; persisted to `user_profiles`.

### FSRS Algorithm Per Deck
A collapsible panel listing all decks with a toggle per deck (FSRS on/off). SM-2 is used when FSRS is off. All changes saved with one "Save algorithm settings" button.

### Exam Configuration
Shows current exam and exam date. Contains:
- **Exam** label and **Change Exam** button (opens [Exam Onboarding Modal](exam-onboarding.md))
- **Exam date** date picker (minimum: today; clears to "No date set" if removed)
- **Session mode** selector: Auto / Mixed / Triage (saved immediately on change)

Each field saves independently.

### Notifications
- Master toggle: enable/disable all desktop notifications
- **Reminder times**: add HH:MM times (24-hour format); multiple times supported; each time is a separate notification trigger
- Configuration is pushed to the main process via `notify:configure` IPC on save

### Time Travel
Redistributes overdue cards accumulated during a missed study period back into manageable daily batches.

**Usage:**
1. Set "Days back" (how far back to look for overdue cards; default: 7)
2. Click **Preview** → shows how many overdue cards would be redistributed and over how many days
3. Click **Execute** → redistribution applied; event logged to `time_travel_log`

This does not delete or reset cards — it adjusts their `due` dates so they become evenly spread over the coming days rather than all appearing at once.

### Classify Cards
Manually re-runs GPT card classification for a selected deck.

- Select a deck from the dropdown
- Optional: **Force reclassify** toggle — if off, already-classified cards are skipped
- Click **Classify** → calls `yield.classifyBatch()` IPC
- Result shows: classified / skipped / errors count

Requires an exam profile to be active.

---

## Tab 4 — Backup

Manages local database backups. See [backup-system.md](backup-system.md) for full technical details.

- **Backup list**: all automatic and manual backups with timestamps and file sizes
- **Create Backup**: manually triggers a backup immediately
- **Restore**: select a backup and restore (requires confirmation dialog; app reloads after)
- **Run Integrity Check**: runs SQLite `PRAGMA integrity_check` + `PRAGMA foreign_key_check`; result shown inline
- **Total backup storage** size displayed at the top

Backups are stored at `{userData}/backups/` and are ordinary SQLite files.

---

## Tab 5 — Account

Account management and data portability.

| Action | Notes |
|--------|-------|
| Email address | Displayed read-only |
| Change password | Opens a password change form (Supabase auth) |
| Import Anki deck | Same entry point as the Deck list import button; opens native file dialog for `.apkg` |
| Export collection | Exports full local database as a `.spkg` file |
| Submit feedback | Opens a feedback modal: area checkboxes, description text area, optional screenshot upload. Saved to Supabase `feedback` table. |
| Delete account | Permanent deletion with a confirmation modal; removes auth account and user data from Supabase |

---

## Key Decisions

1. **Language and theme apply immediately** — no "Apply" button needed. Immediate visual feedback lets users confirm the change was applied without guessing.

2. **FSRS toggled per deck, not globally** — different decks may have different maturity levels. A new deck from an imported .apkg might work better with SM-2 (preserving Anki's scheduling history), while a new deck should default to FSRS.

3. **Time Travel as a named feature** — redistribution of overdue cards is a common pain point for spaced repetition users who miss study sessions. Making it explicit (with a preview step) is safer than an automatic "catch up" algorithm that silently changes due dates.

## Known Limitations / Future Work

- No per-device settings — preferences sync to Supabase so changing the theme on one device changes it everywhere
- No export of study statistics (only raw database export via .spkg)
- Feedback screenshots are uploaded but not currently shown in the Admin dashboard UI
