# SEKEL "Ink v2" Redesign — Changelog

Full migration of the desktop renderer to the **Ink v2** design system (`DESIGN-SPEC.md`).
This is a redesign of the visual system, components, screens, interactions, and flows —
not a reskin. Companion doc: `docs/redesign-audit.md` (inventory + old→new delta map).

Status legend: ✅ rebuilt to spec · ◑ enhanced + token-migrated · ○ token-migrated only (layout unchanged).

---

## 1. Token layer & fonts (spec §2–§4) ✅

- **`apps/desktop/src/index.css` `:root`** rewritten to the canonical Ink v2 palette. Near-miss
  legacy values corrected to exact spec hex: FOG `#BEC5D4→#C3C9D6`, CLOUD `#E8ECF4→#E6E9F0`,
  PAPER `#F4F6FB→#F7F8FA`, AMBER `#F0A500→#E8A33D`, ROSE `#E05C6A→#E05C5C`, VIOLET `#7C6EF5→#8C7BE8`.
  INK, TEAL, SLATE, MIST were already on-spec.
- **New derived surfaces** added as first-class tokens: `--side #0D1019`, `--panel #151A26`,
  `--panel-2 #1B2130`, `--stroke #232838`, `--nav-active #161C2A`, `--panel-3 #12161F`. Legacy
  `--ink-soft`/`--ink-muted` are now aliases onto `--panel`/`--panel-2`, so every existing rule
  that referenced them re-colors to v2 automatically.
- **Accent tints via `color-mix`** (`--teal-tint`, `--*-soft`, `--teal-border`, `--rose-border`, …)
  so chips/tints track the active accent (14–18% bg per spec §2.3) and stay correct under the
  legacy light/color-wave themes too.
- **Radii** re-scaled to the spec ladder (`--r-chip 6`, `--r-sm 8`, `--r-nav 10`, `--r-row 12`,
  `--r-panel 14`, `--r-card 16`, `--r-full`); **shadows** reduced to `--shadow-card`
  (`0 12px 40px rgba(0,0,0,.4)`) + toast, per "borders over shadows."
- **Fonts**: swapped DM Serif Display / Outfit / DM Mono (Google Fonts CDN) → **Lora / Inter /
  Roboto Mono bundled offline via `@fontsource`** (imported in `renderer.tsx`, only shipped
  weights). Removed the Google Fonts `<link>` + preconnects from `index.html` and tightened the
  **CSP** (dropped `fonts.googleapis.com` / `fonts.gstatic.com`). Brand faces kept as fallbacks.
- **Shared package drift fixed**: `packages/components/src/components.css` had a *duplicate* token
  `:root` with the old values (silent-drift risk flagged in the audit) — synced to identical v2
  tokens and its light theme now also keys off `.light` (not just `[data-theme]`).
- **Global spec rules** added: app-wide `:focus-visible` (2px teal, 2px offset), a
  `prefers-reduced-motion` guard, and the §5.2 scrollbar (PANEL-2 thumb, 5px radius).

## 2. App shell → 260px sidebar (spec §5) ✅

- **Replaced the top navigation bar with a 260px `--side` left sidebar** (`router/Sidebar.tsx`,
  new). `AppLayout` is now `row` → sidebar + `.app-main` column (fixed 100vh, no page scroll).
- Logo mark (40×40 teal rounded square, serif "S" in INK) + "SEKEL" wordmark (Lora, letter-spaced).
- **Dot-bullet nav**: 6px dot + label, active = NAV-ACTIVE bg + TEAL dot + PAPER semibold; hover =
  faint NAV-ACTIVE + FOG. `data-testid="nav-*"` preserved for the onboarding tour.
- **Contextual DECKS section** (on `/decks*`): deck rows with PANEL-2 count pills; the in-session
  deck gets a teal-tinted row + solid-teal pill.
- **Pinned tier card** with DEDICATED (teal-tint chip, "AI features + cloud backup active") and FREE
  (slate chip, "Local FSRS + .apkg import", teal "Upgrade" link) variants — driven by `useTier`.
- Quiet identity footer (avatar + email → Settings, sign-out).

## 3. Component library (spec §6) ✅

- New reusable primitive stylesheet **`apps/desktop/src/styles/ink-components.css`**: page/hero/panel
  type roles, `.panel` + `.feature-panel` (teal border), tinted `.chip-*` + `.chip-solid-teal` +
  `.chip-outline-teal`, `.count-pill`, `.filter-chip`, `.kbd`, `.search-field`, `.stepper`,
  `.ink-slider`, `.progress-bar`, `.yield-mix`, `.ink-table` (gapped row-cards), count-triad cell
  colors, and `.empty-v2` (serif one-liner + one teal action).
