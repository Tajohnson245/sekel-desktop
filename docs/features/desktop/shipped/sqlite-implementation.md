# SQLite Local-First Architecture
> Implementation notes for the Sekel desktop app's local SQLite database — schema, data access layer, IPC bridge, and media handling.

---

## Overview

The Sekel desktop app uses SQLite as the sole database for all flashcard data. All reads and writes go to a local SQLite file (`sekel.db`) stored in the OS user data folder. Supabase is used exclusively for authentication and user profiles — it is never queried for decks, cards, notes, reviews, or any other flashcard data.

There is no sync layer. The app is fully offline-capable for all study features.

---

## Architecture

```
React Component
  ↓
TanStack Query hook
  ↓
window.electronAPI.db.*       (contextBridge, renderer → main)
  ↓
ipcMain.handle('db:*')        (apps/desktop/src/ipc/database.ts)
  ↓
main/db/service.ts            (better-sqlite3, synchronous)
  ↓
sekel.db  ({app.getPath('userData')}/sekel.db)   ← sole source of truth

User profile path (Supabase only):
  profileStore.ts → fetchUserProfile / upsertUserProfile (@sekel/db) → Supabase REST
```

---

## Key Files

| File | Role |
|------|------|
| `apps/desktop/src/main/db/index.ts` | Opens the SQLite file, sets WAL + FK pragmas, runs migrations. Exports `getDbPath()` for backup/restore. Supports safe reopen via `initDatabase()`. |
| `apps/desktop/src/main/db/migrations.ts` | Ordered SQL migration strings; `schema_version` table tracks applied migrations |
| `apps/desktop/src/main/db/service.ts` | All SQLite query/write functions (better-sqlite3 synchronous API). Hooks into deletion log before hard deletes. |
| `apps/desktop/src/ipc/database.ts` | IPC handler registration (`db:*` channels) including `db:saveMediaFile`, `db:exportSekel`, `db:importSekel`, `db:checkIntegrity`, `db:getDeletedItems` |
| `apps/desktop/src/preload.ts` | contextBridge — exposes `window.electronAPI.db.*` to renderer |
| `apps/desktop/src/types/electron.d.ts` | TypeScript types for the entire `db` API surface |
| `apps/desktop/src/stores/profileStore.ts` | Calls Supabase directly for user profile reads/writes |
| `apps/desktop/src/stores/authStore.ts` | Manages Supabase auth session; no IPC involvement post-login |
| `apps/desktop/src/components/Auth/ProtectedRoute.tsx` | Guards app behind auth check; renders immediately once session resolves |
| `apps/desktop/src/lib/storage.ts` | Saves card images to local media dir via `db:saveMediaFile` IPC |
| `packages/db/src/queries/user_profiles.ts` | Supabase query functions for `user_profiles` table |

---

## SQLite Schema

14 data tables tracked by version-controlled migrations in `migrations.ts`:

**Core flashcard data:**
- `note_types` — id, user_id, name, fields (JSON TEXT), card_templates (JSON TEXT), timestamps
- `decks` — id, user_id, name, description, algorithm (`fsrs`|`sm2`), parent_id (FK→decks), anki_id, timestamps
- `notes` — id, user_id, deck_id (FK→decks), note_type_id (FK→note_types), fields (JSON TEXT), tags (JSON TEXT), anki_id, anki_guid, timestamps
- `cards` — id, user_id, note_id (FK→notes), template_index, full FSRS state (state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review), anki_id, ease_factor, timestamps
- `reviews` — id, user_id, card_id (FK→cards), rating, review_time, duration_ms, before/after FSRS snapshots, session_id, deck_id, review_index, anki import fields, created_at
- `deck_sessions` — id, user_id, deck_id (FK→decks), status, started_at, completed_at, created_at
- `card_drafts` — id, user_id, front, back, source, created_at
- `media` — id, user_id, filename, file_path (absolute local path), file_hash (SHA1), file_size, mime_type, import_id, created_at

**Exam blueprint (populated at first run / on update):**
- `blueprint_exams` — exam registry (exam_key, label, source_url, version)
- `blueprint_systems` — organ systems per exam (system_key, label, exam_key FK, weight_min, weight_max)
- `blueprint_topics` — topics per system (topic_key, label, system_key FK, physician_task, relative_weight)

**Per-card exam data:**
- `card_classifications` — GPT classification results linking a card to a topic (card_id FK, exam_key FK, system_key FK, topic_key FK, confidence 0–1, split_weight 0–1, model_version, classified_at)
- `user_exam_profiles` — per-user exam setup (user_id, exam_key FK, deck_id FK, exam_date, is_primary, session_mode, last_notified_threshold, created_at, updated_at)

