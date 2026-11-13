# Supabase Sync
> Every user's study data (decks, notes, cards and their FSRS schedule, reviews, sessions, drafts, media, classifications, exam profiles, plans) mirrored row by row into matching Supabase tables and synced between computers. SQLite stays the working database.

---

**Status:** `In Progress` (built and tested; not deployed)
**Target Version:** the release after SEKEL-158 + SEKEL-157 merge
**Branch:** `SEKEL-157-supabase-sync` (stacked on `SEKEL-158-sync-groundwork`)
**Created:** 2026-11-12
**Last Updated:** 2026-11-13
**Shipped:** —

---

## Overview

Before this, SQLite (`{userData}/sekel.db`) was the only home for study data. Supabase held auth, the `user_profiles` preferences row, feedback, AI usage counters and whole-database backup snapshots. Old `decks` / `notes` / `cards` / … tables from the pre-local-first design were still in Supabase, but nothing read or wrote them, and they no longer matched the local schema.

**Now:**
- **Every user-owned row** also lives in a Supabase table with the same columns and the same id.
- **Local changes** are captured by SQLite triggers and pushed within seconds.
- **Other devices** pull and merge those changes.
- **A new computer or a reinstall** gets the whole library back by signing in.
- **SQLite stays the app's database:** every IPC handler, the plan service and the yield SQL are unchanged, and studying works offline.

## How it works

```
Renderer ──IPC──▶ main/db/service.ts ──▶ sekel.db
                                            │ AFTER INSERT/UPDATE/DELETE triggers (migration 26)
                                            ▼
                                       sync_outbox (one row per changed record)
                                            │
                  main/sync/engine.ts  ─────┤  every 5 s while signed in (when something is due)
                                            ▼
                  rpc sync_push_v1  ──▶ Postgres tables (RLS: own rows only)
                  rpc sync_pull_v1  ◀── server_seq cursor ──▶ sync_inbox ──▶ sekel.db
                  Storage: sekel-media/{user}/{sha1}{ext}
```

**One engine cycle** (signed in, and the server switch is on for the user):
1. **Hello:** check the switch and the server clock. A device clock that's more than a minute off is corrected for.
2. **After a backup restore:** make the cloud match the restored library (see Restores).
3. **First sync on this device:** queue the whole library. Each row's own timestamp is its change time, so anything newer already in the cloud wins.
4. **Push the outbox:**
   - deletes first, then upserts parents-first;
   - media files are uploaded before their rows;
   - a batch the server rejects is split in half, repeatedly, until the bad row is found; that row is parked with its error and everything else goes through.
5. **Pull** changes after the cursor into `sync_inbox`, then apply them in chunks: upserts parents-first, deletes children-first. Pulled rows are written with capture paused, so they don't echo back.

**When it runs:**
- every 5 s while something is due;
- on window focus;
- on sign-in and token refresh;
- from "Sync now";
- at quit: a push bounded to 10 s that returns at once when nothing is pending or the device is offline.

**Failures:**

| Kind | What happens |
|---|---|
| Network | Back off from 30 s up to 15 min |
| Expired session | Wait for the renderer's token refresh |
| Server without the sync API | Retry every 30 min; status "not available yet" |
| Anything unexpected | Report to Sentry (tag `sync`) |

**Conflicts: last writer wins**, on `client_changed_at`:
- **Clock cap:** a device can't claim a time more than 5 minutes ahead of the server.
- **Losing changes:** a change that loses re-stamps the winning server row, so every device, including the loser, pulls the winner again. A pulled row is skipped while a local edit to the same record is still waiting to be pushed; the edit is pushed, and either it wins or the winner comes back.
- **Reviews** never conflict (UUIDs); Undo is a delete.
- **Card schedules** follow the most recent change. If two devices review the same card offline, both reviews are kept and the later change sets the schedule.

**Natural keys:**
- **Exam profiles** sync by `exam_key`.
- **Classifications** sync by `(card, exam_key, system_key)`, as one set per (card, exam), because classifying replaces the whole set.
- The local install-specific blueprint rowids are mapped to and from those keys.

**JSON:** the columns are Postgres `json`, not `jsonb`, and so is the wire format. `jsonb` reorders object keys, and note fields are order-sensitive (first-field fallbacks in previews and the classifier).

## Restores

Restoring a local or cloud backup flags the database (`markRestored`). On the next cycle the engine:
1. notes the user's current server cursor;
2. force-pushes every local row, stamped now;
3. tombstones every server row that wasn't re-pushed (`sync_prune_v1`).

The cloud, and then every other device, ends up matching the restored library. If the push can't finish (offline), nothing is pruned, and the cloud keeps the union until the next attempt. Both restore dialogs now say so.

## Remote switch

`public.app_config` row `sync`: `{"enabled": false, "allow_users": []}`. Sync does nothing for a user until they're in `allow_users` or `enabled` is true. Change capture starts the first time sync is enabled on a device; the initial upload covers everything before that.

## Preferences

- **Already in `user_profiles`:** theme, language, card style, card size, background, avatar, notifications, reminders, timer and daily limits.
- **New `user_profiles.ui_state` (jsonb)** carries small per-user UI state that used to stay on one machine: minimal study view, feature tours seen, dismissed session briefings, plan-rebalance acknowledgements. localStorage remains the fast path and the fallback (`lib/uiState.ts`).
- **The Profile tab** now saves only the fields it edited. It used to send the whole profile, which could overwrite a setting changed on another computer.
- **`user_profiles.updated_at`** is stamped by the server.
- **Exam profiles and plans** sync as tables (above).
- **Stays per device:** window state, the collapsed sidebar, and the theme first-paint cache.

## Key files

