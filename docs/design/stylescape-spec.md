# SEKEL — Brand & Design System Specification
> Version 1.0 · April 2026  
> This document is a complete stylescape specification for SEKEL, an AI-powered spaced repetition desktop app for medical students. It is written for direct consumption by an LLM or developer to implement the design system accurately with no ambiguity.

---

## 1. Brand Identity

### Product
**SEKEL** — AI-Powered Study Prioritization for Medical Students.  
Not "better Anki." The core proposition is: *given your exam, your weak areas, and your time remaining, which cards are worth studying right now?*

### Brand Personality
Three words describe every design decision:

| Pillar | Description |
|---|---|
| **Focused** | Study mode. The UI disappears. Only the card and the content remain. Like a well-lit desk at 10pm. |
| **Trustworthy** | Medical students are betting their careers on this tool. Every pixel earns its place. Reliability is non-negotiable. |
| **Intelligent** | The AI is a quiet co-pilot, not a chatbot. It speaks once per session with precision. It does not perform intelligence — it exercises it. |

### Design References
The aesthetic pulls from four products:
- **Linear** — interface clarity, zero decorative chrome
- **Notion** — focused writing/reading environment, calm neutrals
- **Raycast** — command-driven, precise, monospace detail
- **Stripe Docs** — typography-first hierarchy, deeply trusted

### Emotional Target
The app should feel like a **confident, calm study partner** — never alarming, never gamified, never clinical. It is a personal workspace for serious students under real pressure.

---

## 2. Color System

### 2.1 Dark Surface Palette
Used for: review/focus mode backgrounds, AI panels, app chrome in session mode.

| Token | Hex | Usage |
|---|---|---|
| `INK` | `#0F1117` | Primary text, darkest backgrounds, hero surfaces |
| `INK_SOFT` | `#1C2030` | Elevated panels on dark surfaces, card backs |
| `INK_MUTED` | `#2E3348` | Borders, dividers, and icon containers on dark surfaces |
| `SLATE` | `#4A5270` | Secondary body text, descriptive copy |
| `MIST` | `#8B93A8` | Labels, placeholders, metadata, disabled states |
| `FOG` | `#BEC5D4` | Body text rendered on dark backgrounds |

### 2.2 Light Surface Palette
Used for: app background (navigation/browse mode), card faces, input fields.

| Token | Hex | Usage |
|---|---|---|
| `CLOUD` | `#E8ECF4` | Borders and dividers on light surfaces |
| `PAPER` | `#F4F6FB` | Default app background, canvas |
| `WHITE` | `#FFFFFF` | Card surfaces, input backgrounds, elevated light panels |

### 2.3 Accent / Semantic Palette
Each accent color has a **full** variant and a **soft** variant. Soft variants are used for backgrounds of tags, badges, and button states.

| Token | Hex | Soft Hex | Semantic meaning |
|---|---|---|---|
| `TEAL` | `#2BBFA4` | `#E8F8F5` | Primary accent. CTAs, AI highlights, high-yield tags, active states. THE only action color. |
| `AMBER` | `#F0A500` | `#FEF6E6` | Medium yield. "Hard" rating button. Warnings. Never use for success. |
| `ROSE` | `#E05C6A` | `#FDEEF0` | Low yield. "Again" rating button. Error states. Never decorative. |
| `VIOLET` | `#7C6EF5` | `#F0EFFE` | "Easy" rating button. Secondary AI surface accents. Use with maximum restraint. |

### 2.4 Color Usage Rules
These rules are absolute. They are not defaults — they are constraints.

1. **Teal is the only CTA color.** When teal appears in the UI, the user must interpret it as "this is actionable" or "this is the AI speaking." The more teal is used, the less it means. Use it sparingly.
2. **Amber = medium yield or Hard rating.** Never use amber for success, positive feedback, or decorative purposes.
3. **Rose = low yield, errors, Again.** Never use rose for decoration or neutral information.
4. **Violet = Easy rating and secondary AI surfaces only.** It is the rarest accent.
5. **Mist (`#8B93A8`) is the default label color.** All DM Mono labels, timestamps, percentages, interval counts, and metadata default to Mist unless the element is interactive.
6. **Never use purple gradients as backgrounds.** This is a hard anti-pattern.
7. **Never use clinical blues or sterile hospital whites** as the primary palette. This is a personal workspace, not a hospital interface.