- **Buttons** (`.btn` in index.css + shared `Button.css`) retuned to spec: primary = teal fill +
  **INK text** (was white); ghost/secondary = PANEL + STROKE + FOG; **danger = transparent + ROSE
  outline** (was solid red). Hover = brightness/one-step brighter.
- **Toggle** (`ToggleSwitch.css`): off = SLATE @50%, on = TEAL, PAPER knob (removed the `#3b82f6`
  fallback).
- **Retired components deleted** (not left importable): `Deck/DeckCard.{tsx,css}` (replaced by the
  table), and the orphaned duplicate charts `UI/charts/{LapseStats,RatingDistribution,RetentionTrend}Chart.tsx`
  (live code uses the shared `@sekel/components` charts).

## 4. Screens (spec §7)

### 4.1 Study — Review Session ✅ (`Study/StudySession.tsx`, `RatingButtons.tsx`, `Card/CardViewer.tsx`)
- **Rating buttons are now always visible and disabled pre-reveal** (was: a single "Show Answer"
  button pre-reveal, 4 buttons post-reveal — a hidden-until-reveal pattern *and* a layout shift).
  Buttons are outlined + accent-tinted: Again ROSE · Hard AMBER · Good TEAL · Easy VIOLET, with mono
  interval captions and `kbd` key hints (1–4).
- **Zero-layout-shift reveal**: the card renders in CardViewer's *stacked* mode (new `stacked` prop)
  — question, then a teal `ANSWER` micro-label + hairline divider, then the answer grows downward.
  The 0.6s 3D flip (which conflicts with §8 "cards must appear instantly") is bypassed for study.
- Top bar: serif deck breadcrumb + "Review session · N of M due" + FSRS chip; **4px teal progress
  bar** underneath. Metadata chips above the vignette (HIGH YIELD solid-teal, Blueprint neutral).
  Vignette in Lora. Session footer: Reviewed · Again · Avg time · Retention (quiet mist/mono) + a
  `kbd` shortcut strip.
- **Consolidated keyboard** (single listener): `Space` reveal · `1–4` rate · `U` undo (restores the
  previous card's FSRS state from a local snapshot + steps back) · `E` edit (surfaced; in-session
  editing deferred with a toast) · `Esc` exit with a styled confirm when mid-card (progress kept).
- FSRS scheduling, session creation, review logging, timer, and auto-advance are unchanged.
- Occlusion mask/reveal SVG fills tokenized (`#3b82f6`→`var(--violet)`, green→`var(--teal)`).

### 4.2 Decks ✅ (`Deck/DeckList.tsx` + new `DeckList.css`)
- **Card grid → gapped row-card table** (spec §7.3): columns DECK · NEW · LEARNING · DUE · RETENTION ·
  YIELD MIX · LAST STUDIED · action. Counts use the triad (New VIOLET · Learning AMBER · Due TEAL;
  zeros SLATE). Row action = teal **Study** when due > 0, ghost **Browse** when due = 0.
- **Subdeck hierarchy**: parent rows carry a chevron and expand to indented PANEL-3 rows; **parent
  counts are the aggregated sum of descendants** (spec: "child counts must sum to parent").
- Header shows the reconciled summary ("N decks · X cards · Y due today"); toolbar has a search field
  (`/` focuses it) + exam-family filter chips; footer status bar ("Y due across N decks · est. Z min")
  + mono shortcuts. Bulk-delete + the delete-confirmation modal are preserved.
- RETENTION and LAST STUDIED columns render "—" — no per-deck query exists for them yet (documented
  follow-up); YIELD MIX uses the available new/review split as a proxy.

### 4.3 Dashboard — "Today's Plan" ◑ (`Dashboard/Dashboard.tsx` + `Dashboard.css`)
- Added the §7.1 header ("Today's Plan" Lora 38 + date + "rebalanced this morning"), the top-right
  **✦ Generate Cards with AI** CTA, the **teal-bordered exam hero** (uppercase teal blueprint label,
  serif countdown, on-pace line with projected coverage, right-aligned mastery block), and the
  **count-triad stat row** (Due today TEAL · New VIOLET · Retention AMBER · Avg load MIST; zeros SLATE).
- The existing analytics sections (Intelligence, Plan Overview, Deck Health, Exam Readiness,
  Quick Actions) are retained and token-migrated. A cohort-projection line chart is not added — no
  cohort-median data source exists yet (mini-spec noted for follow-up).

### 4.4 Settings ◑ (`Profile/UserProfilePage.tsx` + `UserProfilePage.css`)
- Added the §7.4 title + identity line ("Settings" + "Signed in as … · v{version} · **up to date**"
  with teal state) and reworked the layout to the **two-column sticky sub-nav** (200px vertical nav +
  panel stack) by restyling the shared Tabs into a vertical rail (NAV-ACTIVE active state, teal label).
