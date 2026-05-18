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

---

## Pipeline rework with chapter grid (2026-05-14, SEKEL-132)

A user uploaded a 1,400-page NAPLEX exam ebook (Feedback-003) and reported that generated flashcards didn't cover most of the book. Investigation showed `summarizeDocumentContent` truncated extracted text to the first 100K characters (~70 pages), then `generateGlobalSummary` asked the LLM to chunk those summaries into card-generation chunks. End result: cards came from chunks of a summary of the first 5% of any large document.

The shipped fix has three parts:

1. **Lossless extraction within the page cap.** The summarize-then-chunk pipeline is replaced with a deterministic local chunker plus a sampled overview LLM call. Source text flows end-to-end into the card-generation step. PDFs are capped at `MAX_PDF_PAGES = 500` (see [PDF page cap](#pdf-page-cap) below); within that window, nothing is summarized away.
2. **Content-aware classifier.** The chunker groups chunks into sections and classifies each as `chapter`, `frontmatter`, `references`, `appendix`, or `content`. Non-chapter sections (Preface, Acknowledgments, References, Index, etc.) are filtered out of the card-generation flow — they never reach the user-facing UI as options.
3. **Chapter grid UI.** The "analyze" step replaces the previous topic sidebar with a grid of chapter cards. Each detected chapter is its own card; clicking "Generate cards" on a chapter opens the card-generation flow scoped to that chapter only. A 1,400-page book becomes "study Chapter 3 today, Chapter 4 tomorrow" instead of asking the model to magically condense everything into one generation. Chapters that have already had cards generated in the current session show a green check.

### New flow

```
upload   → extract raw text (no LLM, no truncation)
         → return { content }

analyze  → chunkDocumentWithSections() locally, no LLM
         → sampled overview LLM call: summary + topics only
         → returns { summary, topics, chunks, sections, estimatedCardCount }

review   → render chapter grid (kind === 'chapter' filter; fallback to all
            sections for unstructured docs)
         → user clicks "Generate cards" on a chapter card

generate → AICardGenerator scoped to that chapter's chunks only
         → existing per-chunk card pipeline (unchanged)
         → onComplete returns to chapter grid; that chapter is marked
            as "generated" for the rest of the session
```

### PDF page cap

PDFs are extracted via `pdf-parse` with `{ max: MAX_PDF_PAGES }` (currently 500). Pages beyond the cap are not rendered, so very large textbooks get a consistent first-500-pages experience instead of unbounded processing time and IPC payloads. Non-PDF inputs (DOCX, PPTX, TXT, YouTube transcripts) have no equivalent cap because their typical sizes don't run into the same problem.

### Section detection & classification

`chunkDocumentWithSections()` in `apps/desktop/src/lib/textChunker.ts` returns both flat chunks (for the card generator) and `DocumentSection[]` (for filtering / grouping in the renderer). Headings are detected via a regex covering:

- Markdown headers (`#`–`######`)
- Numbered structures (`Chapter N`, `Section N`, `Part N`, `Module N`, `Unit N`, `Lesson N`)
- Subsection numbering (`N.M Some Title`)
- Named sections (`Preface`, `Foreword`, `Acknowledgments`, `Dedication`, `Table of Contents`, `About the Author(s)`, `Contributors`, `Copyright`, `Introduction`, `Prologue`, `Epilogue`, `Afterword`, `References`, `Bibliography`, `Works Cited`, `Index`, `Glossary`, `Appendix A/B/...`, `Supplementary`)

Each section is then classified by `classifySection(title, wordCount)` into one of:

| Kind          | Shown in chapter grid?           | Examples                                  |
|---------------|----------------------------------|-------------------------------------------|
| `chapter`     | Yes                              | "Chapter 5 Pharmacokinetics", "Part 2"   |
| `content`     | Only when no chapters detected   | "The blood-brain barrier..."             |
| `frontmatter` | No (listed in "Filtered out")    | "Preface", "Introduction", "About Authors"|
| `references`  | No (listed in "Filtered out")    | "References", "Bibliography", "Index"    |
| `appendix`    | No (listed in "Filtered out")    | "Appendix A: Conversion Tables"          |

Documents with no detectable heading structure (single Word doc, YouTube transcript, single-chapter PDF) collapse into a single `Document content` section that becomes the lone card in the grid.

Note: chapter pattern matches win over frontmatter when both apply. "Chapter 5 Introduction to Cardiology" is classified as a chapter despite containing "Introduction".

### Why no overlap

The per-chunk card pipeline at [`ai.ts distributeCards`](../../../../apps/desktop/src/ipc/ai.ts) weights generation by `chunk.text.length`. Overlap would double-count shared content and produce duplicate cards. Sections are partitioned cleanly; every chunk belongs to exactly one section.

### Implementation notes

- `apps/desktop/src/lib/textChunker.ts` — pure, unit-tested (30 tests). Recursive priority split (heading regex → `\n\n` → `\n` → sentence terminator → space → hard cut). `chunkText()` remains exported as a thin wrapper for callers that only need flat chunks.
- `pdf-parse` joins pages with `\n\n`, so the paragraph-priority separator implicitly respects page boundaries without PDF-specific code.
- `summarizeDocumentContent` is kept in `document_parsing.ts` as a rollback escape hatch — restoring the per-document summarize call in the `parse-document` handler reverts to summary-based behavior without further changes downstream.
- The renderer (`DocumentsPage.tsx`) holds `sections`, `activeChapterId`, and `generatedChapterIds`. The chapter grid filters to `kind === 'chapter'` (or all sections when no chapters detected). Per-chapter generation is scoped via `activeChapterChunks` — only chunks belonging to the active chapter reach `AICardGenerator`. `AICardGenerator` itself is unchanged — it still consumes a flat `Chunk[]`, just a chapter-scoped one.
- A "Filtered out" inline summary at the bottom of the grid lists the section titles that were excluded, so users can see what the classifier dropped.
- Generated-chapter tracking is in-memory for the current session only (cleared on re-upload). Persisting "I've made cards from Chapter 3 of this book" across sessions would require linking decks/notes to source sections, which is deferred.

### Known limitations carried forward

- **CJK languages.** Word counts are whitespace-split, so Chinese/Japanese sections appear smaller than they are.
- **No manual section overrides.** Users can't yet promote a frontmatter section back into the chapter grid or split/merge auto-detected sections. If the classifier misclassifies a real chapter (e.g., misses an unusual heading style), the user has to re-upload with cleaner structure.
- **Section-level summaries are still deferred.** The earlier-scoped "deep analysis per section" feature is not part of this rework; chapter cards show word count and capacity but not a per-chapter summary blurb.