| Area | Files |
|---|---|
| Supabase schema | `supabase/migrations/20261113120000_move_legacy_tables.sql`, `…120100_sync_schema.sql`, `…120200_sync_functions.sql` |
| Table spec (single source of truth) | `src/main/sync/tables.ts` |
| Local capture | migration 26 in `src/main/db/migrations.ts` (outbox, inbox, state, 36 triggers) |
| Engine | `src/main/sync/engine.ts`, `codec.ts`, `outbox.ts`, `inbox.ts`, `meta.ts`, `supabaseTransport.ts`, `service.ts` |
| App wiring | `src/main.ts` (start, focus, quit, media download), `src/ipc/sync.ts`, `src/ipc/cloudBackup.ts`, `src/main/backup/restore.ts` |
| UI | `components/Profile/sections/CloudSyncSection.tsx` (Profile → Backup), `router/AppLayout.tsx` (refresh on pulled changes), admin "Last Synced" column |
| Edge functions | `admin` (ignores deleted rows; last sync time), `delete-account` (clears `sekel-media`) |

## Deploying (your part, in this order)

All of it is additive, so deploying the schema ahead of the app release can't break released clients.

1. **Merge** SEKEL-158, then SEKEL-157, into `dev`.
2. **Dev project** (`nrmfdiaaybilseqqvzam`): the Supabase GitHub integration applies the three migrations on merge. If it doesn't, run `npm run db:push` in `apps/desktop`.
3. **Check the legacy data on prod** before the release (counts only):
   ```sql
   select (select count(*) from public.decks) decks, (select count(*) from public.cards) cards,
          (select count(*) from public.reviews) reviews, (select max(updated_at) from public.cards) newest_card;
   ```
   Nothing reads these rows. The first migration keeps them in a `legacy` schema rather than deleting them.
4. **Turn sync on for yourself** on dev, with your auth user id:
   ```sql
   update public.app_config set value = jsonb_set(value, '{allow_users}', '["<your user id>"]') where key = 'sync';
   ```
   Then run the app, check Profile → Backup → Cloud sync, sign in on a second computer (or a second Windows user) and check the library arrives.
5. **Release:** `release.yml` applies the migrations to prod and redeploys `admin` and `delete-account` before the build. Start with `allow_users`; set `enabled` to `true` once you're happy.
6. **Later (Phase 5):**
   - drop the `legacy` schema;
   - decide whether whole-database snapshots are still needed;
   - regenerate `packages/db` types from the live schema.

## Testing

| Test file | Tests | What it covers |
|---|---|---|
| `syncSchema.test.ts` | 27 | Every Supabase migration applied to real Postgres (PGlite) — see below |
| `syncEngine.test.ts` | 10 | End to end: two SQLite "devices" with the real local migrations, the real engine, one PGlite server — see below |
| `syncCapture.test.ts` | 9 | Triggers on every table, nothing before enabling, coalescing, cascaded deletes, natural keys, silence while applying, whole-library queueing |
| `syncCodec.test.ts` | 18 | JSON exactness, booleans, timestamps, media paths, payload grouping, error classification |
| `syncGroundwork.test.ts` (SEKEL-158) | | Atomic reviews, migration-25 backfills |

`syncSchema.test.ts` checks:
- the schema matches the spec column by column;
- the old tables moved and clients can't reach them;
- RLS isolation, with no hard deletes and anonymous callers refused;
- push and pull, including paging and skipping a device's own writes;
- last-writer-wins, the clock cap, tombstones, forced pushes and re-sending the winner;
- natural keys;
- prune;
- the remote switch;
- account deletion;
- media bucket policies.

`syncEngine.test.ts` covers:
- the first upload and download;
- edits and cascading deletes both ways;
- a conflict while a pending edit is waiting;
- classification sets across installs with different blueprint ids;
- media upload and on-demand download;
- a missing file being parked;
- the switch being off;
- a server without the API;
- isolating a bad row;
- a backup restore propagating to another device.

## Decisions

1. **Local-first sync, not cloud-first.** SQLite stays authoritative on each device; Postgres is the hub.
2. **Legacy tables moved to a `legacy` schema**, not altered in place.
3. **Everything syncs, including imported Anki review history.**
4. **Media:** every file up to 50 MB is uploaded, and other devices download it on first use.
5. **Snapshot backups keep running** alongside sync as a safety net.
6. **Plain last-writer-wins for every table, deletes included.** "Delete always wins" would block restoring deleted items and backups. The losing-change re-send makes devices converge.
7. **The 5-drafts server trigger isn't carried over:** with soft deletes, tombstoned drafts would count against it forever. The app enforces `DRAFT_LIMIT`.
8. **The local plan-rate mirror (`user_profiles.daily_new_limit` / `plan_override_expires_at` in SQLite) isn't synced.** The rate is derived from the synced `plans`, and the override is a same-day, one-session setting.

## Known Limitations / Future Work

- **No push notifications between devices.** Changes arrive on the next pull: on focus, on sign-in, every 2 minutes, or "Sync now". Supabase Realtime could trigger pulls later.
- **Clock-based conflicts:** two devices editing the same record offline settle on the later change; a device clock more than a minute off is corrected using the server's clock.
- **Rows that keep failing are parked** and shown as "couldn't be uploaded" in Profile → Backup, with the error on hover. There's no retry button yet; editing the record queues it again.
- **Some handlers still take only an id** (`updateDeck`, `deleteNote`, …). It's harmless for sync because ids are random UUIDs; adding a user filter is a follow-up.
- **`packages/db` types for the synced tables** aren't generated yet (main/sync has its own).

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-12 | Plan written from local + Supabase schema inventories |
| 2026-11-12 | Task completed |
