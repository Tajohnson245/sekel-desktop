# Cloud Backup System

> Automatic, Supabase-backed SQLite snapshots with generational retention and a
> restore-from-cloud UI. Coexists with the existing manual/local backup system.

---

**Status:** `In progress`
**Branch:** `SEKEL-136-cloud-backup-system`
**Created:** 2026-07-09
**Applies to:** dev Supabase project (`nrmfdiaaybilseqqvzam`); prod deferred to release.

---

## Overview

Every user's local `sekel.db` is automatically snapshotted to Supabase Storage as
they study, so their FSRS/review state survives device loss. It does **not**
replace the local backup layer (manual `.backup()` snapshots, `.spkg` export,
deletion log) — both run side by side: local = instant offline safety net,
cloud = off-device durability + cross-device restore.

This re-introduces *automatic* backups (removed in SEKEL-095 for the local layer)
deliberately, in cloud form, per the product decision to keep both.

## Trigger logic (main process)

Snapshot fires on whichever comes first, capped at **1/hour**:
- **25 reviews** — renderer pings `cloudBackup.requestCheck()` after each review
  (`StudySession.handleRate`); main counts and fires at the threshold.
- **App close** — `before-quit` takes a final snapshot if there are unsynced
  reviews (bounded by a 15s timeout so quit never hangs).
- **Idle/blur ≥ 5 min** — a 1-minute poll checks `powerMonitor.getSystemIdleTime()`
  and window blur duration.

"Unsynced changes" = reviews recorded since the last successful snapshot.

## Architecture

```
Renderer                         Main process                      Supabase
────────                         ────────────                      ────────
authStore ──setSession(JWT)────▶ cloudBackup.setSession            backup_snapshots (table, RLS)
StudySession ──requestCheck()──▶ cloudState (electron-store)       sekel-backups (private bucket)
BackupTab   ──list/restore()───▶ cloudBackup.triggerBackupSnapshot ─upload {uid}/{id}.sqlite──▶ Storage
                                 getDb().backup() → temp .sqlite   ─insert metadata row───────▶ table
                                 cloudRestore → restoreFromBackup   prune-backups (edge fn, daily)
                                 cloudAlert → backup-alert (edge)   backup-alert (edge fn, JWT)
```

- The main process performs the write as the **signed-in user** (RLS-scoped).
  The renderer pushes its Supabase session over IPC (`cloudBackup:setSession`) on
  sign-in / token refresh / sign-out; main holds it in memory (never on disk) and
  calls `setSession` on a supabase-js client, which refreshes expired tokens.
- Snapshots are a **WAL-safe** `better-sqlite3 .backup()` copy (never a raw file
  copy of a live WAL db), uploaded as a full `.sqlite` file.

### Key files

| File | Role |
|------|------|
| `src/main/backup/cloudBackup.ts` | Triggers, hourly cap, snapshot mechanism, failure handling |
| `src/main/backup/cloudState.ts` | electron-store counters + in-memory session + blur tracking |
| `src/main/backup/cloudClient.ts` | Builds the RLS-scoped supabase-js client from the pushed session |
| `src/main/backup/cloudRestore.ts` | Downloads a snapshot and restores via the local restore flow |
| `src/main/backup/cloudAlert.ts` | Invokes the `backup-alert` edge function after 3 failures |
| `src/ipc/cloudBackup.ts` | IPC handlers (`setSession`, `requestCheck`, `list`, `restore`, `restart`) |
| `src/components/Profile/sections/BackupTab.tsx` | "Cloud Backups" section: list, back up now, restore + restart |
| `packages/db/src/queries/backup_snapshots.ts` | insert/list/fetch/delete helpers |
| `supabase/migrations/20260709120000_create_backup_snapshots.sql` | table + index + RLS + bucket + bucket RLS |
| `supabase/functions/prune-backups/` | Generational rotation (service role, cron-secret gated) |
| `supabase/functions/backup-alert/` | Discord alert on repeated failures (JWT verified) |

## Retention / rotation

Generational, per user: **5 daily / 4 weekly / 3 monthly** (~12 max). The
`prune-backups` edge function keeps the newest snapshot per bucket for the N most
recent days/weeks/months, deletes the rest (Storage + row), and re-labels kept
rows to the coarsest tier (daily→weekly→monthly promotion). Runs daily at
**04:00 UTC** via `pg_cron` → `pg_net` → the function.

## Failure handling

- Every failure → Sentry with a `backup` tag + reason (`@sentry/electron/main`).
- After **3 consecutive** failures → one Discord alert via `backup-alert`
  (reuses `DISCORD_FEEDBACK_BOT_WEBHOOK_URL`; set `DISCORD_BACKUP_ALERT_WEBHOOK_URL`
  to route to a dedicated channel). Reset on the next success.

## Deployment status & prod-at-release checklist

Applied + verified on **dev** (`nrmfdiaaybilseqqvzam`):
- Migration `20260709120000_create_backup_snapshots` (table, index, RLS, bucket).
- Edge functions `prune-backups` (`--no-verify-jwt`) and `backup-alert` (JWT verified).
- `CRON_SECRET` function secret set; `pg_cron`/`pg_net` enabled; Vault secret
  `backup_cron_secret`; daily job `prune-backups-daily`. End-to-end verified.

> **Note:** the `pg_cron` schedule + Vault secret were applied directly to dev
> (not committed as a migration) so the cron secret never lands in git. The
> committed migration contains only schema/bucket/RLS.

**At release (prod `uawkoueqectmkiyjcrtb`), repeat, targeting prod:**
1. Apply `20260709120000_create_backup_snapshots` (schema + bucket).
2. `supabase secrets set CRON_SECRET=<new-random>` and deploy both functions
   (`prune-backups --no-verify-jwt`, `backup-alert` with JWT verify).
3. Enable `pg_cron`, create the Vault secret `backup_cron_secret`, schedule
   `prune-backups-daily` (`0 4 * * *`) pointing at the prod function URL.
4. Pair the schema apply with the client release that ships this feature (the
   table/bucket are additive, so they don't break older clients).

## Known limitations / future work

- "Unsynced changes" tracks reviews only, not card/deck edits.
- Pruning loads all snapshot rows into memory (fine at ~12/user; revisit at scale).
- No real-time multi-device sync/conflict resolution (out of scope, per spec).
| 2026-07-09 | apps/desktop/src/components/Profile/sections/BackupTab.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/locales/de/translation.json,apps/desktop/src/locales/en/translation.json,apps/desktop/src/locales/es/translation.json,apps/desktop/src/locales/fr/translation.json,apps/desktop/src/locales/zh/translation.json,apps/desktop/src/main.ts |
| 2026-07-09 | apps/desktop/src/components/Profile/sections/BackupTab.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/locales/de/translation.json,apps/desktop/src/locales/en/translation.json,apps/desktop/src/locales/es/translation.json,apps/desktop/src/locales/fr/translation.json,apps/desktop/src/locales/zh/translation.json,apps/desktop/src/main.ts |
| 2026-07-09 | apps/desktop/src/components/Profile/sections/BackupTab.tsx,apps/desktop/src/components/Study/StudySession.tsx,apps/desktop/src/ipc/cloudBackup.ts,apps/desktop/src/locales/de/translation.json,apps/desktop/src/locales/en/translation.json,apps/desktop/src/locales/es/translation.json,apps/desktop/src/locales/fr/translation.json,apps/desktop/src/locales/zh/translation.json |
