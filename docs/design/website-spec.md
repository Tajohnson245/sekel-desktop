# SEKEL — Website Content & Structure Specification
> This document is a complete, implementation-ready specification of the SEKEL marketing website. It contains every piece of copy, every section's layout intent, all component behavior, design tokens, and interactive details. A developer or LLM should be able to rebuild this site from scratch using only this document and the SEKEL Stylescape Spec.

---

## Meta

- **Page title:** `SEKEL — AI-Powered Study Prioritization for Medical Students`
- **Canonical URL:** `sekel.io`
- **Fonts:** DM Serif Display (400, italic), Outfit (300, 400, 500, 600, 700), DM Mono (300, 400, 500) — all from Google Fonts
- **Max content width:** `1120px`, centered
- **Page background:** `#F4F6FB` (PAPER)
- **Body font:** Outfit, `#0F1117` (INK)
- **Scroll behavior:** smooth

---

## Color Tokens (CSS Custom Properties)

```css
--ink: #0F1117;
--ink-soft: #1C2030;
--ink-muted: #2E3348;
--slate: #4A5270;
--mist: #8B93A8;
--fog: #BEC5D4;
--cloud: #E8ECF4;
--paper: #F4F6FB;
--white: #FFFFFF;
--teal: #2BBFA4;
--teal-dim: #1E8F7B;
--teal-glow: rgba(43,191,164,0.15);
--teal-soft: rgba(43,191,164,0.08);
--teal-border: rgba(43,191,164,0.22);
--amber: #F0A500;
--amber-soft: rgba(240,165,0,0.10);
--rose: #E05C6A;
--rose-soft: rgba(224,92,106,0.10);
--violet: #7C6EF5;
--violet-soft: rgba(124,110,245,0.10);
--r-sm: 6px;
--r-md: 12px;
--r-lg: 20px;
--r-xl: 28px;
--shadow-sm: 0 1px 3px rgba(15,17,23,0.08), 0 1px 2px rgba(15,17,23,0.04);
--shadow-md: 0 4px 16px rgba(15,17,23,0.10), 0 1px 4px rgba(15,17,23,0.06);
--shadow-lg: 0 12px 40px rgba(15,17,23,0.14), 0 4px 12px rgba(15,17,23,0.08);
```

---

## Section Map (Page Order)

1. Navigation (fixed)
2. Hero
3. Problem
4. How It Works
5. Features
6. Yield System
7. Exam Blueprints
8. Comparison Table
9. CTA / Waitlist
10. Footer

---

## 1. Navigation

**Behavior:** Fixed to top. Full-width. `z-index: 100`. Background: `rgba(244,246,251,0.85)` with `backdrop-filter: blur(16px)`. Bottom border: `1px solid #E8ECF4` (CLOUD). Height: `64px`.

**Left:** Logo
- Text: `SEKEL` — DM Serif Display, 26px, `#0F1117`
- The last two letters `EL` are colored `#2BBFA4` (TEAL)
- Links to `#` (top of page)

**Center:** Nav links (hidden on mobile)
- `How It Works` → `#how-it-works`
- `Features` → `#features`
- `Exams` → `#blueprints`
- `Compare` → `#compare`
- Font: Outfit 400, 14px, `#4A5270` (SLATE)
- Hover: `#0F1117` (INK)
- Active section link (on scroll): `#0F1117` (INK) — driven by IntersectionObserver scroll tracking

**Right:** CTA button
- Label: `Join Waitlist`
- Links to `#waitlist`
- Style: background `#0F1117`, text `#FFFFFF`, padding `9px 20px`, border-radius `6px`, Outfit 500, 14px
- Hover: background `#2E3348` (INK_MUTED)

---

## 2. Hero

**Section behavior:** Full viewport height (`min-height: 100vh`). Background: `#0F1117` (INK). Overflow hidden. Padding: `120px 32px 80px`. Flex column, centered.

**Ambient orbs (decorative, pointer-events: none, position: absolute):**
- Orb 1: top-right, 600×600px, `radial-gradient(circle, rgba(43,191,164,0.12) 0%, transparent 65%)`
- Orb 2: bottom-left, 500×500px, `radial-gradient(circle, rgba(124,110,245,0.08) 0%, transparent 65%)`
- Orb 3: center, 400×400px, `radial-gradient(circle, rgba(43,191,164,0.04) 0%, transparent 60%)`

