# Per-Section Document Context & Card Generation
> Feature spec for granular, section-scoped AI review and flashcard generation — extending the high-level document summary introduced in SEKEL-031.

---

## Overview

The current AI review step (SEKEL-031) generates a single high-level summary of an uploaded document and lists detected sections as non-interactive sidebar items. This feature extends that flow so each section is independently analyzed by the AI, producing its own summary, key concepts, and card estimate. Users can navigate into any section's review context and generate flashcards scoped specifically to that section — enabling more targeted study material and tighter card quality.

This is a backlog feature. The SEKEL-031 sidebar UI is intentionally built to accommodate it (hover items, sidebar nav pattern) but no section-level logic has been implemented yet.

## Architecture

The change touches three layers: the Electron backend (AI calls), the IPC bridge, and the React review step.

```
apps/desktop/
├── src/
│   ├── components/AIStudy/
│   │   ├── DocumentsPage.tsx        — review step orchestrator; needs section nav state
│   │   └── AICardGenerator.tsx      — receives context; needs section-scoped context variant
│   └── lib/
│       └── ai.ts                    — wraps electronAPI calls; needs generateSectionSummary
electron/
└── handlers/
    └── ai.ts (or similar)           — IPC handler; needs new generateSectionSummaries call
```

**Data shape change** — `generateSummary` currently returns:
```ts
{
  summary: string;
  topics: string[];
  estimatedCardCount: number;
}
```

New shape adds per-section breakdown:
```ts
{
  summary: string;           // high-level, unchanged
  topics: string[];          // section titles, unchanged
  estimatedCardCount: number;
  sections: SectionContext[]; // new
}

interface SectionContext {
  title: string;
  summary: string;
  keyConceptCount: number;
  estimatedCardCount: number;
  sourceChunk: string;       // the raw text slice that produced this section
}
```

## Key Decisions

1. **Section detection stays AI-driven (for now).** The topics list returned by `generateSummary` already defines section boundaries. Rather than building a user-facing section editor, the initial implementation trusts AI segmentation. See Known Limitations.

2. **Section summaries generated in one batch call, not N individual calls.** Calling the AI once per section would be slow and expensive. The preferred approach is a single structured prompt that returns all `SectionContext` objects in one response, using a JSON output format.

3. **Right panel becomes a section router.** Clicking a sidebar item sets `activeSection` state (removed in SEKEL-031 cleanup, needs restoring). The right panel renders either the high-level view (no section selected) or a section detail view with that section's summary and a scoped "Generate Cards" action.

4. **Card generation stays in `AICardGenerator`.** Rather than a new component, pass `contextSummary` and `extractedText` scoped to the active section's `sourceChunk`. The generator doesn't need to know it's working on a section vs. the full doc.

5. **Deck-per-section is opt-in.** When generating from a section, pre-populate the deck selector with a suggested name (e.g. `"[Doc title] — [Section title]"`) but don't force it. Users may want all cards in one deck.

## Flow

```
Upload → Analyze (generateSummary returns sections[])
  │
  ├─ Default view: high-level summary + sidebar listing all sections
  │
  └─ Click section → section detail view
        ├─ Section summary
        ├─ Key concept count chip
        ├─ Estimated card count chip
        └─ "Generate Cards for this Section" → AICardGenerator(sourceChunk, sectionSummary)
```

The existing "Confirm & Generate Cards" footer button generates from the full document context as today — section generation is additive, not a replacement.

## Known Limitations / Future Work

- **AI segmentation is a black box.** If the model detects 3 sections in a 12-chapter document, or splits at paragraph boundaries rather than logical topics, users have no way to correct it. A future iteration could let users rename, merge, or split sections before generating.

- **`sourceChunk` accuracy is unverified.** Mapping a section title back to the exact source text that produced it requires either the AI to return offsets or a post-hoc fuzzy match. The first implementation should have the AI include `sourceChunk` directly in its structured response rather than attempting to re-slice client-side.

- **Cost.** A richer structured prompt returning full section summaries and source chunks will use significantly more tokens than the current `generateSummary` call. Consider making section-level analysis opt-in (a "Deep Analyze" button) rather than the default path.

- **YouTube transcripts.** Section detection on transcripts may produce low-quality boundaries (the AI segments by time/topic rather than explicit headings). May need a transcript-specific prompt variant.
