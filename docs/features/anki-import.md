# Anki Import (.apkg)
> End-to-end implementation of Anki deck import — parsing, insertion, media extraction, progress UI, and card rendering with media.

---

## Overview

Sekel can import Anki `.apkg` files, preserving deck hierarchy, note types, notes, cards, scheduling state, review history, and media files. The feature is implemented in eight phases across the Electron main process and renderer, with a custom `sekel-media://` protocol for serving imported media to the renderer securely.

---

## Architecture

```
Renderer (ImportAnkiButton)
  ↓ file picker → import:analyze IPC
Main: apkgExtractor.ts        — unzip .apkg to temp dir
Main: parser.ts               — parse collection.anki2 SQLite → ParsedApkgData
  ↓ import:summary → renderer
Renderer (ImportOptionsModal) — user sets conflict/scheduling/algorithm per deck
  ↓ import:confirm IPC
Main: importOptionsLogic.ts   — build DeckImportOptions[]
Main: insertionEngine.ts      — single SQLite transaction: decks → note types → notes → cards → reviews
Main: mediaExtractor.ts       — extract media files → {userData}/media/{sha1}{ext}, record in DB
  ↓ result → renderer
Renderer (ImportSuccessModal / ImportErrorModal)

Renderer card rendering:
  StudySession.tsx
    → renderAnkiTemplate()    — conditionals → FrontSide → field substitution → media URLs
    → src/lib/mediaResolver.ts — resolveMediaInHtml(), resolveConditionals(), substituteFields()
    → sekel-media://{userId}/{filename} — handled in main.ts protocol.handle()
    → service.fetchMediaByFilename()   — looks up file_path from media table
    → net.fetch(file://{file_path})    — serves file from disk
```

---

## Key Files

| File | Role |
|------|------|
| `apps/desktop/src/ipc/import.ts` | IPC handlers: `import:analyze`, `import:summary`, `import:confirm`, `import:cancel` |
| `apps/desktop/src/main/import/apkgExtractor.ts` | Unzips `.apkg` to temp dir, validates format |
| `apps/desktop/src/main/import/parser.ts` | Reads `collection.anki2` SQLite → `ParsedApkgData` |
| `apps/desktop/src/main/import/importOptionsLogic.ts` | Detects conflicts, builds per-deck options |
| `apps/desktop/src/main/import/insertionEngine.ts` | Transactional insertion of all Anki data; handles skip/overwrite/merge conflicts; imports review logs when `scheduling: 'keep'` |
| `apps/desktop/src/main/import/mediaExtractor.ts` | Extracts media from zip, deduplicates by SHA1, stores in `{userData}/media/` |
| `apps/desktop/src/main/import/tempCleanup.ts` | Cleans stale temp dirs on startup |
| `apps/desktop/src/main/import/types.ts` | Shared types: `ParsedApkgData`, `AnkiDeck`, `AnkiNote`, `AnkiCard`, `AnkiReviewLog`, `DeckImportOptions` |
| `apps/desktop/src/lib/mediaResolver.ts` | Pure renderer-accessible functions: `resolveMediaInHtml`, `resolveConditionals`, `substituteFields`, `renderAnkiTemplate` |
| `apps/desktop/src/main.ts` | Registers `sekel-media://` as privileged scheme; handles protocol to serve media from disk |
| `apps/desktop/src/components/Import/ImportAnkiButton.tsx` | File picker + progress/success/error state machine |
| `apps/desktop/src/components/Import/ImportOptionsModal.tsx` | Per-deck conflict + scheduling + algorithm selection |
| `apps/desktop/src/components/Import/ImportProgressModal.tsx` | Live progress bar with cancel button |
| `apps/desktop/src/components/Import/ImportSuccessModal.tsx` | Import result summary |
| `apps/desktop/src/components/Import/ImportErrorModal.tsx` | Error display with retry |
| `apps/desktop/src/components/Study/StudySession.tsx` | Detects Anki cards (`noteType.anki_id != null`) and routes to `renderAnkiTemplate` |
| `apps/desktop/src/__tests__/insertionEngine.test.ts` | Unit tests for insertion engine (in-memory SQLite) |
| `apps/desktop/src/__tests__/mediaResolver.test.ts` | Unit tests for mediaResolver |
| `apps/desktop/src/__tests__/parser.test.ts` | Unit tests for Anki parser |

---

## Data Model Additions

The Anki import adds `anki_id` columns to existing tables to track origin and enable deduplication on re-import:

- `decks.anki_id` — Anki deck integer ID
- `note_types.anki_id` — Anki note type integer ID
- `notes.anki_id` / `notes.anki_guid` — Anki note ID and GUID (GUID used for merge conflict detection)
- `cards.anki_id` — Anki card integer ID

A new `media` table stores imported media records:

```sql
CREATE TABLE media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    import_id TEXT NOT NULL,        -- temp dir path, for cleanup on cancel
    filename TEXT NOT NULL,         -- original Anki filename
    file_path TEXT NOT NULL,        -- absolute path on disk
    sha1 TEXT NOT NULL,             -- for deduplication
    created_at TEXT NOT NULL
);
```

---

## Import Phases