**Badge (above headline):**
- Pill shape, `border-radius: 30px`
- Background: `rgba(43,191,164,0.08)`, border: `1px solid rgba(43,191,164,0.22)`
- Contains: animated pulsing dot (6px, `#2BBFA4`, keyframe pulse 2s) + label text
- Label: `Now in development — Join the waitlist`
- Font: DM Mono, 11px, `#2BBFA4`, letter-spacing `0.1em`, uppercase
- Margin bottom: `36px`

**Headline:**
- Font: DM Serif Display, `clamp(42px, 6vw, 80px)`, `#FFFFFF`, line-height `1.05`, letter-spacing `-1.5px`
- Max-width: `800px`
- Text (two lines): `Study what` *`actually matters`* `for your next exam.`
- The words `actually matters` are in italic and colored `#2BBFA4` (TEAL) — use `<em>` tag

**Subheadline:**
- Font: Outfit 300, `clamp(17px, 2vw, 21px)`, `#BEC5D4` (FOG), line-height `1.6`
- Max-width: `600px`
- Margin bottom: `48px`
- Text: `SEKEL combines spaced repetition with` **`official exam blueprints`** `and your personal performance data to tell you exactly which cards are worth your limited time — and which aren't.`
- Bold words (`official exam blueprints`) are Outfit 500, `#FFFFFF`

**Action buttons (flex row, gap 16px, margin-bottom 80px):**

Primary button:
- Label: `Join the Waitlist →` (arrow is a separate span)
- Links to `#waitlist`
- Background: `#2BBFA4` (TEAL), text: `#0F1117` (INK)
- Padding: `14px 28px`, border-radius: `6px`, Outfit 600, 15px
- Box-shadow: `0 4px 20px rgba(43,191,164,0.15)`
- Hover: background `#24a88f`, `translateY(-1px)`, shadow deepens

Secondary button:
- Label: `See how it works`
- Links to `#how-it-works`
- Background: transparent, text: `#BEC5D4` (FOG)
- Padding: `13px 24px`, border: `1px solid rgba(255,255,255,0.12)`
- Hover: border `rgba(255,255,255,0.25)`, text `#FFFFFF`

**Stats row (flex, gap 48px, below buttons):**

| Stat number | Label |
|---|---|
| `7` | EXAM TYPES SUPPORTED |
| `FSRS` | ALGORITHM |
| `Local` | FIRST ARCHITECTURE |

- Number: DM Serif Display, 36px, `#FFFFFF`
- Label: DM Mono, 10px, `#8B93A8` (MIST), uppercase, letter-spacing `0.12em`, margin-top `6px`

**App mockup (desktop UI preview, below stats, margin-top 80px):**

Container:
- Max-width: `900px`, centered
- Background: `#1C2030` (INK_SOFT), border: `1px solid #2E3348` (INK_MUTED)
- Border-radius: `28px` (XL), overflow hidden
- Box-shadow: `0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`

Mockup top bar (macOS-style chrome):
- Background: `#0F1117`, border-bottom: `1px solid #2E3348`
- Padding: `14px 20px`, flex row, gap `10px`
- Three traffic-light dots: 10px circles — red `#E05C6A`, yellow `#F0A500`, green `#2BBFA4`
- Window title (DM Mono, 11px, `#8B93A8`, letter-spacing `0.06em`): `SEKEL — Internal Medicine Shelf · 14 days remaining`

Mockup body:
- Padding: `28px`, 2-column grid: `1fr 1.4fr`, gap `20px`

**Left column — AI Panel:**
- Background: `rgba(43,191,164,0.05)`, border: `1px solid rgba(43,191,164,0.22)`, border-radius `12px`, padding `20px`
- Header row: small icon box (24×24px, `rgba(43,191,164,0.15)` bg, `1px solid rgba(43,191,164,0.22)` border, radius `6px`, contains glyph `◈`) + DM Mono label `SEKEL Intelligence` in `#2BBFA4`, 9px, uppercase
- Body text (Outfit 300, 13px, `#BEC5D4`, line-height 1.6): `Your IM shelf is in` **`14 days`**`. You're struggling with` **`Cardiology`** `(62% accuracy) — weighted` **`15–20%`** `on the blueprint. These 38 cards are your highest-leverage study right now.`
  - Bold words: Outfit 500, `#FFFFFF`
