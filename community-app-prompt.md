# SEKEL Community — Build Prompt

## Overview

Create a new Next.js application at `/apps/community/` that serves as the public-facing community deck hub for SEKEL. This is the equivalent of AnkiWeb's shared deck library — a web interface where users can browse, search, and add shared study decks. **No user authentication is required at this stage.** This is a standalone webview that will be connected to Vercel with a proper domain later.

---

## Design Direction

Before writing any code, review the stylescapes located in `/stylescape/` to understand the visual language, color palette, typography, spacing, and overall aesthetic direction for SEKEL. All UI decisions — colors, fonts, border radii, card styles, spacing rhythm, button treatments, hover states — should be derived from and consistent with these stylescapes. Do not use generic defaults.

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State:** React hooks (no external state management needed)
- **Icons:** Lucide React
- **No authentication** — no login, no signup, no user sessions
- **No database** — use mock data for now with a clearly defined type system so a real backend (Supabase) can be swapped in later

---

## Shared UI Packages (`/packages/`)

Before creating any new shared UI, **inspect the existing `/packages/` directory first.** The project already has established conventions for how shared packages are organized, named, scoped, and exported. Your job is to follow those conventions exactly — not invent new ones.

**Steps:**

1. **Audit `/packages/`** — Read every existing package's `package.json`, `index.ts` (or barrel export), and directory structure. Note the naming convention (e.g., `@sekel/ui`, `@sekel/utils`, or however packages are scoped), the folder layout, and how components are exported.
2. **Reuse before creating** — If a shared component already exists (Button, Input, Card, Modal, etc.), import and use it. Do not duplicate it inside `/apps/community/components/`.
3. **Extend where appropriate** — If you need a new generic, reusable component (e.g., StarRating, Pagination, FileUploadZone, TagInput, Skeleton), add it to the appropriate existing package following the same file naming, export pattern, and style conventions already in place.
4. **Create new packages only if the existing structure calls for it** — If the project has separate packages for UI, tokens, and utils, add to those. If it's all in one package, keep it in one package. Match what's there.
5. **Domain-specific components stay in the app** — Components specific to the community app's domain logic (DeckCard, DeckGrid, DeckDetail, SearchFilters, AddDeckForm) live in `/apps/community/components/` but should **compose** from the shared `/packages/` primitives.

**Do not assume a structure. Read the project first.**

---

## Directory Structure

```
apps/community/
├── app/
│   ├── layout.tsx              # Root layout with global nav
│   ├── page.tsx                # Home / landing — featured decks + search
│   ├── decks/
│   │   ├── page.tsx            # Browse all decks (grid + filters + search)
│   │   └── [id]/
│   │       └── page.tsx        # Individual deck detail page
│   └── add/
│       └── page.tsx            # Add/submit a new deck form
├── components/                   # Domain-specific components (compose from @sekel/ui)
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── deck/
│   │   ├── DeckCard.tsx        # Card component for grid display
│   │   ├── DeckGrid.tsx        # Responsive grid of DeckCards
│   │   ├── DeckDetail.tsx      # Full deck detail view
│   │   └── DeckStats.tsx       # Card count, download count, rating
│   ├── search/
│   │   ├── SearchBar.tsx       # Composes @sekel/ui Input + icons
│   │   └── SearchFilters.tsx   # Composes @sekel/ui Select, Badge
│   └── form/
│       └── AddDeckForm.tsx     # Composes @sekel/ui Input, Select, FileUploadZone, TagInput
├── lib/
│   ├── types.ts                # All TypeScript interfaces
│   ├── mock-data.ts            # Mock deck data
│   └── utils.ts                # Helper functions (search, filter, sort)
├── public/
│   └── images/                 # Placeholder deck thumbnails
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── next.config.js
```

---

## Type Definitions (`lib/types.ts`)

Define these core types. They should mirror what an Anki-style system would store:

```typescript
interface Deck {
  id: string;
  title: string;
  description: string;
  author: string;
  category: DeckCategory;
  tags: string[];
  cardCount: number;
  downloadCount: number;
  rating: number;          // 1-5 scale
  ratingCount: number;
  thumbnailUrl?: string;
  createdAt: string;       // ISO date
  updatedAt: string;       // ISO date
  sampleCards: SampleCard[];
}

interface SampleCard {
  front: string;
  back: string;
}

type DeckCategory =
  | "Languages"
  | "Medicine"
  | "Science"
  | "Mathematics"
  | "History"
  | "Geography"
  | "Computer Science"
  | "Music"
  | "Art"
  | "Law"
  | "Business"
  | "Other";

interface DeckFormData {
  title: string;
  description: string;
  author: string;
  category: DeckCategory;
  tags: string[];
  file?: File;             // .apkg upload placeholder
}

interface SearchParams {
  query: string;
  category?: DeckCategory;
  sortBy: "popular" | "newest" | "rating" | "most-cards";
}
```

---

## Pages & Features

### 1. Home Page (`/`)

The landing page for the community hub.

