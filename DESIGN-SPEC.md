# SEKEL Design Spec — "Ink" Design System v2

**Status:** Canonical. Supersedes all prior UI decisions in this repo.
**Sources of truth:** Figma file *SEKEL — Desktop App Design* (frames `00 · Brand Tokens`, `01 · Study — Review Session`, `02 · Dashboard — Plan Mode`, `03 · Decks`) and `sekel-settings.html` (interactive reference for `04 · Settings`).
**Scope:** Every screen, component, interaction, and flow in the SEKEL desktop app (Electron + Vite + TypeScript).

---

## 1. Design philosophy

Three rules govern every decision. When in doubt, resolve against these:

1. **Quiet chrome, loud content.** The app frame (sidebar, headers, controls) recedes into ink-dark surfaces. The things a med student actually reads — the clinical vignette, the exam countdown, the due count — get the serif type, the size, and the color. If a piece of chrome competes with a card for attention, the chrome loses.
2. **The exam is the organizing object, not the deck.** Every screen answers "am I on pace for exam day?" before it answers anything else. Blueprint coverage, days-until-exam, and cohort pace appear passively and persistently. Decks are the mechanism; the exam is the goal.
3. **Keyboard-first, mouse-optional.** A 142-card review session is a keyboard activity. Every primary flow must be completable without the mouse, shortcuts are surfaced in the UI (mono type, `kbd` styling), and reveal/rate is a zero-layout-shift loop.

---

## 2. Color tokens

### 2.1 Brand palette (canonical hex — do not drift)

| Token  | Hex       | Role |
|--------|-----------|------|
| INK    | `#0F1117` | App background, text-on-teal |
| TEAL   | `#2BBFA4` | **Reserved: actions + AI surfaces + "due"** |
| SLATE  | `#4A5270` | Disabled, zero-states, inactive dots, tertiary text |
| MIST   | `#8B93A8` | Secondary text, descriptions |
| FOG    | `#C3C9D6` | Emphasized secondary text, ghost-button labels |
| CLOUD  | `#E6E9F0` | Rare high-emphasis neutral |
| PAPER  | `#F7F8FA` | Primary text, toggle knobs |
| AMBER  | `#E8A33D` | Learning counts, retention, streaks, high-yield |
| ROSE   | `#E05C5C` | "Again" rating, destructive actions |
| VIOLET | `#8C7BE8` | New cards, FSRS/scheduler identity, cohort median |

### 2.2 Derived surfaces

| Token      | Hex       | Role |
|------------|-----------|------|
| SIDE       | `#0D1019` | Sidebar background (one step darker than INK) |
| PANEL      | `#151A26` | Cards, panels, table rows |
| PANEL-2    | `#1B2130` | Nested surfaces: pills, inputs, subdeck rows, kbd chips |
| STROKE     | `#232838` | All 1px borders and row dividers |
| NAV-ACTIVE | `#161C2A` | Active nav / sub-nav item background |

### 2.3 Color semantics (enforced)

- **TEAL is contractual.** It appears only on: primary action buttons, the AI-generated chip, due counts, active-state accents (nav dot, active filter), progress fills, and Plan Mode's feature border. If a surface is teal, clicking it does something or AI made it. Never use teal decoratively.
- **Count triad:** New = VIOLET · Learning = AMBER · Due = TEAL. Used identically in tables, pills, and stat cards. Zero values render SLATE.
- **Tinted chips/badges:** accent color at 14–18% opacity background, full-strength accent text. Never solid-fill badges except the primary teal button and due pills on active sidebar decks.
- Danger is ROSE, always outline/ghost style — never a solid red button.

---

## 3. Typography

### 3.1 Faces

| Role    | Brand face   | Shipping face (bundle via @fontsource) | Usage |
|---------|--------------|----------------------------------------|-------|
| Display | Georgia      | **Lora** (400, 500, 700)               | Page titles, panel titles, card questions, big stat numbers, wordmark |
| Body    | Calibri      | **Inter** (400, 500, 600, 700)         | Everything else |
| Mono    | Courier New  | **Roboto Mono** (400, 500)             | Values, dates, kbd hints, file paths, timers |

> **Decision:** The approved mockups render in Lora/Inter/Roboto Mono. Bundle these three families in the Electron app for pixel parity and cross-platform consistency (Calibri does not exist on macOS/Linux). CSS stacks keep the brand faces as fallbacks: `font-family: 'Lora', Georgia, serif;` etc.

### 3.2 Scale

