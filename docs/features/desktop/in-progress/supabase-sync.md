# Supabase Sync
> Plan for mirroring every user's local SQLite data (decks, notes, cards, scheduling, reviews, classifications, plans, preferences, media) into matching Supabase tables, then syncing it across devices.

---

**Status:** `In Progress` (plan, not started)
**Target Version:** TBD (multi-release)
**Branch:** `SEKEL-157-supabase-sync` (plan); later phases on their own SEKEL branches
**Created:** 2026-11-12
**Last Updated:** 2026-11-12
**Shipped:** —

---

## Overview

Today SQLite (`{userData}/sekel.db`) is the only home for study data. Supabase only holds:
- auth;
- the `user_profiles` preferences row;
- feedback;
- AI usage counters;
- whole-database backup snapshots (`backup_snapshots` + the `sekel-backups` bucket).

Supabase already has `decks`, `notes`, `cards`, `reviews` and similar tables from the pre-local-first design. Nothing in the app reads or writes them any more; they have drifted from the local schema and hold stale data.

**Goal:** every row a user owns locally also exists in a Supabase table with the same shape and the same id, and stays up to date as they study. That gives:
- per-row cloud durability;
- a real admin dashboard;
- an account that works on a second computer or after a reinstall.

**Recommended shape: local-first sync, not cloud-first.**
- SQLite stays the working database. Every IPC handler, the plan service and the yield SQL keep running offline and fast.
- Supabase becomes the synced copy and, later, the hub that devices merge through.
- Going cloud-first would mean rewriting the data layer and losing offline study, for no user-visible gain.

## Starting point (verified 2026-11-12)

What already helps:
- **IDs:** every user-owned entity uses a client-generated UUID (`randomUUID()` in main), so rows can keep the same id in Postgres.
- **Auth plumbing:** the main process already holds the signed-in session, pushed from the renderer (`main/backup/cloudState.ts`). It builds an RLS-scoped client from it (`main/backup/cloudClient.ts`), and the renderer owns token refresh.
- **Change capture:** SQLite triggers fire for rows removed by `ON DELETE CASCADE` and for `ON DELETE SET NULL` updates. This was tested, so trigger-based change capture sees every delete path.
- **Preferences:** most of them already live in Supabase `user_profiles`.

What has to change first:
- **No change tracking:** no triggers, `usn` columns, dirty flags or tombstones. Every delete is a hard delete.
  - `updated_at` is not bumped on several write paths (deck parent unlink, Anki merge import, draft edits).
  - `plans.updated_at` has a behavioral meaning (the rebalance window), so it can't double as a sync clock.
- **A review is two IPC calls, not one transaction.** The card update runs at `StudyPlayer.tsx:240`, then the review insert at `:242`. A crash in between leaves a rescheduled card with no review row.
- **One database for every account on the machine.** Most tables carry `user_id`, but:
  - Some handlers take only an id: `updateDeck`, `deleteNote`, `updateCardAfterReview`, `fetchDueCards`, …
  - Time travel rewrites every user's cards.
  - `hasClassifications` ignores the user.
  - `card_classifications` and `time_travel_log` have no `user_id` column.
- **Install-specific integer ids:** `card_classifications` and `user_exam_profiles` point at local blueprint rowids, which differ between installs. Synced data must use the stable `exam_key` / `system_key` / `topic_key`.
- **Machine-specific media paths:** `media.file_path` is an absolute local path, and editor uploads embed `sekel-media://<userId>/<file>` in note HTML. That's fine across devices for the same user, but the files themselves must move to Storage.
- **`.spkg` import:** its guid check is global rather than per user, and it remaps every UUID, so re-importing duplicates.

Legacy Supabase tables:
- **Who uses them:** nothing in the app. The `admin` edge function and its `admin_*` RPCs still count rows in them, so the admin dashboard shows legacy numbers only.
- **Dev contents:** small test leftovers last written in March–May 2026, plus orphaned `note_types` rows. The user FKs were re-added as `NOT VALID`.
- **Prod contents:** not checked yet (see Phase 0).

## Target architecture