- Existing tabs/sections (Profile / Preferences / Study & FSRS / Backup / Account) retained and
  token-migrated; the live retention→load "plan-summary strip" is noted as a follow-up in the audit.

## 5. Uncovered screens (spec had none) ○/◑

Every screen the spec doesn't define is covered by a v2 treatment in `docs/redesign-audit.md §6`.
Implementation status this pass: all received the token/type system + tokenized charts; hex literals
across AI generation (DocumentsPage/AICardGenerator), Drafts, Image Occlusion, Import, Plan, Auth,
Card editor (NoteEditor), and SessionModeBriefing were migrated to tokens. Statistics inherits the
§11-compliant shared charts automatically. Full layout re-composition of these surfaces (e.g.
Statistics leading with exam-pace answer cards, the AI pipeline-stage view) is scoped in the audit
mini-specs as the next iteration.

## 6. Data visualization (spec §11) ✅

Shared charts (`packages/components/src/charts/*`) migrated to semantic series colors: user metric =
TEAL, cohort = VIOLET (dashed), retention/accuracy = AMBER, lapses = ROSE, capacity = SLATE @~22%;
rating bars Again/Hard/Good/Easy = ROSE/AMBER/TEAL/VIOLET. Gridlines horizontal-only in STROKE,
tooltips PANEL-2 + STROKE + shadow, axis labels SLATE. All chart hex removed.

## 7. Motion, flows & keyboard (spec §8–§9)

- Transitions constrained to color/background/transform; reduced-motion honored globally; toast
  auto-dismiss tightened 4s → **2.2s** (spec §6).
- Global keyboard service `useGlobalKeyboard` (mounted in the shell): `⌘K/Ctrl+K` → search surface,
  `⌘,/Ctrl+,` → Settings. Study and Decks each own a single consolidated document listener (no
  scattered per-widget listeners). Modal `Escape` remains component-scoped by design.
- Flows: morning-rebalance note surfaced on the Dashboard; zero-decision open→study via the sidebar
  in-session deck + Dashboard hero; Study/Browse row logic (§9.3); Esc-with-confirm (§9.2); free-tier
  tier card + `useTier` UPGRADE path (§9.6, ready for a `subscription_tier` field).

## 8. i18n

39 new keys added to **all five locales** (`en/de/es/fr/zh`) via merge script. All new user-facing
strings were authored with in-code `defaultValue`, so the UI renders correctly regardless; non-English
locales currently carry the English text as a placeholder pending translation.

## 9. Judgment calls (recorded per the prompt)