- **Hero section** with a headline like "Discover Community Decks" and a prominent search bar
- **Featured Decks** — a curated row of 4-6 highlighted decks (use mock data with `featured: true` flag)
- **Category quick-links** — visual grid or pill buttons for each `DeckCategory` that link to `/decks?category=X`
- **Recently Added** — latest 6 decks in a grid
- **Stats bar** — total decks available, total cards across all decks, total downloads (computed from mock data)

### 2. Browse Decks (`/decks`)

The main browsing and search experience.

- **Search bar** (persistent at top) — filters decks by title, description, author, or tags as the user types (client-side filtering on mock data)
- **Filter sidebar or top bar:**
  - Category dropdown or pill selector
  - Sort by: Popular, Newest, Highest Rated, Most Cards
  - Tags (extracted from all decks, shown as clickable pills)
- **Deck grid** — responsive grid of `DeckCard` components
  - Mobile: 1 column
  - Tablet: 2 columns
  - Desktop: 3-4 columns
- **Empty state** — friendly message when no decks match the search/filter
- **Pagination or infinite scroll** — implement basic pagination (12 decks per page)

### 3. Deck Detail (`/decks/[id]`)

Full detail view for a single deck.

- **Deck header:** title, author, category badge, rating stars, download count
- **Description** — full markdown-rendered description
- **Stats row:** card count, download count, rating, date added, last updated
- **Sample Cards** — show 3-5 sample flashcards in a flip-card UI (click to reveal the back)
- **Tags** — displayed as pills, clickable to navigate back to `/decks?tag=X`
- **Download button** — a prominent CTA button (non-functional for now, just a styled placeholder). Include a tooltip or note: "Download .apkg"
- **"Report Deck" link** — placeholder, non-functional

### 4. Add Deck (`/add`)

A form for submitting a new deck to the community.

- **Form fields:**
  - Title (required, text input)
  - Author name (required, text input)
  - Description (required, textarea with character count)
  - Category (required, select dropdown)
  - Tags (comma-separated text input that converts to pills)
  - File upload zone (drag-and-drop area for .apkg files — UI only, no actual upload processing)
- **Form validation:** client-side validation with inline error messages
- **Preview panel:** as the user fills out the form, show a live preview of how their `DeckCard` will look
- **Submit button:** on submit, show a success toast/modal ("Deck submitted for review!") and reset the form. No actual backend call.

---

## Components

### DeckCard

- Thumbnail image (or gradient placeholder with category icon)
- Title (truncated to 2 lines)
- Author name
- Category badge
- Star rating (visual, not interactive)
- Card count + download count as small stats
- Hover state: subtle lift/shadow animation
- Entire card is clickable, links to `/decks/[id]`

### SearchBar

- Full-width input with search icon
- Debounced input (300ms) to avoid excessive re-renders
- Clear button when text is present
- Keyboard shortcut hint (Cmd+K or Ctrl+K to focus)

### Navbar

- SEKEL logo/wordmark (left)
- Navigation links: Home, Browse Decks, Add Deck
- Search icon that expands into SearchBar on click (mobile)
- Responsive: hamburger menu on mobile

### Footer

- Minimal: copyright, links to Terms/Privacy/About (placeholder hrefs)

---

## Mock Data (`lib/mock-data.ts`)

Generate 20-30 realistic mock decks covering a variety of categories. Each should have:

- Realistic titles (e.g., "Spanish 5000 Most Common Words", "USMLE Step 1 Pathology", "Japanese Kanji N5-N3")
- Meaningful descriptions (2-3 sentences)
- Realistic stats (card counts ranging from 50 to 10,000+)
- 3-5 sample cards per deck with real-looking content
- Varied ratings, download counts, and dates

---

## UX Details

- **Loading states:** skeleton loaders on the deck grid while "loading" (simulate with a brief timeout)
- **Transitions:** smooth page transitions, cards should animate in on scroll (use Framer Motion or CSS animations)
- **Responsive:** mobile-first design, every page must work well on phone, tablet, and desktop
- **Accessibility:** proper aria labels, keyboard navigation, focus states, semantic HTML
- **Dark mode:** support system preference with a manual toggle in the navbar (refer to stylescapes for dark palette)
- **Search should feel instant** — since it's client-side on mock data, there should be zero perceptible lag

---

## What NOT to Build

- No user authentication (no login, signup, sessions, or protected routes)
- No real backend or database (Supabase integration comes later)
- No actual file upload processing (just the UI)
- No real download functionality (just styled buttons)
- No admin panel
- No comments or reviews system
- No real-time features

---

## Quality Checklist

Before considering this complete:

- [ ] All pages render without errors
- [ ] Search works across title, description, author, and tags
- [ ] Category filtering works
- [ ] Sort options work (popular, newest, rating, most cards)
- [ ] Deck detail page shows all information
- [ ] Sample card flip animation works
- [ ] Add deck form validates and shows success state
- [ ] Responsive on mobile, tablet, and desktop
- [ ] Dark mode toggle works
- [ ] No TypeScript errors
- [ ] Visual style matches the stylescapes in `/stylescape/`