```
Renderer ──IPC──▶ main/db/service.ts ──▶ sekel.db (SQLite, source of truth on the device)
                                             │  AFTER INSERT/UPDATE/DELETE triggers
                                             ▼
                                        sync_outbox (one row per changed record, coalesced)
                                             │
                         main/sync/engine.ts │ batches in dependency order
                                             ▼
                     rpc sync_push_v1(device, changes)  ──▶  Postgres tables (RLS: own rows)
                     rpc sync_pull_v1(cursor)           ◀──  server_seq cursor (Phase 3)
                     Storage: sekel-media/{uid}/{sha1}.{ext}
```

### Postgres table conventions (every synced table)

| Column | Purpose |
|---|---|
| Same columns as SQLite | Postgres types: `uuid`, `timestamptz`, `jsonb` for the JSON-in-TEXT columns, `boolean` for 0/1, `text` + `CHECK` instead of enums (no enum migrations later) |
| `user_id uuid not null references auth.users on delete cascade` | Valid from day one; account deletion removes everything |
| `client_changed_at timestamptz not null` | Conflict clock, taken from the outbox, **not** the app's `updated_at` |
| `deleted_at timestamptz` | Tombstone; deletes are soft on the server so other devices learn about them |
| `server_seq bigint not null` | Set from one global sequence by a trigger on every write; the pull cursor |
| `origin_device uuid` | Which device wrote the row; lets pull skip echoes |

Other rules for every synced table:
- **RLS:** one policy per operation, `TO authenticated`, `(select auth.uid()) = user_id`. Revoke the default `anon` grants.
- **Index:** `(user_id, server_seq)`.
- **Foreign keys** between synced tables are `DEFERRABLE INITIALLY DEFERRED`, so a push batch applies in one transaction.

### Table map

| SQLite | Supabase | Notes |
|---|---|---|
| `note_types` | `note_types` | `fields`, `card_templates`, `anki_meta` → jsonb |
| `decks` | `decks` | `parent_id` self-FK; `algorithm` CHECK (`fsrs`, `sm2`) |
| `notes` | `notes` | `fields`, `tags`, `anki_meta` → jsonb; `format` CHECK; unique `(user_id, anki_guid)` |
| `cards` | `cards` | All FSRS columns + `learning_steps`; `ease_factor` → `real` (imports write 2.5 today) |
| `reviews` | `reviews` | Append-only; Undo becomes a tombstone |
| `deck_sessions` | `deck_sessions` | Adds `kind`, `scope`, `system_keys`; status CHECK includes `abandoned` |
| `card_drafts` | `card_drafts` | Keep the 5-draft server trigger; it matches `DRAFT_LIMIT` |
| `media` | `media` | `storage_path` replaces `file_path`; files go to a private `sekel-media` bucket |
| `card_classifications` | `card_classifications` | Adds `user_id`; `exam_key`, `system_key`, `topic_key` text instead of local integer ids |
| `user_exam_profiles` | `user_exam_profiles` | `exam_key` instead of `exam_id`; unique `(user_id, exam_key)` |
| `plans` | `plans` | `snapshot`, `deck_filter` → jsonb |
| `time_travel_log` | `time_travel_log` | Needs `user_id` and a UUID locally first |
| `user_profiles` (local) | Supabase `user_profiles` | Local copy only mirrors the plan rate. Move `plan_override_expires_at` to Supabase; the rate is derivable from `plans` |
| `blueprint_*` | not synced | Static app data; synced rows reference it by key, with no FK |
| `sync_metadata`, `schema_version` | local only | `sync_metadata` (unused today) holds sync cursors |

### Change capture (local)

- **New migration:** a `sync_outbox` table with `table_name`, `row_id`, `user_id`, `op`, `changed_at` and `attempts`, unique on `(table_name, row_id)`, so repeated edits collapse into one entry.
- **Triggers:** `AFTER INSERT/UPDATE/DELETE` on every synced table upsert into the outbox.
  - They skip while a pull is being applied: a one-row `sync_state.applying` flag checked in the trigger's `WHEN` clause.
  - Triggers catch every write path (imports, time travel, cascades, migrations) without touching `service.ts` callers.