- Chip row below text:
  - `38 cards prioritized` — teal chip
  - `~55 min` — teal chip
  - `212 deprioritized` — muted/dim chip
  - `Low yield today` — muted/dim chip
  - Teal chips: DM Mono 9px, `#2BBFA4` text, `rgba(43,191,164,0.08)` bg, `rgba(43,191,164,0.15)` border, border-radius `20px`, padding `4px 8px`
  - Dim chips: `#8B93A8` text, `rgba(255,255,255,0.03)` bg, `rgba(255,255,255,0.06)` border

Progress bars (below chips, margin-top 16px):

Row 1 — Cardiology:
- Label: `Cardiology` (Outfit 500, 12px, `#FFFFFF`) + `62%` (DM Mono, 10px, `#2BBFA4`) right-aligned
- Track: 4px height, `rgba(255,255,255,0.08)` bg, border-radius `2px`
- Fill: 62% width, gradient `linear-gradient(90deg, #2BBFA4, #7C6EF5)`
- Sub-label: `Blueprint: 15–20% · 48 cards due` (DM Mono 10px, `#8B93A8`)

Row 2 — Nephrology:
- Label: `Nephrology` + `58%` in `#E05C6A` (ROSE)
- Fill: 58% width, gradient `linear-gradient(90deg, #E05C6A, #F0A500)` (warning gradient)
- Sub-label: `Blueprint: 10–15% · 31 cards due`

**Right column — Flashcard:**
- Background: `#FFFFFF`, border-radius `12px`, padding `22px`, position relative, overflow hidden
- Top accent bar: `::before` pseudo-element, `position: absolute`, top 0, left 0, right 0, height `3px`, `linear-gradient(90deg, #2BBFA4, #7C6EF5)`
- Yield badge: inline-flex, `rgba(43,191,164,0.08)` bg, `rgba(43,191,164,0.22)` border, border-radius `20px`, padding `3px 9px`, margin-bottom `12px`
  - Contains: 4px teal dot + text `IM Shelf · Cardiology · High Yield` in DM Mono 9px `#2BBFA4`
- Question (Outfit 500, 13px, `#0F1117`, line-height 1.5): `A 58-year-old man presents with chest pain, diaphoresis, and ST elevation in leads II, III, aVF. Most likely diagnosis?`
- Divider: `1px solid #E8ECF4`, margin `14px 0`
- Answer (Outfit 12px, `#4A5270`, line-height 1.6): **`Inferior STEMI`** `— RCA occlusion. Check right-sided leads (V4R) for RV infarct. Avoid nitrates if RV involvement suspected.`
  - Bold term: Outfit 600, `#0F1117`
- Rating buttons (4-column grid, gap 6px, margin-top 18px):
  - Again: `rgba(224,92,106,0.10)` bg, `#E05C6A` text/border, label + `<1m` interval
  - Hard: `rgba(240,165,0,0.10)` bg, `#F0A500` text/border, label + `4d`
  - Good: `rgba(43,191,164,0.08)` bg, `#2BBFA4` text/border, label + `8d`
  - Easy: `rgba(124,110,245,0.10)` bg, `#7C6EF5` text/border, label + `21d`
  - Each button: border-radius `4px`, padding `8px 4px`, Outfit 500 11px for label, DM Mono 9px for interval, flex column, centered

---

## 3. Problem Section

**ID:** `problem`  
**Background:** `#FFFFFF` (WHITE)  
**Padding:** `100px 32px`

**Section label (DM Mono, 10px, `#2BBFA4`, uppercase, letter-spacing 0.16em):**
`The Problem with Anki`

**Headline (DM Serif Display, `clamp(32px, 4vw, 52px)`, `#0F1117`, line-height 1.1):**
`Anki tells you` *`when`* `to review.`  
`It never tells you` *`what's worth reviewing.`*

- The words `when` and `what's worth reviewing.` are DM Serif Display italic, `#2BBFA4` (TEAL)

**Layout:** 2-column grid (`1fr 1fr`), gap `64px`, align items center, margin-top `64px`

**Left column:**
Body text (Outfit 300, 17px, `#4A5270`, line-height 1.7, max-width 560px):
`Medical students have hundreds of cards due every day and an exam in two weeks. Anki surfaces them all equally. SEKEL doesn't.`