| Style | Face / weight | Size / treatment |
|---|---|---|
| Page title | Lora 400 | 38px, line-height 1.15 |
| Hero stat / countdown | Lora 400–700 | 30–34px, accent or PAPER |
| Card question (study) | Lora 400 | 20–28px, line-height 1.5, PAPER |
| Panel title | Lora 700 | 17px |
| Row title | Inter 600 | 14–15px, PAPER |
| Body / description | Inter 400 | 12–13px, MIST |
| Section label / column header | Inter 600 | 10–11px, UPPERCASE, letter-spacing 8–12%, SLATE |
| Values, dates, shortcuts | Roboto Mono 400 | 11–13px |
| Wordmark | Lora 400 | 22px, letter-spacing 13% |

---

## 4. Space, shape, elevation

- **Base unit 4px.** Panel padding 18–24px. Main content padding 44–48px. Sidebar padding 32/20/28.
- **Radii:** 5–6px micro chips · 8px small controls, buttons, row-level buttons · 10px nav items, inputs, primary buttons · 12px table rows, tier card · 14px panels · 16px study card · full-round filter chips and pills.
- **Borders over shadows.** Every panel and row: 1px STROKE. The only drop shadow in the app is the study card (`0 12px 40px rgba(0,0,0,.4)`) and toasts.
- **Feature panels** (Plan Mode, AI-tier features): border becomes teal at ~45% opacity. This is the "this is why you pay $10/mo" visual signal.

---

## 5. App shell

### 5.1 Sidebar — 260px fixed, SIDE background

Top to bottom:
1. **Logo:** 40×40 teal rounded square (radius 10) containing serif "S" in INK + "SEKEL" wordmark (Lora, letter-spaced).
2. **Primary nav:** Dashboard · Study · Decks · Browse · Statistics · Settings. Each item = 6px dot + label, 12px/14px padding, radius 10. Inactive: SLATE dot, MIST label. Active: NAV-ACTIVE bg, TEAL dot, PAPER semibold label. Hover: faint NAV-ACTIVE, FOG label.
3. **DECKS section** (contextual — appears on Study/Decks-related screens): uppercase letter-spaced SLATE label, then deck rows with due-count pills (PANEL-2 pill, FOG number). The deck currently in session gets a teal-tinted row with a solid teal pill.
4. **Tier card** (pinned bottom): PANEL panel, DEDICATED pill (teal tint), caption "AI features + cloud backup active". Free tier: SLATE-tinted pill reading "FREE", caption "Local FSRS + .apkg import", plus a quiet teal text-link "Upgrade".

### 5.2 Main region

Scrollable column (custom scrollbar: PANEL-2 thumb, 5px radius). No page-level scroll; the shell is 100vh fixed like a native app. Text selection disabled on chrome, enabled on card content.

---

## 6. Component library

| Component | Spec |
|---|---|
| **Button / primary** | Teal fill, INK text, Inter 600 12–14px, radius 8–10. Hover: brightness +8%. |
| **Button / ghost** | PANEL or PANEL-2 fill, 1px STROKE, FOG label. Hover: SLATE border, PAPER label. |
| **Button / danger** | Transparent, 1px ROSE @40% border, ROSE label. Hover: ROSE @8% fill. |
| **Chip (status)** | Accent @16% bg, accent text, Inter 700 10px, radius 8. E.g. `FSRS v5` (violet), `ON` (teal), `DEDICATED` (teal), `HIGH YIELD · 92` (teal or amber per context). |
| **Pill (count)** | PANEL-2 bg radius-full, FOG mono-ish number. Active variant: solid teal, INK text. |
| **Filter chip** | Radius-full. Inactive: PANEL + STROKE, MIST. Active: teal @14% + teal @60% border, TEAL semibold. |
| **Toggle** | 42×22–24 track radius-full. Off: SLATE @50%. On: TEAL. 18px PAPER knob, 150ms transform. `role="switch"` + `aria-checked`. |
| **Stepper** | PANEL-2 + STROKE capsule: `−` / mono value / `＋`. Hover on buttons: teal @10% bg, teal glyph. |
| **Slider** | 6px track, teal fill to thumb, SLATE @30% remainder, 16px PAPER thumb. Paired value chip (mono, teal). |
| **Search field** | PANEL + STROKE radius 10, `⌕` SLATE, placeholder SLATE, trailing `⌘K` kbd chip. |
| **kbd** | Mono 11px, PANEL-2 bg, STROKE border, radius 5. |
| **Table** | Column-header row of uppercase SLATE labels (no bg), then rows as separate PANEL cards (radius 12, 10px gap) — not a contiguous grid. Fixed column widths, name column flexes. |
| **Yield mix bar** | 90×6 track radius 3: AMBER (high) + TEAL (medium) segments over SLATE @25% (low). |
| **Progress bar** | 6–8px track, SLATE @20–25%, teal fill, radius-full. Thin 4px variant under top bars. |
| **Toast** | Bottom-center, PANEL-2 + STROKE + shadow, teal `✓`, slides up 200ms, auto-dismiss ~2.2s. |
| **Empty state** | Serif one-liner + one teal action. "An empty screen is an invitation to act." No illustrations. |