- **Conflict clock:** `changed_at` from the outbox becomes `client_changed_at` on the server. App `updated_at` semantics stay untouched.

### Push (main process, `src/main/sync/`)

- **Batches:**
  - Read up to ~500 outbox rows **for the signed-in user only**, in dependency order (note_types → decks → notes → cards → deck_sessions → reviews → …).
  - Serialize the current row, or a tombstone if it's gone.
  - Send one `sync_push_v1` call per batch; on success, delete those outbox rows.
- **`sync_push_v1`:**
  - plpgsql, `SECURITY INVOKER` so RLS applies, with explicit per-table `INSERT … ON CONFLICT (id) DO UPDATE`. No dynamic SQL.
  - Last-writer-wins guard: `WHERE excluded.client_changed_at >= t.client_changed_at`.
  - Rejects any row whose `user_id` isn't `auth.uid()`.
- **When it runs:**
  - 5 s after a change (debounced) and on sign-in;
  - every 60 s while the outbox is non-empty;
  - at quit, bounded to 10 s like the snapshot;
  - with exponential backoff on failure. Sentry tag `sync`.
- **Initial upload (backfill):**
  - The first time a user syncs on a device, enqueue every row they own in chunks.
  - The outbox persists, so it resumes after quit.
  - Show progress: "Uploading your library: 12,000 of 48,000".
- **Media:**
  - A separate queue uploads files to `sekel-media/{uid}/{sha1}{ext}` (content-addressed, so uploads are idempotent), 3 at a time.
  - The `media` row is pushed only after its file has uploaded.

### Pull and merge (Phase 3)

- **`sync_pull_v1(cursor, limit)`** returns changed rows across tables ordered by `server_seq`, skipping the caller's own device.
- **Applying a page:** one SQLite transaction with `sync_state.applying = 1`, in dependency order. Tombstones become local deletes.
- **Conflict rules:**

| Data | Rule |
|---|---|
| Decks, notes, note types, drafts, plans, exam profiles, sessions | Last writer wins on `client_changed_at`; device id breaks ties |
| Deletes | A tombstone wins over an edit, so no zombie rows |
| Reviews | Union. UUIDs never collide; an Undo tombstone removes the review |
| Card scheduling | The row with the newer `last_review` wins, not the newer edit. If two devices reviewed the same card offline, both reviews stay in the log and the later one's schedule applies. Replaying FSRS over the merged log is possible later if it ever matters |
| Classifications | Newer `classified_at` wins |

- **New device or reinstall:** sign in, pull everything, and download media on demand. The `sekel-media://` handler fetches from Storage when the file is missing. This covers most cases that need "Restore from cloud backup" today.
- **After a local or cloud snapshot restore:** reset the cursors and run a full reconcile (push all local rows, pull all server rows).

### Preferences

- **Already in Supabase `user_profiles`:** theme, language, card style, flip animation, card size, background, avatar, notifications, reminder times, timer, daily limits, intelligence, onboarding.
- **Move into Supabase:**
  - `plan_override_expires_at`, as a column on `user_profiles`.
  - Exam profiles, via the synced `user_exam_profiles` table.
  - Per-user UI state that should follow the user, as a `ui_state jsonb` column: minimal study view, feature-tour flags, briefing dismissals, rebalance acknowledgements.
- **Stay on the device:** window state, sidebar collapsed, and the `sekel-theme` first-paint cache.
- **Fix for multi-device:** `ProfileTab` upserts the whole profile object, so a second device can overwrite fresh edits. Switch every profile write to a patch of the changed fields, and add an `updated_at` trigger.

## Phases

Each phase is one or more SEKEL branches and PRs into `dev`. Every server change is additive, so it can be deployed ahead of the client (see the drift rules in CLAUDE.md).

**Phase 0: groundwork (local only, no user-visible change)**
1. **Atomic review:** a single `db:recordReview` IPC that updates the card and inserts the review in one transaction. Undo gets the same treatment.
2. **Account safety:**
   - add a user filter to every id-only handler;
   - make time travel and `hasClassifications` per user;
   - add `user_id` to `card_classifications`, backfilled from `cards`;
   - add `user_id` and a UUID to `time_travel_log`;
   - add `updated_at` to `card_drafts` and `deck_sessions`.