**Right column — 3 problem cards (flex column, gap 16px):**

Each card: `#F4F6FB` bg, `1px solid #E8ECF4` border, border-radius `12px`, padding `24px`, flex row, gap `16px`
Hover: border-color `#BEC5D4`, box-shadow `var(--shadow-sm)`

Card 1:
- Icon box (40×40px, border-radius `10px`): `rgba(224,92,106,0.10)` bg, `1px solid rgba(224,92,106,0.2)` border, icon `⏱`
- Title (Outfit 600, 15px, `#0F1117`): `No exam awareness`
- Body (Outfit 400, 13px, `#4A5270`, line-height 1.6): `Anki has no idea your IM shelf is in 14 days. It treats a card about rare tropical diseases the same as a Cardiology card worth 20% of your score.`

Card 2:
- Icon box: amber soft bg/border, icon `📊`
- Title: `No yield intelligence`
- Body: `Not all cards are equal for your next exam. Some are high-yield. Most aren't. Anki can't tell the difference. SEKEL is built around that distinction.`

Card 3:
- Icon box: mist soft bg/border, icon `🧠`
- Title: `No prioritization logic`
- Body: `With limited hours and a real exam approaching, you need a study partner that reasons about your time — not an algorithm that just counts days since last review.`

---

## 4. How It Works

**ID:** `how-it-works`  
**Background:** `#0F1117` (INK — dark section)  
**Padding:** `100px 32px`

All text on dark background:
- Section label: `#2BBFA4` (TEAL)
- Headline: `#FFFFFF`
- Body: `#BEC5D4` (FOG)

**Section label:** `How It Works`

**Headline:** `Three inputs. One intelligent queue.`

**Subheadline (Outfit 300, 17px, `#BEC5D4`, max-width 560px):**
`SEKEL doesn't replace spaced repetition — it makes it smarter by adding context that Anki was never designed to have.`

**Layout:** 3-column grid, gap `32px`, margin-top `64px`

Each step has a visual connector line between it (position absolute, from center of step to edge, gradient from `rgba(43,191,164,0.22)` to `transparent`). Last step has no connector.

**Step 1:**
- Number badge: `48px` square, border-radius `12px`, `rgba(43,191,164,0.08)` bg, `1px solid rgba(43,191,164,0.22)` border, DM Serif Display 22px `#2BBFA4` — number `1`
- Title (Outfit 600, 17px, `#FFFFFF`): `Register your exam`
- Body (Outfit 300, 14px, `#BEC5D4`, line-height 1.7): `Tell SEKEL which exam you're studying for and when it is. SEKEL loads the` **`official blueprint`** `— real topic weightings from USMLE, NBME, or NCSBN — and uses it to score every card you own.`
  - Bold: Outfit 500, `#2BBFA4`

**Step 2:**
- Number badge: `2`
- Title: `Study as normal`
- Body: `Review cards using the` **`FSRS algorithm`** `— the most accurate spaced repetition scheduler available. Every rating you give builds a picture of your real weak areas.`

**Step 3:**
- Number badge: `3`
- Title: `SEKEL prioritizes for you`
- Body: `Before each session, SEKEL combines your performance data, the blueprint weightings, and time-to-exam to surface the` **`highest-leverage cards first`**`. You always know why a card is being shown.`

---

## 5. Features

**ID:** `features`  
**Background:** `#F4F6FB` (PAPER)  
**Padding:** `100px 32px`

**Section label:** `Features`

**Headline:** `Everything Anki should be.`

**Layout:** 2-column grid, gap `24px`, margin-top `64px`

### Featured card (spans full 2 columns, `grid-column: span 2`)

- Background: `#0F1117` (INK — dark card on light page)
- Border: `1px solid #2E3348`
- Border-radius: `20px` (LG)
- Padding: `36px`
- Internal layout: 2-column grid `1fr 1fr`, gap `40px`, align items center
- `::after` pseudo: decorative teal radial glow top-right