| Phase | What happens |
|-------|-------------|
| 1 | User picks `.apkg` file via file dialog |
| 2 | `apkgExtractor` unzips to temp dir, validates `collection.anki2` exists |
| 3 | `parser` reads the Anki SQLite — decks, note types, notes, cards, revlog |
| 4 | `importOptionsLogic` detects conflicts with existing Sekel decks, returns `ImportSummary` |
| 5 | User reviews `ImportOptionsModal`, sets conflict strategy / scheduling / algorithm per deck |
| 6 | `insertionEngine` executes a single transaction: decks (parent-first) → note types (deduped by `anki_id`) → notes → cards → review logs (when `scheduling: 'keep'`) |
| 7 | `mediaExtractor` copies media files to `{userData}/media/`, SHA1-deduplicates, writes `media` rows |
| 8 | Progress UI advances through stages; `ImportSuccessModal` or `ImportErrorModal` shown |

---

## Conflict Strategies

Per-deck, selected in `ImportOptionsModal`:

| Strategy | Behavior |
|----------|----------|
| `skip` | Existing deck is left untouched; import skipped for that deck |
| `overwrite` | Existing notes/cards deleted; fresh import |
| `merge` | Only notes with new GUIDs added; existing GUIDs skipped |

---

## Scheduling Strategies

| Strategy | Behavior |
|----------|----------|
| `keep` | Card state (due date, stability, difficulty) preserved from Anki; review logs imported |
| `fresh` | All cards reset to `new` state; no review logs imported |

---

## sekel-media:// Protocol

Anki cards reference media by bare filename (e.g. `<img src="cat.jpg">`). Electron's security model blocks `file://` URLs in the renderer. A custom privileged scheme is used instead.

**Registration** (must happen before `app.whenReady()`):
```ts
protocol.registerSchemesAsPrivileged([
  { scheme: 'sekel-media', privileges: { secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
```

**Handler** (inside `app.whenReady()`):
```ts
protocol.handle('sekel-media', (request) => {
  const url = new URL(request.url);
  const userId = decodeURIComponent(url.hostname);
  const filename = decodeURIComponent(url.pathname.slice(1));
  const record = fetchMediaByFilename(userId, filename);
  if (!record) return new Response(null, { status: 404 });
  return net.fetch('file:///' + record.file_path.replace(/\\/g, '/'));
});
```

**URL format:** `sekel-media://{userId}/{originalFilename}`

**CSP** (`index.html` meta tag must include):
```
img-src 'self' data: https: sekel-media:;
media-src 'self' sekel-media:;
```

---

## Anki Template Rendering

`src/lib/mediaResolver.ts` exposes pure functions used by `StudySession.tsx`:

```
renderAnkiTemplate(template, fields, userId, frontHtml?)
  1. resolveConditionals  — {{#Field}}...{{/Field}} and {{^Field}}...{{/Field}}
  2. FrontSide replacement — {{FrontSide}} → frontHtml (back template only)
  3. substituteFields     — {{FieldName}} → field value (skips FrontSide and cloze tokens)
  4. resolveMediaInHtml   — bare img src / [sound:] → sekel-media:// URLs
```

**Important:** FrontSide replacement must happen before `substituteFields`. The `substituteFields` regex excludes `{{FrontSide}}` via negative lookahead to prevent it being wiped when rendering the front template independently.

---

## Cancellation

`import:cancel` IPC sets a flag keyed by `tempDir`. The insertion engine and media extractor check it between major iterations (between decks, between media files) and throw `CancelledError`. On cancel: temp dir removed, media rows with matching `import_id` deleted, transaction rolled back.

---

## Key Decisions

1. **Single transaction for all insertion** — decks, note types, notes, cards, and reviews are inserted in one SQLite transaction. This ensures atomicity: a failed import leaves no partial data.

2. **Review logs use direct SQL, not `insertReview()`** — `insertReview()` calls `pushRecord` which would push thousands of historical records to Supabase. Historical revlog is inserted via a raw prepared statement with no sync side effect.

3. **Media deduplication by SHA1** — the same image file imported from multiple decks is stored once on disk. The `media` table can have multiple rows pointing to the same `file_path`.

4. **`anki_id` on note types is the dedup key** — Anki reuses note type IDs across decks in the same collection. A note type is only created once even if multiple decks share it.

5. **`noteType.anki_id != null` detects Anki cards** — `StudySession` uses this to route to `renderAnkiTemplate` vs the native card renderer. Requires `nt.anki_id AS nt_anki_id` in the `CARD_WITH_NOTE_SQL` query.

6. **Anki-imported cards skip Supabase sync on review** — `updateCardAfterReview` skips `pushRecordAsync` when `result.anki_id` is set, preventing FK violations (Anki notes/cards don't exist in Supabase). The long-term fix is to push imported data to Supabase during import.

---

## Known Limitations / Future Work

- **Anki data not synced to Supabase on import** — imported decks/notes/cards exist only in local SQLite. Review pushes for Anki cards fail with FK violations. Proper fix: push inserted records to Supabase in dependency order during `import:confirm`.
- **No card browser** — the deck detail page shows notes, not individual cards. A card browser showing each card's template, FSRS state, and due date is a planned follow-up.
- **No media orphan cleanup** — deleting a deck leaves its media files and DB rows on disk. A vacuum/cleanup job is needed for decks with no remaining references to media filenames.
- **Cloze note types** — cloze deletions are not fully rendered (cloze syntax left as-is). Full cloze support requires a dedicated renderer pass.