3. **Stable keys:** helpers that map a classification's or exam profile's blueprint rowids to keys, and back.
4. **`.spkg` import:** make the guid check per user.
5. **Prod check (needs your approval to run):**
   - row counts in the legacy tables, plus the newest write;
   - the size distribution of the latest backup snapshot per user.

   These numbers decide what happens to the legacy rows and size the database.

**Phase 1: Supabase schema**
1. Rename the legacy tables to `legacy_*`. Drop them one or two releases later.
2. Create the synced tables, RLS policies, the `server_seq` sequence and triggers, `sync_push_v1` / `sync_pull_v1`, and the `sekel-media` bucket with its policies.
3. Repoint the `admin_*` RPCs to the new tables, so the admin dashboard shows real data. Update `delete-account` to clear `sekel-media`.
4. Regenerate `packages/db` types from the schema instead of hand-writing them.
5. Deploy to dev; prod rides with the release that ships Phase 2.

**Phase 2: push (one-way mirror)**
1. Outbox migration and triggers, plus a test that every write path enqueues.
2. Sync engine: serializers, batching, scheduling, backoff, Sentry.
3. Initial upload with progress, and media upload.
4. Status in Profile → Backup ("Synced 2 min ago" / "Uploading 1,200 changes").
5. Behind a flag; internal accounts first, then everyone.

**Outcome:** every user's data is in Supabase. Cloud snapshots keep running as the safety net.

**Phase 3: pull and merge (multi-device)**
1. Pull and apply with the conflict rules above.
2. New-device bootstrap and on-demand media download.
3. Restore integration (full reconcile).
4. A two-device test suite.

**Phase 4: preferences**
1. Add `ui_state` and `plan_override_expires_at` to `user_profiles`.
2. Make profile writes patch-only.
3. Retire the local `user_profiles` mirror.

**Phase 5: cleanup**
1. Drop the `legacy_*` tables.
2. Decide whether snapshot backups stay.
3. Add a sync-health view to the admin dashboard: last sync and outbox depth per user.

## Testing

- **Serializers:** round-trip every table, SQLite row → Postgres row → SQLite row.
- **Triggers:** table-driven tests on in-memory SQLite that every service write, import path, cascade and time-travel run lands in the outbox, and that applying a pull does not.
- **Push and pull integration:** against the dev project with a throwaway user, as the live AI eval does today. A CI job on a local Supabase (Docker) can come later.
- **Conflict matrix:** two SQLite databases and one Postgres, covering edit/edit, edit/delete, offline review/review and Undo across devices.
- **Scale:** backfill a 50,000-card, 500,000-review library and measure time and database size.

## Decisions to confirm

1. **End state:** full multi-device sync (Phases 2 and 3), or a one-way mirror only (Phase 2)? *Recommended: full sync, phased. Phase 2 is useful on its own.*
2. **Legacy tables:** rename to `legacy_*` and drop later, or alter them in place? *Recommended: rename. Their shape and data predate local-first, and the user FKs aren't validated.*
3. **Imported Anki review history:** sync all of it, even though it can dominate size? *Recommended: yes. Stats and the heatmap need it on every device. Confirm with the Phase 0 size check.*
4. **Media:** upload all files, including Anki audio, with a per-file cap? *Recommended: yes, cap 50 MB per file, download on demand.*
5. **Snapshot backups after sync ships:** *Recommended: keep them until Phase 3 has run cleanly for a few releases. They protect against sync bugs.*
6. **Prod read:** approve the Phase 0 aggregate query on prod (counts and sizes only, no row contents).

## Known Limitations / Future Work

- No real-time push between devices. Changes arrive on the next pull: at start, on focus, every few minutes. Supabase Realtime could trigger pulls later.
- Card scheduling conflicts resolve by the newest review rather than by replaying FSRS.
- A web or mobile client could read these tables directly later. The schema is designed to support that, but it's not part of this plan.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-12 | Plan written from local + Supabase schema inventories |
| 2026-11-12 | Task completed |
