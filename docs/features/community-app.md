# Community App — Implementation Notes

## Overview

The SEKEL Community app (`apps/community/`) is a public-facing deck hub where users can browse, search, and submit shared flashcard decks. It is the equivalent of AnkiWeb's shared deck library.

- **No authentication** — fully public, no login required
- **No real backend** — mock data only; Supabase integration comes later
- **Standalone Next.js app** — deployable to Vercel independently of the marketing site
- **Port:** 3001 (dev), separate from `apps/web` on port 3000

---

## Architecture

### Package Structure

```
sekel-monorepo/
├── apps/community/             # Thin Next.js app — pages + mock data only
└── packages/
    ├── community-components/   # All community UI components, types, and utilities
    └── web-components/         # Extended with ScrollReveal + Toast (shared)
```

### `@sekel/community-components`

All reusable community code lives here, not in the app. This includes:

- **Types** (`src/types.ts`): `Deck`, `SampleCard`, `DeckCategory`, `DeckFormData`, `SearchParams`
- **Utils** (`src/utils.ts`): `filterAndSortDecks`, `paginateDecks`, `getAllTags`, `computeStats`, `formatNumber`, `formatDate`, `getCategoryGradient`
- **Layout**: `CommunityNavbar`, `CommunityFooter`
- **Deck components**: `DeckCard`, `DeckGrid`, `DeckDetail`, `DeckStats`, `FlipCard`, `SkeletonCard`
- **Search**: `SearchBar`, `SearchFilters`
- **Form**: `AddDeckForm`, `TagInput`, `FileDropZone`
- **UI primitives**: `StarRating`, `Pagination`, `CategoryBadge`

> **Why utilities live in the package:** Next.js prohibits passing functions as props from Server Components to Client Components. By keeping `formatNumber`, `getCategoryGradient`, etc. inside the package, components can import them directly without crossing the RSC boundary.

### `@sekel/web-components` — Extensions

Two generic components were added to `src/ui/` during SEKEL-013:

| Component | Purpose |
|-----------|---------|
| `ScrollReveal` | Framer Motion `whileInView` wrapper for scroll animations |
| `Toast` | Fixed bottom notification with auto-dismiss |

These are exported from `@sekel/web-components` because they are generic enough to be used by both `apps/web` and `apps/community`.

---

## Pages

| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Hero + featured decks + category grid + recently added + stats bar |
| `/decks` | Dynamic | Browse with URL-synced search, filters, sort, pagination |
| `/decks/[id]` | SSG | Full deck detail with flip cards, stats, tags, download CTA |
| `/add` | Static | Submit form with live DeckCard preview and success toast |

### URL-synced Filters (`/decks`)

The browse page reads `searchParams` server-side and passes pre-filtered data to `DeckGrid` (a Client Component). When the user changes a filter, `DeckGrid` pushes updated query params via `useRouter().push()`, which triggers a server re-render with fresh data.

```
?query=spanish&category=Languages&sort=rating&tags=beginner,vocabulary&page=2
```

---

## Design System

All styles use SEKEL CSS custom properties from `globals.css` — no Tailwind.

### Key Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ink` | `#0F1117` | Primary text, dark backgrounds |
| `--paper` | `#F4F6FB` | Page background (light default) |
| `--teal` | `#2BBFA4` | CTAs, active states, filled stars |
| `--mist` | `#8B93A8` | Labels, metadata, secondary text |
| `--cloud` | `#E8ECF4` | Borders, dividers, inactive pills |
| `--rose` | `#E05C6A` | Error states, Medicine category |
| `--violet` | `#7C6EF5` | Math/CS/Art categories |
| `--amber` | `#F0A500` | History/Law/Business categories |

### Dark Mode

Follows the existing web app convention:

- **Default (no attribute):** light appearance (`--paper: #F4F6FB` background)
- **`data-theme="light"` on `<html>`:** dark appearance (`--paper: #111827` background)
- **localStorage key:** `sekel-community-theme` (namespaced from web app's `sekel-theme`)
- **Toggle location:** `CommunityNavbar`

> The naming is counterintuitive (inherited from the existing codebase): `data-theme="light"` creates the _dark_ visual appearance. This is by design — do not "fix" it without updating both apps.

### Typography

| Variable | Font | Usage |
|----------|------|-------|
| `--font-display` | DM Serif Display | Page headings, hero headline |
| `--font-body` | Outfit | Body text, labels, buttons |
| `--font-mono` | DM Mono | Stats, tags, section labels, badges |

---

## Mock Data

25 decks across all 12 categories in `apps/community/src/lib/mock-data.ts`. Each deck has:

- Realistic title, description, author, category, and tags
- `cardCount` (50–10,000+), `downloadCount`, `rating` (1–5), `ratingCount`
- `createdAt` / `updatedAt` ISO dates spread across the past 18 months
- 2–4 `sampleCards` with real flashcard content
- `featured?: boolean` flag on 5–6 decks (used by home page featured row)

---

## Adding Real Backend Later

When connecting to Supabase:

1. Replace `apps/community/src/lib/mock-data.ts` with Supabase query functions
2. Move data fetching into page Server Components (they already `await searchParams` — just swap mock data for DB calls)
3. The type definitions in `@sekel/community-components/src/types.ts` mirror the expected DB schema — minimal changes needed
4. The `AddDeckForm` submit handler currently shows a toast with no network call — wire it to a Next.js Server Action or API route
5. Consider adding `@sekel/db` as a dependency once auth is added

---

## Running the App

```bash
# From monorepo root
npm run dev -w @sekel/community   # http://localhost:3001

# Or run all apps together
turbo dev                          # web on :3000, community on :3001
```

## Building

```bash
npm run build -w @sekel/community
npm run typecheck -w @sekel/community
npm run lint -w @sekel/community
```