---

## 7. Screen specs

### 7.1 Dashboard — "Today's Plan"
- Title "Today's Plan" (Lora 38) + date + "rebalanced this morning". Top-right: primary CTA **✦ Generate Cards with AI**.
- **Exam hero card** (teal-bordered feature panel): uppercase teal blueprint label (`USMLE STEP 1`), serif countdown ("87 days until exam"), pace line ("On pace · projected 94% blueprint coverage by exam day"), right-aligned mastery block ("68% mastered").
- **Stat row** (4 cards): Due today (teal serif number) · New cards (violet) · Retention (amber) · Avg load (mist/fog). Label top, big serif number, caption bottom.
- **Cohort FSRS Projection panel:** line chart — solid teal "Your projected mastery" vs dashed violet "Cohort median", `Plan Mode: ON` chip, legend dots. Hairline INK-level gridlines only.

### 7.2 Study — Review Session
- **Top bar:** deck breadcrumb ("USMLE Step 1 · Cardiology", serif) + "Review session · 23 of 142 due"; right: `FSRS · optimal` chip (neutral) + `Streak 18d` chip (amber). 4px teal progress bar underneath.
- **Card** (max-width ~880px, centered, generous negative space): metadata chips — `HIGH YIELD · 92` (solid teal, INK text), `Blueprint: Cardiovascular` (neutral), `AI Generated` (teal outline) — then the vignette in Lora 24–28/1.5.
- **Pre-reveal:** mono hint pill "Press SPACE to reveal answer". **The four rating buttons are always visible** below the card (zero layout shift), disabled/dimmed pre-reveal, enabled post-reveal.
- **Rating buttons:** outlined, accent-tinted: Again `<1m` ROSE · Hard `10m` AMBER · Good `1d` TEAL · Easy `4d` VIOLET. Label Inter 600 15px + mono interval caption. Keys 1–4.
- **Session stats footer:** Reviewed · Again-count · Avg time · Retention, in quiet mist/mono.
- **Post-reveal:** answer appears under a teal `ANSWER` micro-label with a hairline divider; card grows downward, buttons stay put.

### 7.3 Decks
- Header: "Decks" + reconciled summary line ("4 decks · 6,043 cards · 271 due today"). Actions: ghost **⇪ Import .apkg** + primary **＋ New Deck**.
- Toolbar: search (`⌘K`) + exam-family filter chips (All · USMLE Step 1 · NBME Shelf · NCLEX-RN).
- **Deck table** columns: DECK · NEW · LEARNING · DUE · RETENTION · YIELD MIX · LAST STUDIED · action. Counts use the color triad; zeros are SLATE. Row action: teal **Study** when due > 0, ghost **Browse** when due = 0.
- **Hierarchy:** parent rows carry a chevron; expanded subdecks render as indented PANEL-darker (`#12161F`) rows with the same columns. Child counts must sum to parent.
- Footer status bar: "271 due across 4 decks · est. 54 min at current pace" + mono shortcuts (`↵ Study · N New deck · / Search`).