**Left side of featured card:**
- Icon box (48×48px): `rgba(43,191,164,0.08)` bg, `1px solid rgba(43,191,164,0.22)` border, radius `12px`, glyph `◈` in teal
- Section label (DM Mono, 9px, `#2BBFA4`, uppercase, letter-spacing 0.14em): `Core Feature`
- Title (Outfit 600, 20px, `#FFFFFF`): `AI-Driven Study Prioritization`
- Body (Outfit 400, 14px, `#BEC5D4`, line-height 1.7): `This is what SEKEL was built for. Before every session, an AI reasoning layer combines three signals — your personal performance history, the official exam blueprint, and days until your exam — to generate a ranked study queue.`
- Feature list (DM Mono bullet `◎` in teal, Outfit 400, 14px, `#BEC5D4`):
  - `Blueprint weights from USMLE, NBME shelf exams, and NCLEX`
  - `Adapts as your performance changes and exam date approaches`
  - `Every card shows its yield level so you always know why it matters`

**Right side of featured card — AI demo box:**
- Background: `rgba(43,191,164,0.04)`, border: `1px solid rgba(43,191,164,0.22)`, border-radius `12px`, padding `24px`
- Header: icon (28×28px teal glow box, `◈`) + DM Mono label `SEKEL Intelligence · IM Shelf · 14 days` in `#2BBFA4`, 9px
- Body (Outfit 300, 13px, `#BEC5D4`): `Prioritizing` **`38 cards`** `from Cardiology and Nephrology. These are your weakest areas and together account for` **`25–35%`** `of your IM shelf score. 212 cards deprioritized — low yield for this exam.`
- Chips below body:
  - Teal: `Cardiology · High Yield`, `Nephrology · High Yield`
  - Dim: `GI · Medium Yield`, `Derm · Low Yield`

### Standard feature cards (2 per row):

**Card — FSRS Scheduling:**
- Icon: teal box, `⚡`
- Label: `Algorithm`
- Title: `FSRS Scheduling`
- Body: `The Free Spaced Repetition Scheduler is the most accurate scheduling algorithm available — significantly better than SM-2. It models your memory precisely so you review cards at exactly the right moment, not too early or too late.`

**Card — Local-First:**
- Icon: violet box, `💾`
- Label: `Architecture`
- Title: `Local-First, Always Fast`
- Body: `Your data lives on your machine in a local SQLite database. Review sessions are instant — no network latency, no spinners. Works fully offline. Syncs to the cloud in the background when you're connected.`

**Card — Rich Cards:**
- Icon: amber box, `🖼`
- Label: `Card Types`
- Title: `Rich Cards with Images`
- Body: `Create cards with text, images, and image occlusion. Perfect for anatomy, ECG interpretation, radiology, and pathology slides. Images are stored locally for instant loading — no cloud dependency during review.`

---

## 6. Yield System Section

**ID:** `yield`  
**Background:** `#F4F6FB` (PAPER)  
**Padding:** `100px 32px`

**Layout:** 2-column grid `1fr 1fr`, gap `80px`, align items center

**Left column (text):**

Section label: `The Yield System`

Headline (DM Serif Display):
```
The same card.
Different exams.
Different priority.
```
- Last line (`Different priority.`) in italic, colored `#2BBFA4`

Body (Outfit 300, 17px, `#4A5270`, max-width 560px, margin-bottom `32px`):
`A Cardiology card tagged as high-yield for your IM shelf might be medium-yield for Step 2 CK and low-yield for Step 1. SEKEL adjusts yield dynamically based on which exam you've registered and the official blueprint for that exam.`

Secondary body (Outfit 300, 15px, `#4A5270`):
`Blueprint data is stored as versioned, updatable config — so when USMLE or NBME revises their content outlines, SEKEL updates without a code change.`

**Right column (visual demo):**

Label above cards (DM Mono, 10px, `#8B93A8`, uppercase): `Inferior STEMI — same card, three exams`

Three yield cards (flex column, gap `12px`):

Each card: `#FFFFFF` bg, `1px solid #E8ECF4` border, border-radius `12px`, padding `20px`, flex row, justify space-between, align center
Hover: border-color `#BEC5D4`, `var(--shadow-sm)`

Card 1:
- Left: title `Inferior STEMI (RCA Occlusion)` (Outfit 500, 14px, INK) + sub `USMLE · Step 2 CK` (DM Mono 10px, MIST)
- Right: High Yield pill — `rgba(43,191,164,0.08)` bg, `rgba(43,191,164,0.2)` border, `#2BBFA4` text, teal dot