### 2.5 Surface Mode Switching
The app operates in two visual modes depending on context:
- **Dark mode (review/focus):** Background is `INK` (`#0F1117`). Used during active card review sessions. The environment recedes so the content comes forward.
- **Light mode (browse/navigation):** Background is `PAPER` (`#F4F6FB`). Used for deck browsing, stats dashboards, settings, and onboarding.

---

## 3. Typography

### 3.1 Typeface Stack

#### Display — DM Serif Display
```
font-family: 'DM Serif Display', Georgia, serif;
```
- **Role:** App logo/wordmark, large hero numbers, countdown timers, milestone moments, section heroes on dark surfaces.
- **Weights:** Regular (400), Italic
- **Character:** Warm, authoritative serif. Signals importance. Used sparingly — only for the highest-hierarchy moments.
- **Source:** `fonts.google.com/specimen/DM+Serif+Display`
- **Anti-pattern:** Never use for body copy, labels, or secondary text.

#### Body — Outfit
```
font-family: 'Outfit', sans-serif;
```
- **Role:** All UI text. Body copy, card content, headings, buttons, form inputs, navigation, supporting text.
- **Weights used:** 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Character:** Clean, modern geometric sans. Highly legible at small sizes. Neutral but not sterile.
- **Source:** `fonts.google.com/specimen/Outfit`
- **Anti-pattern:** Never use for labels, intervals, percentages, or metadata — that's Mono territory.

#### Monospace — DM Mono
```
font-family: 'DM Mono', 'Courier New', monospace;
```
- **Role:** All labels, tags, yield percentages, deck metadata, intervals (e.g. "4d", "21d"), ease factors, blueprint weights, section identifiers, timestamps, and any system/data-layer information.
- **Weights used:** 400 (Regular), 500 (Medium)
- **Character:** Signals precision, data, system information. The font choice itself communicates "this is a measurement, not prose."
- **Source:** `fonts.google.com/specimen/DM+Mono`
- **Anti-pattern:** Never use for explanatory copy, marketing text, or headings.

### 3.2 Type Scale

| Role | Font | Size | Weight | Color | Usage |
|---|---|---|---|---|---|
| Hero / App Name | DM Serif Display | 64–80px | 400 | `WHITE` or `INK` | SEKEL wordmark, hero countdowns |
| Section Hero | DM Serif Display Italic | 36–48px | 400 italic | `INK` or `WHITE` | "14 days until your shelf exam." |
| Heading 1 | Outfit | 28–32px | 700 | `INK` | Page titles, deck names |
| Heading 2 | Outfit | 20–24px | 600 | `INK` | Section headers, card type labels |
| Body / Card Content | Outfit | 16–18px | 400–500 | `INK` / `SLATE` | Card questions, answers, body copy |
| Supporting Text | Outfit | 14–16px | 300 | `SLATE` / `MIST` | Descriptions, subtitles, helper text |
| Label / Tag | DM Mono | 11–14px | 400 | `TEAL` / `MIST` | Yield tags, deck labels, exam type |
| Data / Metadata | DM Mono | 10–12px | 400 | `MIST` | Intervals, percentages, dates, ease |

### 3.3 Typography Rules
- **Left-align all body text and card content.** Center-aligning medical content is an anti-pattern.
- **DM Serif Display for numbers that matter** — countdowns, stats highlights, milestone numbers only.
- **Outfit for everything the user reads.** DM Mono for everything the app reports.
- **Never use more than two typefaces visible simultaneously** in a single view.
- **Line height:** 1.5–1.6 for body copy; 1.1–1.15 for display/hero text.
- **Letter spacing:** DM Mono labels use `0.06–0.16em` tracking with uppercase transforms for section identifiers.

---

## 4. Spacing System

All spacing follows a consistent token scale. Do not use arbitrary values.

| Token | Value | Usage |
|---|---|---|
| `XS` | 4px | Icon gaps, tight inline spacing |
| `SM` | 8px | Chip internal padding, badge padding, tight row gaps |
| `MD` | 12px | Standard cell padding, input internal padding |
| `LG` | 16px | Card internal padding (compact), list item gaps |
| `XL` | 24px | Card internal padding (standard), section margins |
| `2XL` | 32px | Gap between cards, gap between major components |
| `3XL` | 48px | Gap between major page sections |

---

## 5. Border Radius System