### 7.4 Settings
- Header: "Settings" + identity line ("Signed in as … · v1.4.2 · up to date" with teal state).
- **Two-column:** sticky sub-nav (200px: General · Study & FSRS · AI Generation · Account & Sync · Data & Storage · About; active = NAV-ACTIVE bg + teal label) + panel stack.
- **Study & FSRS** (default tab): Scheduler panel (`FSRS v5` violet chip — retention slider, max-interval stepper, optimize row with last-run metadata) · **Plan Mode feature panel** (teal border, `ON` chip — exam date, daily new limit, rebalance toggle, cohort toggle) · Session panel (keyboard-first with kbd hints, answer timer, auto-advance).
- **Signature interaction:** a live plan-summary strip inside Plan Mode recomputes as the retention slider moves: "At 92% retention: ~304 reviews/day · est. 42 min · projected 95% blueprint coverage." The retention↔load tradeoff is shown at the moment of decision.
- Every settings row: title (Inter 600 14) + description (12 MIST) left, control right, STROKE divider between rows.
- Other tabs: AI Generation (default blueprint, batch size, review-before-adding, auto-tag), Account & Sync (identity hero, plan chip `DEDICATED · $10/mo`, cloud backup with last-backup note, billing, sign out as danger-ghost), Data & Storage (mono SQLite path, import/export .apkg, Back up now as the tab's one teal button), About (serif version, update controls, `FSRS v5 · ts-fsrs` credit).

---

## 8. Motion & interaction

- Transitions 120–180ms ease on background/color/transform only. Tab panes: 180ms fade + 4px rise. Toggle knob 150ms. **No entrance animations on the study card** — cards must appear instantly.
- `prefers-reduced-motion: reduce` disables all non-essential animation.
- `:focus-visible`: 2px teal outline, 2px offset — never remove.
- Hover states are one step brighter, never a new color.

### Global keyboard map

| Key | Context | Action |
|---|---|---|
| `Space` | Study | Reveal answer |
| `1 2 3 4` | Study (revealed) | Again / Hard / Good / Easy |
| `E` | Study | Edit current card |
| `U` | Study | Undo last rating |
| `⌘K` / `Ctrl K` | Global | Command palette / search |
| `/` | Lists | Focus search |
| `N` | Decks | New deck |
| `↵` | Decks | Study selected deck |
| `Esc` | Study / modal | Exit session (with confirm if mid-card) / close |
| `⌘, ` | Global | Open Settings |

---

## 9. UX flows (v2 — these replace prior flows)

1. **Morning open → study:** App opens → Plan Mode rebalances (silent, noted as "rebalanced this morning") → Dashboard hero shows countdown + pace → one click/`↵` into the highest-priority session. Target: zero decisions before the first card.
2. **Review loop:** card (buttons visible, disabled) → `Space` reveal → `1–4` rate → next card instantly. Session footer updates live. `Esc` exits with progress kept.
3. **Deck triage:** Decks table is the triage surface — due counts + yield mix decide where time goes; subdeck expansion for targeting; Browse (not Study) is the affordance when nothing is due.
4. **AI generation:** CTA lives on Dashboard (and Decks empty states) → paste source → pipeline runs → **review-before-adding gate** (per Settings) → cards land tagged with yield score + `AI Generated` chip, which persists on every card in review.
5. **Retention tuning:** Settings → slider → live load projection → change propagates to next rebalance. Never silently change today's plan mid-session.
6. **Tier awareness:** Free tier sees the same shell; AI surfaces render with an `UPGRADE` amber chip instead of executing; tier card shows FREE + upgrade link. No modals, no nags.

---

## 10. Voice

Sentence case everywhere except uppercase micro-labels. Plain verbs on controls ("Back up now", not "Initiate backup"). Buttons keep their name through the flow: "Publish" → toast "Published". Errors say what happened and what to do next, never apologize. Numbers reconcile across screens — if Dashboard says 271 due, Decks must sum to 271.

---

## 11. Data visualization

Applies to every chart in the app — the Dashboard cohort projection, the full Statistics page, and any future metric surface. Charts are content, so they get the same discipline as everything else.

- **Container:** charts live inside standard panels (§6). No chart borders, axis boxes, or backgrounds of their own.
- **Grid:** horizontal hairlines only, STROKE color. No vertical gridlines.
- **Axes:** labels 10–11px Inter SLATE; numeric tick values in Roboto Mono. No axis lines — the gridlines are the reference.
- **Series colors are semantic, not sequential:**

| Series meaning | Treatment |
|---|---|
| The user's own metric (mastery, retention, reviews done) | TEAL solid |
| Cohort / comparison / benchmark | VIOLET dashed |
| Retention & accuracy measures | AMBER |
| Lapses / "Again" counts | ROSE |
| Projection / forecast | dashed variant of its own series color |
| Capacity / track / remainder | SLATE @20–25% |

- **Fills:** area fills at 8–12% opacity of the series color, maximum. Bar tops radius 3–4; bars showing progress-against-capacity sit on a SLATE-tint track.
- **Review heatmap** (activity calendar): PANEL-2 base cells, radius 3, 5-step teal opacity ramp for intensity.
- **Tooltips:** PANEL-2 + STROKE + toast shadow; label in Inter MIST, values in mono PAPER.
- **Legends:** 6px dots + 12px MIST labels (see Dashboard cohort chart).
- **Restraint:** max two series colors per chart unless the data genuinely demands more; if a chart needs a title and a sentence to be understood, the sentence goes in the panel header area (Inter 12 MIST), not inside the plot.
- **Empty charts** follow the §6 empty-state rule: serif one-liner + one action ("Review cards to see your retention curve").