Card 2:
- Left: same title + sub `NBME · Internal Medicine Shelf`
- Right: High Yield pill (same style)

Card 3:
- Left: same title + sub `USMLE · Step 1`
- Right: Medium Yield pill — `rgba(240,165,0,0.10)` bg, `rgba(240,165,0,0.2)` border, `#F0A500` text, amber dot

Note box (below yield cards):
- Background: `#0F1117`, border-radius `12px`, padding `16px 20px`, margin-top `8px`, flex row, gap `12px`
- Icon: `◎` in `#2BBFA4`
- Text (Outfit 300, 13px, `#BEC5D4`): `Yield is calculated from` **`official exam blueprints`** `— real topic weightings published by USMLE, NBME, and NCSBN. Not guesses.`

---

## 7. Exam Blueprints

**ID:** `blueprints`  
**Background:** `#FFFFFF`  
**Padding:** `100px 32px`

**Section label:** `Supported Exams`

**Headline:** `Built on official blueprints.`

**Subheadline (Outfit 300, 17px, `#4A5270`, max-width 560px):**
`SEKEL ingests content outlines directly from the governing bodies that publish them — not third-party summaries or scraped data. When they update, SEKEL updates.`

**Layout:** 3-column grid, gap `16px`, margin-top `48px`

Each blueprint card: `#F4F6FB` bg, `1px solid #E8ECF4` border, border-radius `12px`, padding `24px`
Hover: border-color `rgba(43,191,164,0.22)`, box-shadow `0 4px 20px rgba(43,191,164,0.15)`, background `#FFFFFF`

| Org label | Name | Description | Tags |
|---|---|---|---|
| `USMLE · FSMB & NBME` | Step 1 | Foundational sciences across 18 organ systems. Pass/fail but foundational for Steps 2 & 3. | `18 Systems`, `Updated 2024` |
| `USMLE · FSMB & NBME` | Step 2 CK | Clinical knowledge across all major specialties. Scored exam. Critical for residency applications. | `8 Disciplines`, `Scored` |
| `USMLE · FSMB & NBME` | Step 3 | Clinical medicine and patient management. Required for full medical licensure in the US. | `CCS Cases`, `Licensure` |
| `NBME · Subject Exams` | IM Shelf | Internal Medicine clerkship exam. Cardiology, Nephrology, GI, Pulm, and more — all weighted. | `End of Clerkship`, `Graded` |
| `NBME · Subject Exams` | All 10 Shelf Exams | Surgery, Pediatrics, OB/GYN, Psychiatry, Neurology, Family Medicine, and more. | `10 Exams`, `All Rotations` |
| `NCSBN` | NCLEX-RN | Nursing licensure exam. 2026 test plan with updated clinical judgment framework and CAT format. | `2026 Plan`, `CAT Format` |

Each card structure:
- Org label: DM Mono 9px, `#8B93A8`, uppercase, letter-spacing 0.12em, margin-bottom `10px`
- Name: Outfit 600, 16px, `#0F1117`, margin-bottom `6px`
- Description: Outfit 400, 12px, `#4A5270`, line-height 1.5, margin-bottom `16px`
- Tags: flex wrap, gap `6px` — each tag: DM Mono 9px, `#2BBFA4`, `rgba(43,191,164,0.08)` bg, `rgba(43,191,164,0.22)` border, padding `3px 8px`, border-radius `20px`

---

## 8. Comparison Table

**ID:** `compare`  
**Background:** `#0F1117` (INK — dark section)  
**Padding:** `100px 32px`

Section label (`#2BBFA4`): `Comparison`

Headline (`#FFFFFF`): `How SEKEL stacks up.`

**Table:** 4-column layout. `border: 1px solid #2E3348`, `border-radius: 20px`, overflow hidden.

**Column headers:**
| Column | Label | Style |
|---|---|---|
| 1 | `Feature` | DM Mono 9px, `#8B93A8`, padding `20px 24px` |
| 2 | `Anki` | same |
| 3 | `Quizlet` | same |
| 4 | `SEKEL` | DM Mono 9px, **`#2BBFA4`** (TEAL), `rgba(43,191,164,0.05)` bg, `border-left: 1px solid rgba(43,191,164,0.1)` |