**Study management:**
- `time_travel_log` — audit record of every Time Travel redistribution (user_id, triggered_at, overdue_count, window_days, daily_target)

JSON columns (`fields`, `tags`, `card_templates`) are stored as `TEXT` and serialized/deserialized only at the `service.ts` boundary.

Migrations are append-only — never edit an existing migration entry.

---

## What Stays on Supabase

| Concern | How it's accessed |
|---------|------------------|
| auth.users (login, signup, session) | `@sekel/db` auth functions → Supabase Auth |
| user_profiles (profile CRUD) | `fetchUserProfile` / `upsertUserProfile` in `packages/db/src/queries/user_profiles.ts`, called from `profileStore.ts` in the renderer |
| Avatar uploads | Supabase Storage `avatars` bucket, called from `profileStore.ts` |
| respondents, study_tools, survey_responses | Research/survey tables — not part of the app runtime |

---

## Media Handling

Card images are stored locally, not in cloud storage.

**Import pipeline** (`apps/desktop/src/main/import/media.ts`):
- Extracts media files from `.apkg` archives to `{userData}/media/{sha1}{ext}`
- Deduplicates by SHA1 hash via `fetchMediaByHash`
- Records each file in the `media` SQLite table with its absolute `file_path`

**Manual uploads** (editor components → `lib/storage.ts`):
- File buffer is sent to the main process via `db:saveMediaFile` IPC
- Same SHA1 deduplication logic applies
- File saved to `{userData}/media/{sha1}{ext}`, media record inserted

**Serving**: `sekel-media://{userId}/{filename}` — the Electron main process registers this protocol in `main.ts`. It looks up `filename` in the `media` table to get `file_path`, then serves the file from disk via `net.fetch`.

---

## ProtectedRoute

`ProtectedRoute` (previously the sync gate) now only guards for auth state:

```tsx
if (isLoading) return <spinner>;
if (!user)     return <AuthPage />;
return <>{children}</>;
```

There is no initial sync, no loading screen for data fetching, and no dependency on network state at startup.

---

## Vite Configuration

`apps/desktop/vite.renderer.config.ts` uses `resolve.alias` to point `@sekel/components` directly to its TypeScript source:

```ts
resolve: {
    alias: {
        '@sekel/components': path.resolve(__dirname, '../../packages/components/src/index.ts'),
    },
    dedupe: ['react', 'react-dom', 'react-i18next', 'lucide-react', 'recharts'],
}
```

This prevents Vite from pre-bundling the workspace package (which caches old source) while still allowing Vite to handle transitive CJS dependencies (recharts → lodash).

`apps/desktop/vite.main.config.ts` externalizes `better-sqlite3` so Vite does not attempt to bundle the native `.node` binary.

`apps/desktop/forge.config.js` has `rebuildConfig: { force: true }` so `better-sqlite3` is rebuilt against the correct Electron Node ABI during packaging.

**NMV mismatch fix (monorepo):** In an npm workspace, `better-sqlite3` is hoisted to the root `node_modules`. Running `@electron/rebuild` from `apps/desktop` only scans `apps/desktop/node_modules` and misses the root binary, causing a Node Module Version mismatch at runtime.

The fix is a `hooks.preStart` in `forge.config.js` that runs `electron-rebuild` from the monorepo root before every `electron-forge start`. This runs automatically on every dev start — no manual `npm rebuild` needed.

---

## Date Handling

All date keys (review heatmap, streak computation) use local date components, not `toISOString()`:

```ts
const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

`toISOString()` returns UTC — on DST transition days this diverges from local date and produces duplicate or missing date keys.

Affected files: `ReviewHeatmap.tsx`, `Dashboard.tsx` (`computeStreak`), `service.ts` (`fetchUserReviewHistory`).

---

## Observability / Logging

All IPC handlers in `ipc/database.ts` (and other handler files) are wrapped with `instrumentedHandle` from the `@sekel/observability` package. This provides:

- **Structured logging** for every IPC call: channel name, arguments summary, duration, and outcome (success or error class)
- **Three transports:** console output (dev only), a ring buffer of the last 500 log entries (used by the Admin diagnostics screen), and a file transport writing to `{userData}/sekel.log`
- **Crash reporter:** fatal errors in the main process are written to `{userData}/crash.log` with a full stack trace and the last N ring-buffer entries for context

The Admin screen (`/admin`, visible to admin users only) surfaces the ring buffer contents for in-app diagnostics without requiring log file access.

---

## Related Documentation

- **[Backup System](backup-system.md)** — automatic backups, native .spkg export/import, deletion safety, database integrity checking
- **[Anki Import](anki-import.md)** — .apkg import pipeline, media extraction, Anki template rendering
