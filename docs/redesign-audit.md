# SEKEL "Ink v2" UI Redesign — Audit & Delta Map

> **Status:** Implementation is already underway. This document is the **canonical audit + delta reference** for the redesign — the frozen record of what the renderer looks like today (Steps 1–2 of the redesign plan) and exactly how each surface maps onto the *Ink v2* design system defined in `DESIGN-SPEC.md`. When code and this doc disagree, `DESIGN-SPEC.md` is the source of truth for the target; this doc is the source of truth for the *delta*.

**Scope:** `apps/desktop/src` (Electron renderer) + `packages/components/src` (shared `@sekel/components`). All paths absolute-from-repo-root. Router is `createMemoryRouter` (no URL routing); no `framer-motion` (all motion is CSS).

**Contents**
1. [Screen / route inventory](#1-screen--route-inventory)
2. [Component inventory](#2-component-inventory)
3. [Style inventory](#3-style-inventory)
4. [Interaction inventory](#4-interaction-inventory)
5. [Delta map (old → new)](#5-delta-map-old--new) — **the core artifact**
6. [Uncovered-screen v2 treatments](#6-uncovered-screen-v2-treatments)

---

## 1. Screen / route inventory

### 1.1 Routes — children of `AppLayout` at `path: '/'`

| Route | Component | File | Purpose |
|---|---|---|---|
| `/` (index) | `Dashboard` | `apps/desktop/src/components/Dashboard/Dashboard.tsx` | Home: due/activity/streak/exam stat cards, intelligence panel, plan overview, deck health, exam readiness, quick actions |
| `/plan` | `PlanPage` | `apps/desktop/src/components/Plan/PlanPage.tsx` | Study-plan hub: active plan, create panel, all-plans list, history (multiple inline full-page states) |
| `/decks` | `DeckList` | `apps/desktop/src/components/Deck/DeckList.tsx` | Deck grid; bulk-delete mode; empty state |
| `/decks/:deckId` | `DeckDetail` | `apps/desktop/src/components/Deck/DeckDetail.tsx` | Deck header + stats bar + card list; study/review/add actions |
| `/decks/:deckId/study` | `StudySession` | `apps/desktop/src/components/Study/StudySession.tsx` | Review loop: card viewer, timer, rating (wrapped in inline `ErrorBoundaryRoute`) |
| `/documents` | `DocumentsPage` | `apps/desktop/src/components/AIStudy/DocumentsPage.tsx` | AI pipeline: upload → analyze → generate. Route element is `null`; page is **always-mounted** in `AppLayout`, shown/hidden by CSS so generated cards survive nav |
| `/drafts` | `DraftsPage` | `apps/desktop/src/components/Drafts/DraftsPage.tsx` | AI draft cards: promote / delete / clear |
| `/image-occlusion` | `ImageOcclusionEditor` | `apps/desktop/src/components/ImageOcclusion/ImageOcclusionEditor.tsx` | Draw occlusion masks, generate cards (wrapped in inline `ErrorBoundaryRoute`) |
| `/statistics` | `StatisticsPage` | `apps/desktop/src/components/Statistics/StatisticsPage.tsx` | Tabbed stats (overview / cards / reviews) |
| `/admin` | `AdminDashboard` | `apps/desktop/src/components/Admin/AdminDashboard.tsx` | Admin diagnostics (overview/users/feedback/metrics); nav item **admin-gated** |
| `/profile` | `UserProfilePage` | `apps/desktop/src/components/Profile/UserProfilePage.tsx` | Avatar header + tabbed settings sections → **maps to spec §7.4 Settings** |
| `*` | `<Navigate to="/" replace />` | — | Catch-all → Dashboard |

### 1.2 Shell / navigation — `apps/desktop/src/router/AppLayout.tsx`

| Element | File | Role |
|---|---|---|
| `AppLayout` | `router/AppLayout.tsx` | Shell: `HeaderBar` + `RebalanceBanner` + `main` + `OnboardingTour` + `UpdateAvailableModal`; optional profile background; wraps `DeckEditorProvider`; runs onboarding-trigger + profile-fetch effects |
| `HeaderBar` | `router/AppLayout.tsx` | Logo, `NavBar`, "New Deck" CTA (opens `DeckEditor` via context), `UserProfile` widget |
| `NavBar` | `router/AppLayout.tsx` | **Top nav** buttons: dashboard, plan, decks, documents ("generate"), image-occlusion, drafts (unread badge), statistics, admin (conditional). `data-testid="nav-*"` |
| `RebalanceBanner` | `router/AppLayout.tsx` | Dismissable banner when plan is behind pace (extend timeline / got it) |
| `UserProfile` | `apps/desktop/src/components/UserProfile.tsx` | Compact header avatar + icon sign-out (inline widget, not page/overlay) |

### 1.3 Pre-auth screens — outside the router, gated by `ProtectedRoute`

| Component | File | Kind |
|---|---|---|
| `ProtectedRoute` | `apps/desktop/src/components/Auth/ProtectedRoute.tsx` | Auth gate → loading-screen / reset form / auth page / children |
| `AuthPage` | `apps/desktop/src/components/Auth/AuthPage.tsx` | Container switching login/signup/forgot |
| `LoginForm` | `apps/desktop/src/components/Auth/LoginForm.tsx` | Email/password login |
| `SignupForm` | `apps/desktop/src/components/Auth/SignupForm.tsx` | Signup + email-confirmation |
| `ForgotPasswordForm` | `apps/desktop/src/components/Auth/ForgotPasswordForm.tsx` | Reset-request form |
| `ResetPasswordForm` | `apps/desktop/src/components/Auth/ResetPasswordForm.tsx` | Set new password (recovery) |

### 1.4 Conditional full-screen views (not their own route)

| Component | File | Rendered by |
|---|---|---|
| `SessionAnalytics` | `apps/desktop/src/components/UI/SessionAnalytics.tsx` | `StudySession` (session-complete state) |
| `CreatePlanPanel` / `AllPlansPanel` / `NoPlansState` | `apps/desktop/src/components/Plan/PlanPage.tsx` (internal) | `PlanPage` — each returns its own `.plan-page` root |

### 1.5 Inline embedded content blocks (part of a screen — not overlays/routes)

| Component | File | Host screen |
|---|---|---|
| `SekelIntelligencePanel` + `IntelligenceHiddenBar` | `Dashboard/SekelIntelligencePanel.tsx` | Dashboard |
| `MissedTopicsBreakdown` | `Statistics/MissedTopicsBreakdown.tsx` | StatisticsPage (Cards tab) |
| `DocumentUpload` | `AIStudy/DocumentUpload.tsx` | DocumentsPage |
| `AICardGenerator` | `AIStudy/AICardGenerator.tsx` | DocumentsPage |
| `CardList` / `CardViewer` | `Card/CardList.tsx`, `Card/CardViewer.tsx` | DeckDetail / StudySession |
| `DeckCard` | `Deck/DeckCard.tsx` | DeckList grid |
| `ProfileTab` / `StudyTab` / `PreferencesTab` / `AccountTab` / `BackupTab` | `Profile/sections/*.tsx` | UserProfilePage tabs |
| Study widgets `RatingButtons` / `StudyTimer` / `YieldBadge` / `UrgencyChip` | `Study/*.tsx` | StudySession / DeckDetail |
| Charts `RatingDistributionChart` / `RetentionTrendChart` / `LapseStatsChart` | `UI/charts/*.tsx` (**orphaned dupes** — see §5b) | StatisticsPage |
| `ReviewHeatmap` | `Dashboard/ReviewHeatmap.tsx` (**orphaned dupe**) | Dashboard/Stats |
| `RichTextEditor` / `ImageUpload` | `UI/*.tsx` | Editors / profile |

### 1.6 Modals / dialogs / overlays / slide-in panels

Base primitive: **`Modal`** (`packages/components/src/ui/Modal.tsx`) — portal to `document.body`, `role="dialog"` + `aria-modal`, Escape-to-close, backdrop-click close, body-scroll lock, `X` button, `size` sm/md/lg/xl.

| Component | File | Purpose | Overlay mechanism |
|---|---|---|---|
| `NoteEditor` | `Card/NoteEditor.tsx` | Add/edit card (front/back rich text, cloze, occlusion) | `Modal` |
| `DeckEditor` | `Deck/DeckEditor.tsx` | Create/rename deck (header CTA + DeckList + DeckDetail) | `Modal` (name `autoFocus`) |
| `ExportModal` | `Deck/ExportModal.tsx` | Deck export (format + media) | `Modal` (heavy inline styles) |
| DeckList delete-confirm | `Deck/DeckList.tsx` (inline) | Bulk-delete + affected-plans warning | `Modal` |
| DeckDetail delete-all-confirm | `Deck/DeckDetail.tsx` (inline) | Delete all cards | **bespoke** `.modal-overlay` |
| CardList delete-confirm | `Card/CardList.tsx` (inline) | Delete single card | `Modal` |
| `SessionModeBriefing` | `Deck/SessionModeBriefing.tsx` | Pre-session urgency/mode (dismiss → localStorage) | **bespoke** `.session-briefing-overlay` |
| `PreSessionBriefing` | `Dashboard/PreSessionBriefing.tsx` | Today's brief + deck picker → focused session | **bespoke** `.presession-overlay` |
| `FeedbackSection` | `Profile/FeedbackSection.tsx` | Feedback form (type/summary/areas/screenshot) | `Modal` (heavy inline styles) |
| `ExamOnboardingModal` | `ExamOnboarding/ExamOnboardingModal.tsx` | Multi-step exam setup wizard | `Modal` |
| `UpdateAvailableModal` | `Update/UpdateAvailableModal.tsx` | App-update dialog + release notes + install | `Modal` (mounted in `AppLayout`) |
| `ImportOptionsModal` | `Import/ImportOptionsModal.tsx` | Anki import config (deck tree, scheduling, conflict) | `Modal` |
| `ImportProgressModal` | `Import/ImportProgressModal.tsx` | Import progress + cancel | **bespoke** portal `.modal-overlay` |
| `ImportSuccessModal` | `Import/ImportSuccessModal.tsx` | Import summary | `Modal` |
| `ImportErrorModal` | `Import/ImportErrorModal.tsx` | Import failure/cancel + retry | `Modal` |
| `ImportAnkiButton` | `Deck/ImportAnkiButton.tsx` | Orchestrates the 4 import modals (inline trigger) | — |
| `DraftTray` | `Drafts/DraftTray.tsx` | Slide-in tray of draft cards | **bespoke** `.draft-tray-overlay` + `<aside>` |
| `WelcomeSlides` | `Onboarding/WelcomeSlides.tsx` | Welcome carousel | **bespoke** `.onboarding-overlay` |
| `TourCard` | `Onboarding/TourCard.tsx` | Positioned tour-step coach-mark + dots | **bespoke** floating card |
| `Spotlight` | `Onboarding/Spotlight.tsx` | Dimmed backdrop + spotlight ring | **bespoke** `.onboarding-spotlight-layer` |
| `SkipConfirm` | `Onboarding/OnboardingTour.tsx` | Skip-tour confirm | **bespoke** overlay |
| `OnboardingTour` | `Onboarding/OnboardingTour.tsx` | Phase orchestrator (slides/tour/skip/resume) + Esc | fragment of the above |
| Nested profile modals | `Profile/sections/AccountTab.tsx`, `StudyTab.tsx`, `BackupTab.tsx` | Password change, delete-account, time-travel, restore-from-backup | `Modal` (internal) |

**Modal drift:** 1 shared `Modal` + **8 bespoke overlays** (ImportProgress, DeckDetail delete, PreSessionBriefing, SessionModeBriefing, WelcomeSlides, SkipConfirm, TourCard, DraftTray) that share no base.

---

## 2. Component inventory

**Totals:** 79 component files (18 shared + 61 desktop-local); visual count ~110. 9 distinct modal implementations; ~20 distinct badge/chip implementations (1 shared primitive `MetaChip`); 3 real `<table>` families + 2 div-grid table-likes. **`index.css` carries two overlapping token vocabularies** (`--ink/--fog/--teal/--mist/--slate` *and* `--bg/--primary/--danger/--muted/--border`); shared charts use the first, orphaned desktop `UI/charts/*` copies use the second.

### 2.1 Shared primitives — `packages/components/src/ui/`

| Component | File | Pattern | Key variants/props | Flag |
|---|---|---|---|---|
| **Button** | `ui/Button.tsx` | button | `variant` primary/secondary/danger/ghost/icon; `size` sm/md/lg; `isLoading`,`icon`,`fullWidth` | canonical target |
| **Input** | `ui/Input.tsx` | input/textarea (via `multiline`) | `label`,`error`,`rows` | target |
| **Select** | `ui/Select.tsx` | dropdown | `options[]`,`label`,`error`,`placeholder` | target |
| **Modal** | `ui/Modal.tsx` | portal modal | `isOpen`,`onClose`,`title`,`footer`,`size`; Esc + scroll-lock | canonical target |
| **Loader** | `ui/Loader.tsx` | spinner | `size`,`center`,`text` | — |
| **YouTubeIcon** | `ui/Icons.tsx` | SVG icon | `size`,`color` | — |
| **MetaChip** | `ui/MetaChip.tsx` | chip/badge | `label`,`value` | 🟥 **solid fill** (`background: var(--ink-muted)`) |
| **Tabs/TabList/Tab/TabPanel** | `ui/Tabs.tsx` | compound tabs (arrow-key a11y) | `defaultTab`,`Tab.id`,`TabPanel.id` | canonical target |
| **ToggleSwitch** | `ui/ToggleSwitch.tsx` | toggle (`role=switch`) | `checked`,`onChange`,`disabled` | canonical target |

### 2.2 Shared charts — `packages/components/src/charts/` (live consumers use THESE)

| Component | Pattern | Flag |
|---|---|---|
| RetentionTrendChart | line (recharts) | — |
| RatingDistributionChart | horizontal bar | — |
| LapseStatsChart | stat + list rows | — |
| TimePerCardChart | chart | — |
| MissRateTrendChart | trend | — |
| CardCountsPieChart | donut + legend | — |
| **ReviewHeatmap** | SVG calendar heatmap | 🟥 contiguous grid |
| **TodaySummaryCard** | card + stat grid + pills | 🟥 shadowed card (`--shadow-sm`) |
| **RetentionTable** | real `<table>` in shadowed card | 🟥 contiguous table + shadow |

### 2.3 Desktop-local — grouped by pattern

**Buttons.** `RatingButtons` (`Study/RatingButtons.tsx`, wraps shared `Button variant=ghost`). Raw `.btn` users bypassing the primitive: `Profile/sections/ProfileTab.tsx`, `Auth/AuthPage.tsx`, `UI/ErrorBoundary.tsx`, `Deck/SessionModeBriefing.tsx`, `Plan/PlanPage.tsx` (pervasive), `Admin/AdminDashboard.tsx`, `Deck/DeckCard.tsx`, `Dashboard/Dashboard.tsx` (`db-action-btn`). → unify on shared `Button`.

**Modals — 9 implementations.** Shared `Modal` used by ExportModal, ImportError/Options/Success, ExamOnboarding, UpdateAvailable, DeckEditor, NoteEditor, CardList/DeckList delete-confirm, FeedbackSection, AccountTab×2, BackupTab, StudyTab. 🟥 Bespoke: `ImportProgressModal`, `DeckDetail` delete-confirm, `PreSessionBriefing`, `SessionModeBriefing` (shadowed; hardcoded English — i18n gap), `WelcomeSlides`, `SkipConfirm`, `TourCard` (shadowed floating), `DraftTray` (shadowed panel).

**Badges/chips — ~20 families, 1 shared primitive.** `MetaChip` (🟥 solid), `UrgencyChip` (🟥 solid-ish), `YieldBadge` (translucent tinted + tooltip), `.intelligence-focus-chip`, `.stat-pill` (DeckDetail, 🟥 filled), `.intel-panel__exam-chip`/`.intel-section-label--*`, Dashboard `.db-deck-row__pill--*`/`.db-readiness-row__indicator--*` (🟥), PlanPage `.plan-yield-chip`/`.plan-status-pill`/`.plan-scope-badge`/`.plan-list-badge`/`.plan-sys-card__status` (🟥 many filled), StudyTab `.fsrs-deck-badge` (🟥 solid on/off), ImportOptions `SummaryChip`/`.import-conflict-badge`, TodaySummaryCard `.today-breakdown-pill`, AI `.ai-format-pill` (translucent, doubles as toggle), DraftTray `.draft-tray-badge` (🟥 solid count), `.draft-capacity`, ImageOcclusion `.shape-group-badge`.

**Tables.** `RetentionTable` (shared, 🟥 `<table>`), `AdminDashboard` (🟥 multiple `admin-table` + icon tabs), PlanPage `.plan-preview-table` (🟥), Dashboard `.db-readiness-table` (div-grid table-like), BackupTab bordered scroll list (div table-like).

**Cards (surface/shadowed).** `DeckCard` (🟥 + kebab), `CardViewer` (3 modes), `CardList` items, Dashboard `StatCard`/`.db-card`, `PreSessionBriefing` insight cards, PlanPage `.plan-card`/`.plan-sys-card`/`.plan-week-card`/`.plan-list-card`, Admin `.admin-stat-card`/`.admin-feedback-card`, DraftsPage `.draft-card` (🟥 hover shadow), Onboarding slides/tour cards (🟥 shadow), Auth `.auth-container` (🟥 `0 10px 30px`).

**Tabs.** Shared `Tabs`: StatisticsPage, AdminDashboard (🟥 icon tabs), UserProfilePage. 🟥 Custom: PlanPage `.plan-activity-tabs` (manual role=tablist), ImageOcclusion mask/fields view-switch toolbar.

**Toggles/checkboxes.** Shared `ToggleSwitch`: ExportModal, PreferencesTab×2, StudyTab×4. Competing: DeckCard `.checkbox-custom`, ExamOnboarding `.exam-deck-checkbox` rows, SessionModeBriefing raw checkbox, PlanPage DeckPicker raw checkboxes, ImportOptions raw checkboxes + hierarchy toggle-buttons, AI `.ai-format-pill` Set toggle, PreferencesTab `.theme-swatch` (🟥 solid color chips).

**Toast.** `UI/Toast.tsx` — `ToastProvider`/`useToast`, variants success/error, auto-dismiss 4s.

**Inputs/forms/sliders/steppers/progress.** `RichTextEditor` (Quill), `ImageUpload`, `DocumentUpload` (drag-drop + URL), Auth forms, PlanPage 🟥 range slider `.plan-slider`, native date/number/time inputs (StudyTab/ExamOnboarding/PlanPage), ExamOnboarding 3-step stepper, DocumentsPage `.pipeline-stepper`, Onboarding progress dots, progress bars (ImportProgress, Dashboard `db-plan-progress-bar`, PlanPage `plan-progress-*`, Intelligence `intel-system-row__bar`).

**Nav / icon-nav / dropdowns.** 🟥 DeckCard `MoreVertical` kebab, 🟥 UserProfile icon nav + icon sign-out, 🟥 StudyTab `.fsrs-dropdown-*` menu, 🟥 Dashboard `.db-action-btn` icon grid, ImageOcclusion `.occlusion-tool-btn` toolbar.

**Canvas/editors.** ImageOcclusionEditor (SVG rect/ellipse/polygon), NoteEditor (Modal + RichTextEditor + occlusion SVG), RichTextEditor (Quill), CardViewer (3 modes + cloze/occlusion overlay).

**Providers/guards.** `ThemeProvider` (themes: dark/light/system/red/purple/pink/turquoise), `ProtectedRoute`, `ErrorBoundary` (raw `.btn`), `DeckEditorProvider`.

---

## 3. Style inventory

### 3.1 Where styles live — four layers, no CSS-in-JS

1. **Global entry** — `apps/desktop/src/index.css` (**1,425 lines**), imported once in `renderer.tsx`. Holds `:root` tokens, all theme classes, app shell, and shared component classes (`.btn`, `.modal`, `.deck-card`, `.rating-btn`, forms). Primary token source; uses `box-shadow` in base.
2. **Co-located component CSS** — 32 files in the desktop app, one per major component/page.
3. **Shared-package CSS** — `packages/components/src`; each component imports its `.css` which `@import '../components.css'`. **`components.css` re-declares the entire `:root` token block** — a second source of truth.
4. **Inline `style={{}}`** — **223 occurrences across 31 `.tsx` files** (heaviest: `StudyTab.tsx` 32, `PreferencesTab.tsx` 23, `FeedbackSection.tsx` 22, `AccountTab.tsx` 20, `BackupTab.tsx` 19, `ExportModal.tsx` 14, `NoteEditor.tsx`/`DocumentsPage.tsx` 13). Largest un-tokenized surface and carrier of most TSX color literals.

> **CRITICAL — two divergent token sources.** `index.css` and `packages/components/src/components.css` both declare the full `:root`, with the **same legacy values**. Worse, the shared package's light theme keys off `[data-theme="light"]` while the app toggles the `.light` **class** — so shared light mode never activates from the app toggle. **A v2 retheme must edit both files and reconcile the light selector.**

### 3.2 Fonts (current → v2 in §5c)

Loaded from **Google Fonts CDN** in `apps/desktop/index.html`: **DM Serif Display** (display), **Outfit** (body), **DM Mono** (mono). Token usage is good (`--font-mono` ×82, `--font-body` ×54, `--font-display` ×33). Strays: `'Inter', sans-serif` hardcoded in `Profile/UserProfilePage.css:5`; `Arial` in `main/export/builder.ts` (Anki export CSS — leave). Weights collapse to 400/500/600/700/800 (600 dominant). **~45 distinct font sizes** (`rem` and `px` intermixed, no scale token).

### 3.3 Color literal inventory

**Totals:** 89 distinct hex literals / 292 occurrences; 79 distinct rgb(a) / 147 occurrences. Top files: `index.css` (89 hex), `Plan/PlanPage.css` (37), `Dashboard/SekelIntelligencePanel.css` (28), `pkg/components.css` (23), `Deck/SessionModeBriefing.css` (10), `Profile/sections/PreferencesTab.tsx` (8), `UI/Toast.css` (7). **203 hex occurrences live outside `index.css`.**

Current `:root` token groups (`index.css`): Fonts (`--font-display/body/mono`); Dark surfaces (`--ink #0F1117`, `--ink-soft #1C2030`, `--ink-muted #2E3348`, `--slate #4A5270`, `--mist #8B93A8`, `--fog #BEC5D4`); Light surfaces (`--cloud #E8ECF4`, `--paper #F4F6FB`, `--white #FFFFFF`); Accents (`--teal #2BBFA4`, `--amber #F0A500`, `--rose #E05C6A`, `--violet #7C6EF5`, each +soft/border/glow); Spacing (`--space-xs..3xl`); Radii (`--r-sm 6`,`--r-md 12`,`--r-lg 20`,`--r-xl 28`); Shadows (`--shadow-sm/md/lg`); Compat aliases (`--bg`,`--primary`=teal,`--primary-hover #24a98f`,`--success #22c55e`,`--warning`=amber,`--danger`=rose,`--card-gradient-end #1a1f2e`). The full literal → v2 mapping is in **§5a**.

Alternate theme classes in `index.css`: `.light`, `.red`, `.purple`, `.pink`, `.turquoise` (full "Color Wave" palettes) + visual-card-size classes `.vcs-compact/default/large/full`.

---

## 4. Interaction inventory

### 4.1 Keyboard listeners — in-renderer

| File | Location | Keys → action |
|---|---|---|
| `Study/StudySession.tsx` | L162–177 `document` keydown | `Space` → reveal/unreveal. Ignored in INPUT/TEXTAREA/SELECT; `preventDefault` |
| `Study/StudySession.tsx` | L391 region `onKeyDown` | `Enter` → reveal (region `role=button tabIndex=0`) |
| `Card/CardViewer.tsx` | L234/263/297 | `Enter` → flip; `preventDefault`; faces `role=button tabIndex=0` |
| `ImageOcclusion/ImageOcclusionEditor.tsx` | L306–314 `window` | `Escape` → cancel in-progress polygon |
| `ImageOcclusion/ImageOcclusionEditor.tsx` | L431–438 `window` | `Delete`/`Backspace` → delete selected shapes |
| `Onboarding/OnboardingTour.tsx` | L59–67 `document` | `Escape` → request skip (slides/tour phase); `preventDefault` |
| `packages/components/src/ui/Modal.tsx` | L20–33 `document` | `Escape` → `onClose` (every Modal); sets `body.overflow=hidden` |
| `Deck/DeckCard.tsx` | L112–116 | `Enter`/`Space` → open/toggle select; `preventDefault` |
| `Deck/DeckCard.tsx` | L144–147 rename input | `Enter` commit / `Escape` cancel |
| `AIStudy/AICardGenerator.tsx` | L504 preview field | `Enter`/`Space` → inline edit; `preventDefault` |
| `AIStudy/DocumentUpload.tsx` | L123–124 URL input | `Enter` → import from URL |
| `UI/SessionAnalytics.tsx` | L104–106 name input | `Enter` create / `Escape` cancel |

**Native menu accelerators** (`apps/desktop/src/menu.ts` → renderer via `webContents.send`): `CmdOrCtrl+Shift+B` Create Backup, `CmdOrCtrl+Shift+T` Replay Tour, `CmdOrCtrl+=`/`-` Zoom (scales whole renderer; distinct from `visual_card_size`), plus standard roles and `File → Restore from Backup…`.

### 4.2 Transitions / animations

- **No `framer-motion`** — all motion CSS. 116 `transition:`/`animation:` decls across 27 CSS files (heaviest: `PlanPage.css` 14, `SekelIntelligencePanel.css` 10, `OnboardingTour.css` 10, `index.css` 8, `DeckDetail.css` 8, `UserProfilePage.css` 8).
- **11 `@keyframes`:** `spin` (loaders ×3 files), `pulse` (CardViewer), `onboarding-fade-in`/`onboarding-rise`, `fadeIn` (DocumentsPage), `ai-progress-slide`, `intel-fade-in`, `toast-slide-in`, `slideInRight` (DraftTray), `timer-pulse`.
- **Signature motion:** 3D card flip — `Card/CardViewer.css:246` `transform 0.6s cubic-bezier(0.4,0,0.2,1)` on `.flashcard-flipper` + `backface-visibility:hidden`. Animated mode only.
- **Reduced motion:** only ONE `@media (prefers-reduced-motion: reduce)` guard exists (`SekelIntelligencePanel.css:19`). **All other animations unguarded — redesign gap** (spec §8 requires global honoring).

### 4.3 Focus treatments

- 27 `:focus`/`:focus-visible`/`outline` occurrences across 14 CSS files. Consistent `outline: 2px solid var(--teal)` on `.nav-link`, `.recent-deck-item`, `.deck-card`, `.flashcard-container`, `.study-content`, `.action-link`, `.ai-card-field-preview`. Many `outline: none` resets on inputs.
- `autoFocus`: ResetPasswordForm, AICardGenerator (inline edit), DeckCard (rename), DeckEditor (name), PlanPage (override), SessionAnalytics (missed-deck name).
- `role="dialog"`/`aria-modal`: Modal, WelcomeSlides, TourCard, SkipConfirm, ImportProgressModal.
- **No JS focus trap anywhere.** Modal handles Esc + backdrop + scroll-lock only — no Tab trap, no focus restore on close. **Accessibility gap** vs spec §8.

### 4.4 Toast / notification pattern

- `UI/Toast.tsx` — `ToastProvider` + `useToast()` → `showToast(message, variant?)`. Variants `success` (`CheckCircle`) / `error` (`AlertCircle`). **Auto-dismiss 4000ms**; manual `X`. Container `role="status" aria-live="polite"`; entrance `toast-slide-in`.
- **59 `showToast(...)` call-sites across 19 files** (StudyTab 9, BackupTab 7, FeedbackSection 6, AccountTab 6, then AI/Plan/Study/Preferences ≤3 each).
- Categories: errors (delete/create/generate/upload/validation failures), successes (exported/deleted/saved/restored/created), study auto-timer (auto-flip success, auto-grade "Again" error).

---

## 5. Delta map (old → new)

*v2 tokens (canonical hex):* INK `#0F1117` · TEAL `#2BBFA4` · SLATE `#4A5270` · MIST `#8B93A8` · FOG `#C3C9D6` · CLOUD `#E6E9F0` · PAPER `#F7F8FA` · AMBER `#E8A33D` · ROSE `#E05C5C` · VIOLET `#8C7BE8` · SIDE `#0D1019` · PANEL `#151A26` · PANEL-2 `#1B2130` · STROKE `#232838` · NAV-ACTIVE `#161C2A` · PANEL-3 `#12161F`.

### 5a. Color delta

**A — already canonical (no change).**

| Literal | Count | v2 token | Note |
|---|---|---|---|
| `#0F1117` | 6 | **INK** | ✅ exact |
| `#2BBFA4` | 2 | **TEAL** | ✅ exact — do not touch |
| `#4A5270` | 2 | **SLATE** | ✅ exact |
| `#8B93A8` | 2 | **MIST** | ✅ exact |

**B — token near-misses (UPDATE the token value in *both* `index.css` and `components.css`).** 🔶 = flagged near-miss.

| Literal | Count | v2 token → value | Action | Flag |
|---|---|---|---|---|
| `#BEC5D4` | 2 | **FOG** → `#C3C9D6` | bump `--fog` | 🔶 old fog |
| `#E8ECF4` | 4 | **CLOUD** → `#E6E9F0` | bump `--cloud` (+ light `--ink-muted`) | 🔶 old cloud |
| `#F4F6FB` | 4 | **PAPER** → `#F7F8FA` | bump `--paper` (+ light `--ink-soft`) | 🔶 old paper |
| `#1C2030` | 4 | **PANEL-2** `#1B2130` | remap `--ink-soft` → PANEL-2 | 🔶 near-ink panel |
| `#2E3348` | 2 | **STROKE** `#232838` | reconcile `--ink-muted` → STROKE/PANEL | 🔶 near-ink panel |
| `#1A1F2E` | 2 | **PANEL** `#151A26` | retire literal (`--card-gradient-end`, CardViewer) | 🔶 near-ink panel |
| `#0A0E1A` | 6 | **SIDE** `#0D1019` | remap sidebar/ink literal | 🔶 near-ink panel |
| `#0E141B` | 1 | **SIDE** `#0D1019` | dashboard gradient → SIDE | 🔶 near-ink |
| `#1E1E2E` | 1 | **PANEL** `#151A26` | component surface → PANEL | 🔶 near-ink |
| `#8892A4` | 23 | **MIST** `#8B93A8` | replace with `--mist` | 🔶 legacy gray, off-by-a-hair from MIST |

> Note: instruction also flags `#8892A4`/`#9BA0A8`/`#888`/`#666` as **RETIRE** — treat identically: retire the literal, collapse into the neutral ramp (MIST for `#8892A4`/`#9BA0A8`, SLATE for `#888`/`#666`). See Section E.

**C — legacy accent literals (RETIRE the literal → v2 token or reroute).** 🔶 = near-miss to bump; ❌ = no v2 equivalent, semantic reroute.

| Literal | Count | What it is | v2 action | Flag |
|---|---|---|---|---|
| `#F59E0B` | 29 | Tailwind amber-500 (old warning) | → **AMBER** `#E8A33D` | 🔶 near-miss |
| `#F0A500` | 2 | current `--amber` value | bump `--amber` → **AMBER** `#E8A33D` | 🔶 near-miss |
| `#B45309` | 2 | amber-700 dark | → **AMBER** derived (`color-mix`) | 🔶 |
| `#EF4444` | 25 | Tailwind red-500 (old danger) | → **ROSE** `#E05C5C` | 🔶 near-miss |
| `#DC2626` | 5 | red-600 (danger hover) | → **ROSE** derived hover | 🔶 |
| `#E05C6A` | 2 | current `--rose` value | bump `--rose` → **ROSE** `#E05C5C` | 🔶 near-miss |
| `#8B5CF6` | 4 | violet-500 (also purple theme) | → **VIOLET** `#8C7BE8` | 🔶 near-miss |
| `#7C6EF5` | 2 | current `--violet` value | bump `--violet` → **VIOLET** `#8C7BE8` | 🔶 near-miss |
| `#7C3AED` | 1 | violet-600 (purple-theme hover) | theme-scoped → VIOLET derived | 🔶 |
| `#22C55E` | 34 | green-500 "success" (**top literal**) | ❌ **RETIRE** — no v2 green; positive/success → **TEAL** | ❌ retire |
| `#16A34A` | 3 | green-600 (light success) | ❌ **RETIRE** → **TEAL** | ❌ retire |
| `#2E7D32` | 1 | material green | ❌ **RETIRE** → **TEAL** | ❌ retire |
| `#3B82F6` | 13 | blue-500 (**+22 rgba = ~35 refs**) | ❌ **RETIRE** — not in v2; info → **TEAL** or **VIOLET** per meaning | ❌ retire |
| `#2563EB` | 1 | blue-600 | ❌ **RETIRE** → TEAL/VIOLET | ❌ retire |
| `#FF0000` | 1 | YouTube brand red (icon) | **KEEP** (brand asset, not UI chrome) | keep |

**D — theme-wave literals (intentional; regenerate from v2, not "legacy remnants").** Scoped to `.red/.purple/.pink/.turquoise/.light` in `index.css`. Includes blues `#06B6D4`/`#0891B2` (turquoise) and pinks `#EC4899`/`#DB2777` (pink) — per instruction, blues and pinks **RETIRE** in the default (dark) UI; they survive **only** inside their theme scope. Theme accent hexes also **leak** into `Profile/sections/PreferencesTab.tsx` swatches (`#06B6D4 #EC4899 #8B5CF6 #E05252 #0F1117`) — de-dupe these against the theme definitions.

**E — neutrals, grays & derived (tokenize or RETIRE).**

| Literal | Count | v2 action |
|---|---|---|
| `#FFFFFF` / `#FFF` | 12 / 8 | → **PAPER** `#F7F8FA` (toggle knobs, text-on-teal is INK) |
| `#E2E8F0` | 8 | → **CLOUD**/**FOG** (light border) |
| `#E0E0E0`, `#E5E7EB`, `#D1D5DB`, `#D1D5E0`, `#EEE` | 1–2 each | light grays → **CLOUD**/**FOG** |
| `#9CA3AF`, `#6B7280`, `#374151`, `#1F2937`, `#111827` | 1–3 each | Tailwind slate/gray — several are legit `.light` token values; ad-hoc rest → neutral ramp (**SLATE/MIST/FOG**) |
| `#9BA0A8` | 1 | ❌ **RETIRE** gray → **MIST** |
| `#888` / `#666` / `#555` / `#333` | 4/1/1/1 | ❌ **RETIRE** ad-hoc grays → **SLATE** (`#888`/`#666`) / darker neutrals |
| `#24A98F` | 2 | KEEP as derived TEAL hover (`--primary-hover`) — express via brightness/`color-mix` off TEAL |
| `#1E9480` | 1 | derived teal hover → `color-mix` off **TEAL** |
| `#C94D5A`, `#B04350` | 1 each | darkened rose hover → `color-mix` off **ROSE** |

**rgba families (147 occ.) — quick map.**

| Family | Count | v2 action |
|---|---|---|
| Ink shadows `rgba(15,17,23,…)` | ~15 | KEEP — shadow basis matches INK |
| Black overlays `rgba(0,0,0,…)` | ~24 | tokenize as overlay/scrim tokens (0.06–0.7) |
| White overlays `rgba(255,255,255,…)` | ~8 | light scrims/borders → PAPER-derived |
| Teal `rgba(43,191,164,…)` | 9 | ✅ KEEP — token-derived (soft/border/glow) |
| Blue `rgba(59,130,246,…)` | 22 | ❌ **RETIRE** with `#3B82F6` |
| Green `rgba(34,197,94,…)` +`rgba(20,184,166,…)` | 7 + 2 | ❌ **RETIRE** with greens → TEAL |
| Amber `rgba(245,158,11,…)` +`rgba(240,165,0,…)` | 5 + 3 | → **AMBER** soft (accent @14–18%) |
| Red/Rose `rgba(239,68,68/220,38,38/224,92,106,…)` | 6/3/2 | → **ROSE** soft only |
| Violet `rgba(124,110,245/139,92,246,…)` | 2 / 2 | → **VIOLET** soft |
| Indigo fallback `rgba(var(--accent-rgb,99,102,241)…)` | 2 + 3 | ❌ change default `99,102,241` → **teal `43,191,164`** (custom-bg channel system) |
| Mist/Slate `rgba(139,147,168/74,82,112,…)` | 2 / 2 | token-derivable from MIST/SLATE |

**Chip/badge rule (spec §2.3):** tinted chips = accent @14–18% bg + full-strength accent text; the rgba accent families above become the `-soft` fills. Only the primary teal button and active-deck due pills are solid-filled.

### 5b. Component delta

| Current pattern | Where | v2 counterpart | Pattern-level change |
|---|---|---|---|
| **Icon top-nav** (`NavBar` buttons, `data-testid=nav-*`) | `router/AppLayout.tsx` | **260px SIDE sidebar** (spec §5.1) | Horizontal icon bar → vertical dot-bullet nav: 6px dot + label, radius 10; inactive SLATE dot/MIST label, active NAV-ACTIVE bg + TEAL dot + PAPER label. Adds contextual DECKS section + bottom tier card |
| **Solid-fill badges** | `MetaChip`, `UrgencyChip`, DeckDetail `.stat-pill`, `fsrs-deck-badge`, `draft-tray-badge`, PlanPage status/yield chips, Dashboard pills, PreferencesTab theme swatches | **Tinted chip** (§6 Chip) | Solid fill → accent @14–18% bg + full-strength text, Inter 700 10px, radius 8. Count triad enforced: New VIOLET · Learning AMBER · Due TEAL; zeros SLATE |
| **Shadowed cards** | shared `TodaySummaryCard`/`RetentionTable`; `Auth.container`; DraftsPage `.draft-card`; Onboarding slides/tour; SessionModeBriefing | **1px STROKE panels** | Drop `box-shadow`; every panel/row = 1px STROKE, radius 14. Only exceptions: study card (`0 12px 40px rgba(0,0,0,.4)`) + toasts. Feature panels (Plan/AI) → teal border @45% |
| **Contiguous/bordered tables** | shared `RetentionTable`, `AdminDashboard` admin-tables, PlanPage `.plan-preview-table` | **Gapped row-cards** (§6 Table) | `border-collapse` grid → uppercase SLATE column-header row (no bg) + each row a separate PANEL card, radius 12, 10px gap; fixed columns, name flexes |
| **Hidden-until-reveal rating buttons** | `Study/RatingButtons.tsx` in `StudySession` | **Always-visible, disabled pre-reveal** | Buttons always rendered below card (zero layout shift), dimmed/disabled pre-reveal, enabled post-`Space`. Outlined accent-tinted: Again ROSE · Hard AMBER · Good TEAL · Easy VIOLET; keys 1–4 |
| **Modal-heavy flows** | Import 4-modal state machine; Onboarding (WelcomeSlides + TourCard + SkipConfirm); 8 bespoke overlays | **Inline / toast** | Collapse bespoke overlays onto shared `Modal`; prefer inline pipeline stages + bottom-center toasts (auto-dismiss ~2.2s). Import → inline progress; confirmations → toast where non-destructive |
| **Raw `.btn` buttons** | PlanPage, ProfileTab, ErrorBoundary, SessionModeBriefing, AuthPage, AdminDashboard, Dashboard | shared **Button** | Unify: primary (teal fill/INK text), ghost (PANEL + STROKE), danger (transparent + ROSE @40% border — never solid red) |
| **Competing tabs/toggles** | PlanPage `.plan-activity-tabs`, ImageOcclusion view-switch; ~6 bespoke checkboxes | shared **Tabs** / **ToggleSwitch** | Consolidate onto shared primitives (arrow-key a11y; 42×22 track, TEAL on / SLATE@50% off, 150ms knob) |
| **Kebab/icon dropdowns** | DeckCard `MoreVertical`, StudyTab FSRS dropdown, UserProfile icon nav | inline row actions / sidebar | Kebab → explicit row actions (Study/Browse); FSRS dropdown → §7.4 Settings panel controls |
| **Orphaned duplicate charts** | `UI/charts/RatingDistributionChart.tsx`, `UI/charts/RetentionTrendChart.tsx`, `UI/charts/LapseStatsChart.tsx`, `Dashboard/ReviewHeatmap.tsx` | ❌ **RETIRE** | Live consumers (`SessionAnalytics`, `StatisticsPage`) already import **shared `packages/components/src/charts/*`**. Desktop copies use dead `--danger/--bg/--muted/--primary` tokens — delete them; retheme only the shared set |

### 5c. Typography delta

**Faces:** DM Serif Display / Outfit / DM Mono (**Google CDN**, `apps/desktop/index.html`) → **Lora / Inter / Roboto Mono**, bundled via **@fontsource** (pixel parity + cross-platform; brand faces Georgia/Calibri/Courier New kept as CSS fallbacks). Update `--font-display`/`--font-body`/`--font-mono` in **both** token files; remove the Google `<link>` from `index.html`; fix the stray `'Inter'` literal in `UserProfilePage.css:5` to route through `--font-body`.

**Scale:** collapse the ~45 ad-hoc sizes (`rem`+`px` mixed) and 5 weights into the spec §3.2 three-role scale:

| v2 role | Face / weight | Size / treatment | Replaces (current) |
|---|---|---|---|
| Page title | Lora 400 | 38px / lh 1.15 | one-off `1.6rem`/`1.35rem`/`48px`/`72px` display headers |
| Hero stat / countdown | Lora 400–700 | 30–34px, accent or PAPER | Dashboard `StatCard` big numbers |
| Card question (study) | Lora 400 | 20–28px / lh 1.5, PAPER | CardViewer face text |
| Panel title | Lora 700 | 17px | `1rem`/`1.1rem` panel headers |
| Row title | Inter 600 | 14–15px, PAPER | `0.9rem`/`14px` list titles |
| Body / description | Inter 400 | 12–13px, MIST | `0.875rem`/`13px`/`0.8rem` body (the dominant sizes) |
| Section label / column header | Inter 600 | 10–11px UPPERCASE, ls 8–12%, SLATE | `11px`/`0.7rem`/`0.72rem` labels |
| Values, dates, shortcuts | Roboto Mono 400 | 11–13px | current `--font-mono` usages (already 82 sites) |
| Wordmark | Lora 400 | 22px, ls 13% | header logo text |

Weights: drop **800** (×3); standardize on 400/500/600/700 (§3.1 face weight sets).

### 5d. Flow delta (current → spec §9)

| Flow | Current | v2 target (§9) |
|---|---|---|
| **Morning rebalance surfacing** | `RebalanceBanner` — dismissable "behind pace" banner (extend timeline / got it) | Silent morning rebalance, surfaced **passively** as "rebalanced this morning" under the Dashboard hero title. No dismissable banner; pace lives in the exam hero card |
| **Zero-decision open → study** | Dashboard → manual nav → deck → study; `PreSessionBriefing`/`SessionModeBriefing` modals interpose | App opens → rebalance → hero shows countdown + pace → **one click / `↵`** into highest-priority session. **Target: zero decisions before the first card**; briefings become inline/optional |
| **Review-before-adding AI gate** | `AICardGenerator` generates → cards/drafts added (gate not enforced by Settings) | Pipeline → **review-before-adding gate** (toggle in §7.4 AI Generation) → cards land tagged with yield score + persistent **`AI Generated`** teal-outline chip shown on every review card |
| **Esc-with-confirm** | Modal `Esc` closes; StudySession has no exit-confirm (Space only) | `Esc` in Study **exits session with a confirm if mid-card**, progress kept; `Esc` in modals closes. Add the confirm + focus-restore currently missing |
| **Free-tier UPGRADE chip** | No tier awareness; AI surfaces always execute; no upgrade affordance | Free tier sees same shell; AI surfaces render an **`UPGRADE` amber chip** instead of executing; bottom tier card shows **FREE** + quiet teal upgrade link. No modals/nags |
| **Study-vs-Browse row action** | DeckList/DeckDetail always offer "Study" | Deck table row action = teal **Study** when due > 0, ghost **Browse** when due = 0. Decks table is the triage surface (due counts + yield mix) |

---

## 6. Uncovered-screen v2 treatments

Spec §7 defines Dashboard, Study, Decks, Settings (= our `UserProfilePage`); §11 governs all charts. Everything below is **not** covered by the spec and gets a v2 treatment here. Complex surfaces get a mini-spec; short surfaces get 2–3 sentences.

### 6.1 Statistics page — FULL mini-spec
*(`Statistics/StatisticsPage.tsx`, `MissedTopicsBreakdown.tsx`; shared charts)*

- **Lead with exam-pace answers before raw charts.** Per philosophy §1.2, the page opens with a plain-language answer strip (Lora + Inter 12 MIST sentence): "On pace · projected 94% blueprint coverage by exam day · retention 91% · you're +6% vs cohort." Only then the chart panels.
- **Layout:** page title "Statistics" (Lora 38) + reconciled summary line; shared `Tabs` (Overview / Cards / Reviews) as the canonical tab primitive; each tab is a stack of §6 panels (1px STROKE, radius 14), no chart borders of their own.
- **Composes (§6):** panels + gapped row-cards (for `MissedTopicsBreakdown` system→topic rows, expandable) + status chips + shared charts from `packages/components/src/charts/*` (retire the `UI/charts/*` dupes).
- **Chart series semantics (§11):** RetentionTrend → own retention **AMBER** solid, cohort **VIOLET dashed**; RatingDistribution → bars with count-triad meaning, "Again" segment **ROSE**; ReviewHeatmap → PANEL-2 cells, 5-step **TEAL** opacity ramp; MissRate → **ROSE**; own mastery/reviews-done → **TEAL** solid; projection → dashed variant of its series; capacity/track → SLATE @20–25%. Horizontal STROKE hairlines only; mono tick values.
- **Keyboard:** `/` focuses in-page search (topic filter); `Tab`/arrows move across tab list (shared `Tabs` a11y); `Esc` collapses an expanded breakdown row.
- **Empty states:** serif one-liner + one teal action — "Review cards to see your retention curve."

### 6.2 Browse / DeckDetail + CardList — FULL mini-spec
*(`Deck/DeckDetail.tsx`, `Card/CardList.tsx`, `Card/NoteEditor.tsx`)*

- **Browse is the `due = 0` destination** (§5d). DeckDetail becomes the browse surface, reachable via the ghost **Browse** row action.
- **Layout:** deck breadcrumb header (serif) + reconciled stats line; toolbar mirrors Decks (§7.3): **search field** (PANEL + STROKE, `⌕`, trailing `⌘K` kbd) + exam-family filter chips (full-round; active = teal @14% + teal @60% border).
- **Card list = gapped row-cards** (§6 Table), not the current `.card-item` grid or contiguous list: uppercase SLATE column headers (Front · Type · Due · Retention · action), rows as PANEL cards radius 12 / 10px gap. Count triad on due/interval; zeros SLATE. `stat-pill`s → tinted chips.
- **Card actions:** edit opens `NoteEditor` in shared `Modal`; delete → inline confirm collapsed to a toast where safe (delete-all keeps a Modal confirm). Retire the bespoke DeckDetail delete-overlay onto shared `Modal`.
- **Keyboard:** `/` focus search; `↑/↓` move selection; `↵` open/study; `E` edit selected; `Esc` clears filter/closes editor. Missing focus-trap in editors must be added.
- **Empty state:** serif one-liner + teal "＋ Add card" (or "✦ Generate with AI").

### 6.3 AI generation flow — FULL mini-spec
*(`AIStudy/DocumentsPage.tsx`, `AICardGenerator.tsx`, `DocumentUpload.tsx`)*

- **Surface the pipeline stages explicitly.** The always-mounted DocumentsPage keeps its `.pipeline-stepper` but restyled to §6: PANEL-2 + STROKE step capsule, active step teal. Stages read Upload → Analyze → Generate → **Review → Add**.
- **This is a feature (paid) surface:** panel gets the **teal @45% feature border** (§4); the CTA is the contractual teal **✦ Generate Cards with AI** (also on Dashboard + Decks empty states per §7.1/§9.4).
- **Review-before-adding gate (§9.4):** generation lands cards in a review stage first (honoring the Settings toggle), not straight into the deck. Each card previews with its yield score + `AI Generated` teal-outline chip; the user confirms before they persist. `AICardGenerator` inline-edit preview stays but uses tinted chips + shared Input.
- **Free tier (§9.6):** the Generate CTA renders an **`UPGRADE` amber chip** and does not execute; no modal.
- **Composes (§6):** feature panel + stepper + gapped preview row-cards + status chips + drag-drop upload zone (PANEL + STROKE, teal on drag-over) + progress bar (SLATE track, teal fill).
- **Keyboard:** `Enter` on URL input imports; `Enter`/`Space` on a preview field enters inline edit; `Esc` cancels edit. **Empty state:** "Paste a source and I'll draft cards you can review."

### 6.4 Card editor — FULL mini-spec
*(`Deck/DeckEditor.tsx`, `Card/NoteEditor.tsx`, `Card/CardViewer.tsx`, `UI/RichTextEditor.tsx`)*

- **`DeckEditor`:** shared `Modal` (already), name `autoFocus`, shared Input/Button — leave structurally, retheme tokens + Button variants.
- **`NoteEditor`:** shared `Modal` (md/lg), two-column when wide: front/back RichText (Quill retheme — quill.snow overrides to PANEL/STROKE/PAPER) left, occlusion/cloze SVG preview right. Replace 13 inline styles with tokenized classes. Card metadata chips (yield, blueprint) as tinted chips.
- **`CardViewer`:** three modes stay, but **the 3D flip is study-card motion** — per §8 "no entrance animations on the study card"; flip keeps its 0.6s transform *only* as a reveal affordance, gated by `prefers-reduced-motion`. Card surface = 16px radius, the one allowed drop shadow (`0 12px 40px rgba(0,0,0,.4)`); question in Lora 20–28/1.5 PAPER; answer under a teal `ANSWER` micro-label + hairline divider (§7.2).
- **Keyboard:** `Enter`/`Space` flip (existing); `E` edit (spec global map); editors need a real focus trap + focus restore on close.
- **Empty state:** front-empty preview shows serif placeholder, not blank.

### 6.5 Image Occlusion editor — FULL mini-spec
*(`ImageOcclusion/ImageOcclusionEditor.tsx`)*

- **Layout:** full-screen canvas-centric. Left/top **icon toolbar** (`.occlusion-tool-btn`) restyled to §6 ghost buttons (PANEL + STROKE, teal glyph on active); rect/ellipse/polygon tools; the mask/fields **view switch** migrates from bespoke toggle to shared `Tabs`.
- **Canvas:** image on PANEL surface, 1px STROKE frame; shapes drawn with teal @60% stroke + teal @14% fill; selected shape gets a full teal outline; `.shape-group-badge` ("G") → tinted chip.
- **Composes (§6):** ghost buttons, tinted chips, shared Tabs, stepper-free inline generate (teal CTA) + toast on success.
- **Keyboard (existing, keep):** `Escape` cancels in-progress polygon; `Delete`/`Backspace` deletes selected shapes; add `Space`/drag pan and `1/2/3` tool select for keyboard parity.
- **Empty state:** "Drop an image to start occluding" + teal upload action.

### 6.6 Plan page — FULL mini-spec
*(`Plan/PlanPage.tsx` — ~11 sub-components)*

- **This is the paid "Plan Mode" surface** — every panel carries the **teal @45% feature border** (§4, §5.1 tier signal). Title "Study plan" (Lora 38) + pace line.
- **Summary hero:** exam countdown (Lora 30–34) + pace sentence + right-aligned coverage block — mirrors the Dashboard exam hero (§7.1) so numbers reconcile (§10).
- **Signature interaction (§7.4):** the retention **slider** (`.plan-slider` → §6 Slider: 6px track, teal fill, 16px PAPER thumb, paired mono value chip) drives a **live plan-summary strip** that recomputes on drag: "At 92% retention: ~304 reviews/day · est. 42 min · projected 95% coverage." Never mutates today's plan mid-session (§9.5).
- **Composes (§6):** feature panels, gapped row-cards (history + all-plans list, replacing `.plan-preview-table`), shared `Tabs` (activity — retire `.plan-activity-tabs`), SVG progress rings restyled (SLATE track / teal fill), tinted status/yield chips (retire filled `.plan-status-pill`/`.plan-yield-chip`), stepper for numeric limits, deck picker with shared checkboxes.
- **Chart series (§11):** weekly projection → own **TEAL** vs cohort **VIOLET dashed**; capacity bars on SLATE @20–25% track.
- **Keyboard:** slider arrow-key adjust with live recompute; `Tab` across activity tabs; `Esc` cancels create-plan wizard.
- **Empty state (`NoPlansState`):** serif "No plan yet — set an exam date to get on pace" + one teal action.

### 6.7 Admin / Diagnostics — FULL mini-spec
*(`Admin/AdminDashboard.tsx` — 5 tab views; admin-gated)*

- **Layout:** page title "Diagnostics" + shared `Tabs` — but **strip the lucide icons** from tab labels (§5.1 dot-bullet, no icon tabs); Overview / Users / Feedback / Metrics as text labels.
- **Tables → gapped row-cards (§6):** the multiple `admin-table` grids (users clickable, per-user decks, metrics counters/timers/gauges) become uppercase SLATE column-header rows + PANEL row-cards, radius 12 / 10px gap. `admin-stat-card`/`admin-feedback-card` → 1px STROKE panels (drop shadows).
- **Charts:** replace inline recharts with the shared chart set + §11 semantics (metrics as TEAL own-series; error/lapse rates ROSE; SLATE tracks). Tooltips PANEL-2 + STROKE + toast shadow.
- **Keyboard:** `/` filters the active table; `↵` opens the selected user row; `Esc` closes a drill-in.
- **Empty states:** "No feedback yet" / "No metrics in this window" serif one-liners. This is an internal surface — restraint over polish, but the token/panel system still applies.

### 6.8 Short surfaces (2–3 sentences each)

- **Feedback form** (`Profile/FeedbackSection.tsx`): keep shared `Modal`; replace the 22 inline styles with tokenized classes and shared Input/Select/Button. Type/summary/areas as tinted chips + a PANEL+STROKE screenshot dropzone; submit keeps its verb through to the toast ("Submitted"). No layout change beyond retheme.

- **Update dialogs** (`Update/UpdateAvailableModal.tsx`): shared `Modal`; version in Lora, release-notes markdown rendered into MIST body + mono version/date; primary teal "Install and restart", ghost "Later". Note the auto-update renderer-lag caveat (the vN modal installs vN+1) — no behavioral change, retheme only.

- **Auth** (`Auth/AuthPage.tsx`, Login/Signup/Forgot/Reset): drop the `0 10px 30px` shadow → single centered PANEL panel, 1px STROKE, radius 14 on INK background; wordmark (Lora 22, ls 13%) + 40×40 teal logo square above the form; shared Input/Button, teal primary, `.auth-link-btn` → ghost/text-link. Loading screen uses the shared `Loader`.

- **Onboarding** (`Onboarding/WelcomeSlides`, `TourCard`, `Spotlight`, `SkipConfirm`, `OnboardingTour`): de-shadow all cards; slides + coach-marks become PANEL + STROKE with teal progress dots; Spotlight keeps its dimmed backdrop but ring goes teal. Consolidate SkipConfirm onto shared `Modal`; honor `prefers-reduced-motion` on the entrance keyframes.

- **Import modals** (`Import/ImportOptions/Progress/Success/Error`, `ImportAnkiButton`): fold the 4-modal state machine toward inline stages where possible; the bespoke `ImportProgressModal` migrates onto shared `Modal` with a §6 progress bar (SLATE track, teal fill). Deck-tree checkboxes → shared toggle/checkbox; conflict badge + `SummaryChip` → tinted chips; success/error summaries as tinted stat blocks. `⇪ Import .apkg` is a ghost button per §7.3.

- **Exam onboarding** (`ExamOnboarding/ExamOnboardingModal.tsx`): keep shared `Modal`; restyle the 3-step stepper to §6 (PANEL-2 + STROKE capsule, active teal) and the `.exam-deck-checkbox` rows to shared checkboxes. Exam date/blueprint feed the exam-as-organizing-object model (§1.2) — this is the moment the countdown starts.

- **Drafts** (`Drafts/DraftsPage.tsx`, `DraftTray.tsx`): de-shadow `.draft-card` (hover `0 4px 16px` → STROKE + brightness step); tray slide-in stays but panel loses its `-8px 0 32px` shadow for a 1px STROKE edge. Solid `.draft-tray-badge` count → tinted chip; promote/delete/clear actions as ghost/teal buttons with toast confirmation.

- **Session-complete recap + pre-session briefings** (`UI/SessionAnalytics.tsx`, `Dashboard/PreSessionBriefing.tsx`, `Deck/SessionModeBriefing.tsx`): SessionAnalytics keeps the shared chart set (§11 semantics) inside STROKE panels; "create missed-cards deck" input keeps its `Enter`/`Esc` handlers. The two bespoke pre-session briefing overlays fold into the §9.1 zero-decision flow — surface the brief inline/optional rather than as blocking modals, and fix `SessionModeBriefing`'s hardcoded-English i18n gap.

- **Rebalance banner** (`router/AppLayout.tsx`): retired as a dismissable banner (§5d) — pace moves into the Dashboard exam hero as passive "rebalanced this morning" text; no standalone banner chrome.
