# SQLite Local-First Architecture — Implementation Notes

## Overview

The Sekel desktop app (Electron) uses SQLite as its primary data store. All reads and writes go to a local SQLite database (`sekel.db`) stored in the OS user data folder. Supabase (cloud PostgreSQL) acts as an asynchronous cloud backup only — it is never queried at runtime for normal app operations.

On first login, all existing user data is pulled from Supabase into SQLite. After that, every local write is pushed to Supabase in the background (fire-and-forget).

---

## Architecture

```
React Component
  ↓
TanStack Query hook           (unchanged)
  ↓
lib/queries.ts                (IPC shim — signatures preserved)
  ↓
window.electronAPI.db.*       (contextBridge, renderer → main)
  ↓
ipcMain.handle('db:*')        (apps/desktop/src/ipc/database.ts)
  ↓
main/db/service.ts            (better-sqlite3, synchronous)
  ↓
sekel.db  (app.getPath('userData')/sekel.db)   ← source of truth

Background write path:
  service.ts write → syncPush.pushRecord(table, record) → supabase.upsert()
```

---

## Key Files

| File | Role |
|------|------|
| `apps/desktop/src/main/db/index.ts` | Opens the SQLite file, sets WAL + FK pragmas, runs migrations |
| `apps/desktop/src/main/db/migrations.ts` | Ordered SQL migration strings; `schema_version` table tracks applied migrations |
| `apps/desktop/src/main/db/service.ts` | All SQLite query/write functions (better-sqlite3 synchronous API) |
| `apps/desktop/src/main/db/sync.ts` | Initial full pull from Supabase on first run |
| `apps/desktop/src/main/db/syncPush.ts` | Fire-and-forget push to Supabase after each local write |
| `apps/desktop/src/ipc/database.ts` | IPC handler registration (`db:*` channels) |
| `apps/desktop/src/preload.ts` | contextBridge — exposes `window.electronAPI.db.*` to renderer |
| `apps/desktop/src/types/electron.d.ts` | TypeScript types for the entire `db` API surface |
| `apps/desktop/src/lib/queries.ts` | Renderer-side shim — calls IPC instead of Supabase directly |
| `apps/desktop/src/lib/draftQueries.ts` | Same as queries.ts but for card drafts |
| `apps/desktop/src/stores/authStore.ts` | After login, calls `db:setSessionToken` to init the push client |
| `apps/desktop/src/stores/profileStore.ts` | Replaced Supabase calls with `window.electronAPI.db.fetchProfile/upsertProfile` |
| `apps/desktop/src/components/Auth/ProtectedRoute.tsx` | Triggers initial sync on first login; shows loading screen during sync |

---

## SQLite Schema (Migration 001)

8 data tables + 1 metadata table:

- `note_types` — id, user_id, name, fields (JSON TEXT), card_templates (JSON TEXT), timestamps
- `decks` — id, user_id, name, description, fsrs_enabled (0/1), timestamps
- `notes` — id, user_id, deck_id (FK→decks CASCADE), note_type_id (FK→note_types), fields (JSON TEXT), tags (JSON TEXT), timestamps
- `cards` — id, user_id, note_id (FK→notes CASCADE), template_index, full FSRS state (state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review), timestamps
- `reviews` — id, user_id, card_id (FK→cards CASCADE), rating, review_time, duration_ms, before/after FSRS snapshots, session_id, deck_id, review_index, created_at
- `deck_sessions` — id, user_id, deck_id (FK→decks CASCADE), status, started_at, completed_at, created_at
- `card_drafts` — id, user_id, front, back, source, created_at
- `user_profiles` — id, full_name, username, bio, avatar_url, location, theme_preference, flip_animation, language, timestamps
- `sync_metadata` — key TEXT PK, value TEXT (stores `user_id` and `last_sync_at`)

JSON columns (`fields`, `tags`, `card_templates`) are stored as `TEXT` and serialized/deserialized only at the `service.ts` boundary.

Indexes on all FK columns, `user_id` columns, `cards.due`, and `reviews.review_time`.

---

## Initial Sync Flow

Triggered in `ProtectedRoute.tsx` after login:

1. Call `window.electronAPI.db.isFirstRun(user.id)`
   - Returns `true` if `sync_metadata` has no `last_sync_at`, or if a different `user_id` is stored
2. If first run: show "Syncing your data..." loading screen, call `pullFromSupabase`
3. `pullFromSupabase` (runs in main process):
   - Creates an **authenticated** Supabase client using `Authorization: Bearer <access_token>` header (required to bypass RLS)
   - Fetches all 8 tables in parallel via `Promise.all`
   - Writes everything atomically to SQLite via `bulkUpsertAll` wrapped in a `db.transaction()`
   - Sets `sync_metadata.user_id` and `sync_metadata.last_sync_at`
4. Loading screen dismissed, app renders normally

---

## Background Sync Push

After every local SQLite write in `service.ts`, `syncPush.pushRecord(table, record)` is called as a fire-and-forget side effect:

- Uses an authenticated Supabase client initialized at login via `db:setSessionToken`
- Calls `supabase.from(table).upsert(record, { onConflict: 'id' })`
- Errors are logged but do not affect the local write
- Conflict resolution: last-write-wins via `updated_at`. SQLite is always authoritative.

For deletes: `syncPush.deleteRecord(table, id)` calls `supabase.from(table).delete().eq('id', id)`.

---

## Initial Sync Render Gating

`ProtectedRoute` must block children from rendering until `syncDone` is `true`. If children render before the sync check completes, TanStack Query fires immediately against an empty SQLite DB, caches empty results, and does not refetch after sync finishes.

Correct render guard:
```tsx
if (!syncDone || isSyncing) {
    return <loading screen>;
}
return <>{children}</>;
```

The loading screen shows "Loading..." while `isFirstRun` is being checked (fast IPC call), then "Syncing your data..." while `pullFromSupabase` runs (network-bound). Children only mount after the DB is fully populated.

---

## Env Var Handling

`VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_ANON_KEY` are **renderer-only** — Vite inlines them into the renderer bundle via `import.meta.env`. They are `undefined` in the Electron main process via `process.env`.

All code that needs these values reads them via `import.meta.env` in the renderer (authStore, ProtectedRoute). They are passed to the main process as IPC arguments, not read from environment there.

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

This prevents Vite from pre-bundling the workspace package (which would cache old source) while still allowing Vite to handle transitive CJS dependencies (recharts → lodash). Using `optimizeDeps.exclude` alone breaks CJS transitive deps.

`apps/desktop/vite.main.config.ts` externalizes `better-sqlite3` so Vite does not attempt to bundle the native `.node` binary.

`apps/desktop/forge.config.js` has `rebuildConfig: { force: true }` so `better-sqlite3` is rebuilt against the correct Electron Node ABI during packaging.

---

## Supabase Table Requirements

The `user_profiles` table requires these columns (not present by default in older schema versions):

```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'system';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS flip_animation BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
```

After adding columns, reload the PostgREST schema cache: Supabase Dashboard → Settings → API → "Reload schema cache", or run `NOTIFY pgrst, 'reload schema';`.

---

## Date Handling Note

All date keys (e.g., for review heatmap, streak computation) use local date components instead of `toISOString()`:

```ts
const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

`toISOString()` returns UTC — on DST transition days this diverges from local date and produces duplicate or missing date keys.

Affected files: `ReviewHeatmap.tsx` (packages/components and apps/desktop), `Dashboard.tsx` (`computeStreak`), `service.ts` (`fetchUserReviewHistory`).