1. **Dark Ink is the one canonical theme.** The pre-existing light + color-wave themes conflict with a
   single dark spec; kept working (new surface tokens map onto each theme's ink surfaces) but treated
   as legacy, not part of v2.
2. **Sidebar nav = the app's real routes** styled as dot-bullet. The spec's "Study"/"Browse" are
   per-deck activities here (reached from deck rows / the hero), not standalone routes, so the rail
   exposes Dashboard · Decks · Generate · Visual Cards · Drafts · Plan · Statistics · Settings
   (+ Diagnostics for admins) rather than inventing Study/Browse destinations.
3. **Tier** has no backing column yet; `useTier` defaults to DEDICATED and the FREE path is fully
   built so it lights up the moment a `subscription_tier` field lands.
4. **Undo (`U`)** restores scheduling from a local pre-review snapshot (scheduling writes absolute
   values, so this is a clean revert) and reverts the footer counters; the logged review row is
   retained (documented limitation).
5. **Intentional literal keeps** (not palette chrome, so left as-is): the YouTube brand red `#FF0000`,
   `rgba(0,0,0,x)` shadow/scrim alphas, `main.ts` window `backgroundColor` (main process, can't use a
   CSS var), and the theme-picker swatches in `PreferencesTab` (they display each theme's actual
   palette identity).

## 10. Verification

**Build gates — all pass:**

- `tsc --noEmit` → **exit 0** (renderer clean; excluded the pre-existing Deno `supabase/functions`
  from the Electron TS program so the signal is meaningful).
- `eslint .` → **exit 0** (0 errors; the 17 remaining warnings — `any` in `RichTextEditor` /
  `react-quill-new.d.ts` and an unused eslint-disable in `main.ts` — are all pre-existing, not from
  this work).
- `electron-vite build` (production) → **exit 0** for main + preload + renderer. Output confirms the
  Lora / Inter / Roboto Mono `woff/woff2` are bundled into `dist/renderer/assets` (offline, no CDN).

**Legacy sweep (all clean):**

```
(a) hex/rgb literals in renderer components, excluding token files
    (index.css / ink-components.css / components.css), the YouTube brand red,
    and rgba(0,0,0,x) shadow alphas:
    → NONE (only the intentional keeps below remain)

(b) RETIRE colors as literals (#22c55e #16a34a #3b82f6 #2563eb #ef4444 #dc2626
    #f59e0b #f0a500 #7c6ef5 #8892a4) anywhere in the renderer:
    → NONE

(c) imports of deleted components (DeckCard, UI/charts/*):
    → NONE  (one hit — a descriptive code comment in useDeckDueCounts.ts, not an import)

(d) document/window keydown listeners in the renderer:
    → Study (1, consolidated) · Decks (1, consolidated) · useGlobalKeyboard (1, global service)
    · OnboardingTour (1) · ImageOcclusionEditor (2) — the last three are intentionally
      feature-scoped (tour-overlay nav, occlusion-canvas editing), which the §8 global map
      does not govern. No scattered per-widget shortcut listeners remain.
```

Intentional literal keeps (documented, §9.5): the theme-picker swatches in `PreferencesTab` (each
displays its theme's real palette identity), the YouTube brand red `#FF0000`, `rgba(0,0,0,x)` shadow/
scrim alphas, `main.ts` window `backgroundColor` (main process — no CSS var available), and PlanPage's
`--*-rgb` channel fallbacks (now carrying v2 teal/amber channels).

**Teal audit:** `var(--teal*)` usages across the renderer — `--teal` 128, `--teal-soft` 19,
`--teal-tint` 12, `--teal-border` 11, `--teal-glow` 4. All fall into the contractual set: primary
actions (`.btn-primary`, `--primary`/`--accent` aliases), AI surfaces (Generate CTA, AI chip), due
counts (count-triad `Due`, deck pills), active accents (nav dot, active filter/tab, in-session deck),
progress fills, the feature-panel border, and positive system state (§7.4 "up to date"; correct/Good
= teal — the one green→teal remap, sanctioned as positive state). No decorative teal.

**Reveal-loop check:** the Study rating row (`.rating-zone`, fixed `min-height: 96px`) always renders
the *same* `RatingButtons` element; reveal only flips its `disabled` prop — identical DOM and size
pre- and post-reveal, so zero layout shift by construction. The stacked CardViewer grows *below* the
divider, leaving the rating row fixed.

**Reconciliation check:** `Dashboard` "Due today", the sidebar deck pills, and the `Decks` summary +
footer all read `useDeckDueCounts` (which reuses `useDeckStats`' exact query keys — one shared cache).
Parent deck rows show the aggregated sum of descendants. Single source of truth; the values cannot
disagree.

**Window sizes (1280×800 / 1440×900):** verified structurally — the shell is `sidebar (260px fixed) +
main (flex, min-width:0)`; screens use flex/grid with `min-width:0` and the deck table has fixed
columns with a single flexing name column, so no horizontal overflow or collapsed panels at either
size. (This environment could not launch a live Electron window for a pixel screenshot; verification
is by layout construction, not a rendered capture.)

---

## 11. Post-review fixes

1. **Study settings now take effect.** The study card previously forced the stacked
   layout, which overrode the user's preferences. `StudySession` no longer forces a mode —
   `CardViewer` honors `card_style` (visual card box on/off), `flip_animation` (3D flip vs instant
   swap), and `visual_card_size` (compact→full). The rating row sits in its own fixed zone, so the
   reveal is still zero-shift in every mode. All Preferences/Study toggles persist via `upsertProfile`
   and re-render reactively.
2. **Rating choices centered.** A stale duplicate `.rating-buttons`/`.rating-btn` block in `index.css`
   (old flex, left-aligned, natural-width) was overriding the v2 grid in `RatingButtons.css` and is
   removed. The four choices now render as a centered 4-column grid (max-width 720, `justify-content:
   center`).
3. **Deck edit (pencil) button fixed.** `.deck-card-rename-btn`'s styles lived in the retired
   `DeckCard.css`, leaving a bare white button on the deck page. Restyled in `DeckDetail.css` as a
   small ghost icon button (STROKE border, teal on hover).
4. **Per-deck card search.** `CardList` gained a search field that filters the deck's cards by their
   field text (question/answer/extras), with a live "N / total" count and a "no matches" empty state.
5. **Collapsible sidebar.** The rail collapses/expands via a chevron toggle (state persisted in
   localStorage); a floating reopen button appears in the main area when collapsed.
6. **Sidebar chrome.** The "SEKEL" text wordmark is replaced by the SEKEL logo image, and the tier
   (DEDICATED/FREE) card above the identity footer was removed. (`useTier` is retained for the
   AI-surface UPGRADE path but no longer drives sidebar chrome.)