**Rows** (each row: `border-top: 1px solid #2E3348`, hover: `rgba(255,255,255,0.02)` bg):

SEKEL column cells have: `rgba(43,191,164,0.03)` bg, `border-left: 1px solid rgba(43,191,164,0.1)`

Checkmark: `✓` in `#2BBFA4` (TEAL)  
Cross: `✕` in `#2E3348` (INK_MUTED)  
Partial: text in `#F0A500` (AMBER), DM Mono 12px

| Feature | Anki | Quizlet | SEKEL |
|---|---|---|---|
| Spaced repetition algorithm | `SM-2 (dated)` amber | ✕ | ✓ + `FSRS` in DM Mono MIST |
| Exam-specific blueprint data | ✕ | ✕ | ✓ |
| AI study prioritization | ✕ | ✕ | ✓ |
| Card yield tagging per exam | ✕ | ✕ | ✓ |
| Works fully offline | ✓ | ✕ | ✓ |
| Modern desktop UI | ✕ | `Web only` amber | ✓ |
| Import from Anki (.apkg) | — | ✕ | ✓ |
| Cloud sync | `AnkiWeb only` amber | ✓ | ✓ + `Supabase` in DM Mono MIST |
| Price | `Free` in TEAL | `$35/yr` | `Free beta` in TEAL |

---

## 9. CTA / Waitlist

**ID:** `waitlist`  
**Background:** `#0F1117` (INK — dark section)  
**Padding:** `120px 32px`  
**Text align:** center

Decorative orb: centered radial gradient `rgba(43,191,164,0.07) → transparent`, 600×600px, position absolute, centered.

**Headline (DM Serif Display, `clamp(36px, 5vw, 60px)`, `#FFFFFF`, centered, line-height 1.1):**
`Study` *`smarter`* `before your next shelf.`
- `smarter` is italic, colored `#2BBFA4`

**Subheadline (Outfit 300, 17px, `#BEC5D4`, centered, line-height 1.6, max-width 640px, margin-bottom 40px):**
`SEKEL is in development and opening to beta users soon. Join the waitlist to be first in line — and to help shape what gets built next.`

**Email form (flex row, gap `10px`, max-width `440px`, centered, flex-wrap):**
- Input: `flex: 1`, min-width `220px`, `rgba(255,255,255,0.06)` bg, `1px solid rgba(255,255,255,0.12)` border, border-radius `6px`, padding `12px 16px`, Outfit 400, 14px, `#FFFFFF` text, placeholder `your@email.edu` in MIST
  - Focus: border-color `#2BBFA4`
- Button: label `Join Waitlist`, `#2BBFA4` bg, `#0F1117` text, padding `12px 22px`, border-radius `6px`, Outfit 600, 14px
  - Box-shadow: `0 4px 16px rgba(43,191,164,0.15)`
  - Hover: background `#24a88f`, `translateY(-1px)`

**Confirmation message (hidden initially, shown after valid email submit):**
- Text: `You're on the list. We'll be in touch.`
- Color: `#2BBFA4`, DM Mono

**Note below form:**
`No spam. No credit card. Just early access.` — DM Mono 10px, `#8B93A8`

**Platform badges (flex row, gap `20px`, margin-top `32px`, centered):**
Each badge: `rgba(255,255,255,0.04)` bg, `1px solid rgba(255,255,255,0.08)` border, padding `8px 14px`, border-radius `6px`, Outfit 400, 13px, `#BEC5D4`
- Windows badge: 🪟 icon + `Windows`
- macOS badge: 🍎 icon + `macOS`

**Form behavior (JavaScript):**
- On submit: validate `@` in email value
- Invalid: set input border-color to `#E05C6A` (ROSE)
- Valid: hide input + button, show confirmation message

---

## 10. Footer

**Background:** `#0F1117` (INK)  
**Border-top:** `1px solid #2E3348` (INK_MUTED)  
**Padding:** `60px 32px 40px`

**Top section (4-column grid, gap `48px`, margin-bottom `48px`):**

Column 1 — Brand:
- Logo: DM Serif Display, 28px — `SEK` in `#FFFFFF`, `EL` in `#2BBFA4`
- Description (Outfit 300, 13px, `#8B93A8`, line-height 1.6, max-width `240px`): `AI-powered study prioritization for medical students. Built on official exam blueprints and your personal performance data.`