| Token | Value | Usage |
|---|---|---|
| `SM` | 6px | Chips, tags, pill badges, input fields, buttons |
| `MD` | 12px | Cards, panels, dropdowns, tooltips |
| `LG` | 20px | Large cards, drawer panels, feature blocks |
| `XL` | 28px | Hero panels, modals, full-bleed dark sections |

---

## 6. Shadow System

| Level | CSS Value | Usage |
|---|---|---|
| `SM` | `0 1px 3px rgba(15,17,23,0.08), 0 1px 2px rgba(15,17,23,0.04)` | Subtle lift on hover, inactive cards |
| `MD` | `0 4px 16px rgba(15,17,23,0.10), 0 1px 4px rgba(15,17,23,0.06)` | Active hover states, floating elements |
| `LG` | `0 12px 40px rgba(15,17,23,0.14), 0 4px 12px rgba(15,17,23,0.08)` | Modals, overlays, command palettes |
| `GLOW` | `0 4px 20px rgba(43,191,164,0.20)` | Teal CTA buttons, active focus states, AI panel glow |

Shadows use `#0F1117` (Ink) as the shadow color, not black. This keeps shadows warm/dark without going pure black, which reads as clinical.

---

## 7. UI Components

### 7.1 Flashcard Component

The flashcard is the core UI unit. Every design decision on the card must serve the act of reviewing.

**Structure (top to bottom):**
1. **Accent bar** — 3–4px tall, full card width, gradient from `TEAL` to `VIOLET`. Sits flush at the top edge of the card.
2. **Yield badge** — pill-shaped tag showing deck name + exam type + yield level. Font: DM Mono. Color: `TEAL` text on `TEAL_SOFT` bg with `TEAL` border. A small `TEAL` dot precedes the label text.
3. **Question** — Outfit SemiBold (500–600), `INK`. Left-aligned. 16–18px.
4. **Divider** — 1px `CLOUD` horizontal rule separating question from answer.
5. **Answer** — Outfit Regular/Bold combination. Key term in Bold (`INK`), supporting explanation in Regular (`SLATE`). Left-aligned.
6. **Rating row** — 4 buttons across the full card width: Again / Hard / Good / Easy. Each button shows the label + the resulting interval below it in DM Mono.

**Rating button colors:**
| Button | Background | Text/Border |
|---|---|---|
| Again | `ROSE_SOFT` (`#FDEEF0`) | `ROSE` (`#E05C6A`) |
| Hard | `AMBER_SOFT` (`#FEF6E6`) | `AMBER` (`#F0A500`) |
| Good | `TEAL_SOFT` (`#E8F8F5`) | `TEAL` (`#2BBFA4`) |
| Easy | `VIOLET_SOFT` (`#F0EFFE`) | `VIOLET` (`#7C6EF5`) |

**Card surface:** `WHITE` background on light mode. Card border: 1px `CLOUD`. Border radius: `MD` (12px).  
**No card flip animation.** The answer is revealed in place (show/hide). This is a focus environment — animation is a distraction.

### 7.2 AI Priority Panel

The AI panel surfaces once per study session. It is not a chatbot. It delivers one clear, specific recommendation.

**Visual treatment:**
- Background: `INK` (`#0F1117`) — always dark, even when app is in light mode.
- Subtle teal radial glow (`rgba(43,191,164,0.05–0.08)`) emanating from the top-right corner.
- Border: 1px `INK_MUTED`.
- Border radius: `MD`–`LG` (12–20px).

**Structure:**
1. **Header row:** Small square icon container (`INK_MUTED` bg, `TEAL` border, `◈` glyph in teal) + DM Mono label in `TEAL`: `"SEKEL INTELLIGENCE · [EXAM NAME] · [N] DAYS REMAINING"`
2. **Body text:** Outfit Light (300), `FOG`. 2–3 lines. Plain English. Explains *which* cards are prioritized and *why* (weak area + blueprint weight). Example: *"Prioritizing 38 cards from Cardiology (62% accuracy). Blueprint weight: 15–20% of IM shelf."*
3. **Chip row:** Small pill-shaped chips at the bottom. Teal chips for prioritized counts ("38 cards prioritized", "~55 min"). Mist chips for deprioritized counts ("212 deprioritized").

**Chips:** DM Mono, 11–13px. `INK_MUTED` background, `TEAL` or `MIST` border and text. Border radius fully rounded (pill shape).

### 7.3 Yield Tag System

Every card displays its yield level for the currently registered exam. Yield is not a fixed property — it changes based on which exam the user is registered for.