Column 2 — Product:
- Label: `Product` (DM Mono 9px, `#8B93A8`, uppercase, letter-spacing 0.14em)
- Links: `How It Works`, `Features`, `Supported Exams`, `Compare`

Column 3 — Exams:
- Label: `Exams`
- Links: `USMLE Step 1`, `USMLE Step 2 CK`, `NBME Shelf Exams`, `NCLEX-RN`

Column 4 — Company:
- Label: `Company`
- Links: `About`, `Blog`, `Privacy Policy`, `Terms of Service`

Footer link style: Outfit 400, 13px, `#4A5270`. Hover: `#FFFFFF`.

**Bottom bar (border-top: `1px solid #2E3348`, padding-top `24px`, flex row, justify space-between):**
- Left: `© 2026 SEKEL. All rights reserved.` — DM Mono 10px, `#8B93A8`
- Right: `Privacy`, `Terms`, `Contact` links — DM Mono 10px, `#8B93A8`, gap `24px`. Hover: `#BEC5D4`

---

## JavaScript Behaviors

### 1. Scroll Reveal
All elements with class `reveal` start at `opacity: 0, translateY(24px)` and transition to visible when entering the viewport.
- Uses `IntersectionObserver` with `threshold: 0.1`
- When intersecting: add class `visible` which sets `opacity: 1, transform: none`
- Transition: `opacity 0.6s ease, transform 0.6s ease`
- Delay variants: `reveal-delay-1` (0.1s), `reveal-delay-2` (0.2s), `reveal-delay-3` (0.3s)

### 2. Active Nav Link Highlight
On `window scroll`, iterate `section[id]` elements. If `scrollY >= section.offsetTop - 100`, set that section's id as current. Set matching nav link color to `#0F1117`; reset others.

### 3. Waitlist Form
```js
function handleWaitlist() {
  const email = document.getElementById('emailInput').value;
  if (!email || !email.includes('@')) {
    document.getElementById('emailInput').style.borderColor = '#E05C6A';
    return;
  }
  document.getElementById('emailInput').style.display = 'none';
  document.querySelector('.cta-btn').style.display = 'none';
  document.getElementById('waitlist-confirm').style.display = 'block';
}
```

---

## Responsive Breakpoint (≤768px)

- Nav links hidden
- Hero headline: `font-size: 38px`
- Mockup body: single column
- Problem grid: single column
- Yield inner: single column
- Steps grid: single column
- Features grid: single column (featured card also single column)
- Blueprints grid: single column
- Compare table: hide Anki and Quizlet columns (show only Feature + SEKEL)
- Footer top: single column, gap `32px`

---

## Section Scroll Anchors

| Anchor | Section |
|---|---|
| `#how-it-works` | How It Works |
| `#features` | Features |
| `#blueprints` | Exam Blueprints |
| `#compare` | Comparison Table |
| `#waitlist` | CTA / Waitlist |
| `#yield` | Yield System |
| `#problem` | Problem |

---

## Design Decisions to Preserve

1. **Hero is dark (`#0F1117`).** Every other section alternates between `#FFFFFF` and `#F4F6FB`, with the How It Works, Compare, and CTA sections also on `#0F1117`. This light-dark-light rhythm gives the page visual breathing room.

2. **The app mockup in the hero is a custom HTML component**, not an image. It must actually render the AI panel + flashcard UI using the SEKEL component styles.

3. **Section labels use DM Mono, uppercase, `#2BBFA4`, letter-spacing `0.16em`.** This is the consistent pattern across every section. On dark sections the label color stays teal. On light sections it also stays teal.

4. **Section headlines use DM Serif Display.** The display font is only used for section headlines (and the logo). Body, feature cards, and everything else is Outfit.

5. **Teal is used only for action (CTAs, links) and AI-related surfaces.** It does not appear as a decorative color anywhere.

6. **The yield pill system always shows 3 states** (High / Medium / Low) with teal / amber / mist semantics. Never show yield without the exam context next to it.

7. **The comparison table SEKEL column is visually distinct** — teal header color, subtle teal left border, slightly tinted background. The point of the table is that SEKEL wins every row that matters.

8. **No gamification language anywhere.** No "🔥 streak", no "level up", no "you're on a roll". The tone is precise and calm throughout.