| Yield Level | Pill bg | Pill border | Text color | Dot color |
|---|---|---|---|---|
| High Yield | `TEAL_SOFT` (`#E8F8F5`) | `#C0EDE5` | `TEAL` (`#2BBFA4`) | `TEAL` |
| Medium Yield | `AMBER_SOFT` (`#FEF6E6`) | `#F5CE7A` | `AMBER` (`#F0A500`) | `AMBER` |
| Low Yield | `CLOUD` (`#E8ECF4`) | `FOG` (`#BEC5D4`) | `MIST` (`#8B93A8`) | `MIST` |

**Pill structure:** Small filled circle dot (5–7px) + label text in Outfit Medium (500), 14–18px. Fully rounded pill border radius.

### 7.4 Button Styles

| Variant | Background | Text | Border | Usage |
|---|---|---|---|---|
| Primary | `TEAL` (`#2BBFA4`) | `INK` (`#0F1117`) | None | Primary CTAs: "Start Review Session", "Join Waitlist" |
| Secondary | `PAPER` (`#F4F6FB`) | `INK` | 1px `CLOUD` | Browse, settings, secondary actions |
| Ghost | Transparent | `SLATE` | None | Low-priority actions: "Skip", "Cancel" |
| Mono/Dark | `INK` | `TEAL` | 1px `INK_MUTED` | Blueprint/data labels rendered as interactive |
| Danger | `ROSE_SOFT` | `ROSE` | 1px `ROSE` | Destructive actions: "Remove Card", "Delete Deck" |

**Button specs:** Outfit Medium (500–600), 14–17px. Border radius: `SM` (6px). No border radius larger than 8px on buttons. Padding: `SM`–`MD` (8–16px horizontal).

### 7.5 Navigation Bar

- Background: `PAPER` with `backdrop-filter: blur(16px)` — the bar is semi-transparent, showing the app content behind it as the user scrolls.
- Bottom border: 1px `CLOUD`.
- Logo: DM Serif Display, `INK`.
- Nav links: Outfit Regular 400, `SLATE`. Active state: `INK`.
- CTA button in nav: Primary button style (Teal background).

### 7.6 Section Labels / Dividers

Section headers inside the app use a centered horizontal rule pattern:
- Full-width 1px `CLOUD` rule
- Centered label breaks the rule: DM Mono, 9–11px, `TEAL`, ALL CAPS, `PAPER`-colored background rectangle behind the label text
- Example: `— SEKEL INTELLIGENCE —` or `— 01  VOICE & TONE —`

---

## 8. Surface Modes & Contexts

### Dark Surface (Review / Focus Mode)
When a user enters a card review session, the interface shifts to dark mode:
- App background: `INK` (`#0F1117`)
- Card face: `WHITE` — the card itself is a bright rectangle on a dark canvas
- AI panel: `INK` with teal glow
- All labels: `MIST` or `FOG`
- This is intentional: the dark surround directs visual attention to the white card

### Light Surface (Browse / Navigation Mode)
When the user is browsing decks, editing cards, or viewing stats:
- App background: `PAPER` (`#F4F6FB`)
- Cards and panels: `WHITE`
- Borders: `CLOUD`
- Text: `INK` / `SLATE`

### Ambient Visual Effects (Dark Surfaces Only)
On dark hero sections and AI panels, a subtle radial gradient "glow" can be added using a large, very low opacity circle:
- Teal glow: `rgba(43, 191, 164, 0.05–0.08)` — positioned top-right of dark sections
- Violet glow: `rgba(124, 110, 245, 0.03–0.05)` — positioned bottom-left as a secondary ambient
- These are purely decorative. They must be invisible at a glance and only perceptible on close inspection.

---

## 9. Voice & Tone

### Three Principles

**CALM**
The app must never alarm the user. Medical students are already under enormous stress. Every message, empty state, and error should feel like a confident, calm study partner speaking — not a push notification trying to create urgency. Words like "URGENT", "You're behind!", or "You haven't studied in X days!" are completely off-brand.

**PRECISE**
SEKEL earns trust through specificity. Never say "a lot of cards due." Say "38 cards due." Never say "soon." Say "14 days." Vague language is a trust liability. Every number, date, and percentage should be exact and pulled from real data.

**DIRECT**
No filler copy. No onboarding screens that exist for their own sake. No tooltips that explain the obvious. Every word in the UI must justify its existence. If it doesn't help the user make a decision or understand their situation better — cut it.

### Copy Examples

| Context | Wrong | Right |
|---|---|---|
| AI panel intro | "Here are some cards you might want to look at!" | "Prioritizing 38 cards from Cardiology. Blueprint weight: 15–20% of your IM shelf." |
| Empty state | "You haven't studied yet today. Get going!" | "No cards due. Your next session is tomorrow — 22 cards." |
| Exam registration | "Great choice! Let's get started." | "IM Shelf registered. Blueprint loaded: 14 weighted topics." |
| Error | "Oops! Something went wrong." | "Sync failed. Your reviews are saved locally and will sync when you reconnect." |

---

## 10. Anti-Patterns

The following are explicitly forbidden in the SEKEL design system. If another LLM or developer proposes any of these, it is a violation of the brand.

| Anti-Pattern | Why It's Forbidden |
|---|---|
| XP bars, level-up animations, fire streaks, confetti | Gamification trivializes the seriousness of board exam prep. It also doesn't reflect SEKEL's value prop. |
| Clinical blues (`#0057B8`, etc.) or sterile hospital whites | This is a personal workspace, not a medical records system. Hospital aesthetics create the wrong emotional context. |
| Purple or rainbow gradient backgrounds | Generic "AI startup" aesthetic. Directly contradicts the calm, focused brand. |
| Animated card flip (3D CSS transform) | This is focus mode. Animation on the core interaction is theatrical and distracting. |
| Center-aligned body text | Misaligns with the reading direction of medical content. Always left-align. |
| More than 2 typefaces visible in a single view | Creates visual noise. The 3-font system (Serif + Sans + Mono) must never all appear simultaneously in the same view. |
| Showing yield context without explaining why | "High Yield" without the blueprint source is meaningless. Always show which exam the yield is relative to. |
| Teal used decoratively (backgrounds, illustrations, etc.) | Teal means "actionable" or "AI insight." Using it decoratively trains the user to ignore it. |
| Bold text used for emphasis mid-sentence throughout body copy | Bold has one job: labeling the key term in a card answer. Don't dilute it. |

---

## 11. Component Hierarchy Summary

When building any screen in SEKEL, apply this hierarchy:

1. **Surface** — What mode is this? Review (dark) or Browse (light)? Set the background accordingly.
2. **Structure** — Use the spacing token scale. No arbitrary px values.
3. **Typography** — Outfit for content the user reads. DM Mono for data the app reports. DM Serif Display for the one or two most important numbers on the screen.
4. **Color** — `INK`/`SLATE`/`MIST` for text. `CLOUD`/`PAPER`/`WHITE` for light surfaces. Teal only for action. Amber/Rose/Violet only for their semantic meanings.
5. **Yield context** — Any card shown in any context must display its yield tag for the current registered exam.
6. **AI surface** — The AI panel is always dark (`INK`), always DM Mono for the header, always Outfit Light for the body, always teal for accent. It appears once per session. It is not a chat interface.

---

## 12. Technical Font Loading

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');
```

```css
:root {
  --font-display: 'DM Serif Display', Georgia, serif;
  --font-body:    'Outfit', system-ui, sans-serif;
  --font-mono:    'DM Mono', 'Courier New', monospace;
}
```

---

## 13. Full Color Token Reference

```css
:root {
  /* Dark surfaces */
  --ink:        #0F1117;
  --ink-soft:   #1C2030;
  --ink-muted:  #2E3348;
  --slate:      #4A5270;
  --mist:       #8B93A8;
  --fog:        #BEC5D4;

  /* Light surfaces */
  --cloud:      #E8ECF4;
  --paper:      #F4F6FB;
  --white:      #FFFFFF;

  /* Accent — full */
  --teal:       #2BBFA4;
  --amber:      #F0A500;
  --rose:       #E05C6A;
  --violet:     #7C6EF5;

  /* Accent — soft (backgrounds) */
  --teal-soft:   #E8F8F5;
  --amber-soft:  #FEF6E6;
  --rose-soft:   #FDEEF0;
  --violet-soft: #F0EFFE;

  /* Accent — borders */
  --teal-border:   rgba(43, 191, 164, 0.22);
  --amber-border:  #F5CE7A;
  --rose-border:   #F0A8AE;
  --violet-border: #B8B0FA;

  /* Teal glow (AI panels, CTA shadow) */
  --teal-glow:   rgba(43, 191, 164, 0.15);
}
```
