# SEKEL Cloud Backup System — Spec

## Context
SEKEL is currently free (all features, including cloud backup, available to all users during this phase). This spec assumes Supabase as the backup store. Pricing/tier gating can be layered in later without changing the core mechanism.

## Goals
- Never block the review loop (SQLite stays source of truth; no per-card network writes)
- Backups reflect meaningful progress, not arbitrary clock ticks
- Bounded storage per user via generational rotation (important once paid tiers return and cost matters again)
- Fully automatic — no user decisions required except optional manual restore

---

## 1. Trigger Logic (when to snapshot)

Snapshot fires on **whichever comes first**:
- Every **25 reviews** completed in a session
- **App close** (`before-quit` in main process) if any unsynced changes exist
- **App blur / idle 5 min** if unsynced changes exist
- Hard cap: **no more than 1 snapshot per hour** even if all above trigger repeatedly (prevents thrashing on long open sessions)

Track `lastBackupAt` and `reviewsSinceLastBackup` in local SQLite (or a small state file) to evaluate these conditions without extra IPC chatter.

## 2. Snapshot Contents

Each snapshot = a serialized diff or full export of:
- Card review history / FSRS state (due dates, stability, difficulty, review log)
- Deck/card metadata (not large binary assets — those stay local or in R2 separately if ever needed)
- Plan Mode state (daily limits, cohort projections)

Format: JSON or a compressed SQLite file copy — whichever is simpler for restore. Recommend starting with a full SQLite file copy (simplest to restore, avoids diff/merge bugs) and only moving to diffs if snapshot size becomes a real issue.

## 3. Retention / Rotation Policy

Generational scheme, pruned automatically after each new snapshot:

| Tier | Keep |
|------|------|
| Daily | last 5 |
| Weekly | last 4 (roll one daily into weekly each week) |
| Monthly | last 3 |

Max ~12 snapshots per user at steady state. Pruning job runs as part of the backup write (no separate cron needed initially — a Supabase Edge Function on a daily schedule can handle promotion of daily→weekly→monthly and deletion of expired ones).

## 4. Schema (Supabase)

```sql
create table backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  generation text not null check (generation in ('daily', 'weekly', 'monthly')),
  size_bytes bigint not null,
  storage_path text not null, -- path in Supabase Storage bucket
  review_count_at_snapshot integer,
  app_version text
);

create index idx_backup_snapshots_user_created
  on backup_snapshots (user_id, created_at desc);
```

Storage: use a Supabase Storage bucket (`sekel-backups`) with path convention `{user_id}/{snapshot_id}.sqlite` (or `.json`). Keep DB row as metadata pointer; actual bytes live in Storage, not a DB column.

## 5. IPC Contract (Electron)

- Renderer calls `window.sekel.requestBackupCheck()` after each review batch (cheap, just increments counter + checks trigger conditions)
- Main process owns actual Supabase write: `triggerBackupSnapshot(reason: 'review-threshold' | 'app-close' | 'idle')`
- Main process handles auth token refresh, upload, DB row insert, and pruning call
- Failures reported through existing Sentry setup with a `backup` tag; Discord alert only on repeated failures (e.g., 3 consecutive), not every transient network blip

## 6. Restore UX

Single settings screen: "Restore from backup" — lists last N snapshots (date, size, review count at time of snapshot). User picks one, confirms (destructive action warning), app restores and restarts. No retention/rotation decisions ever surfaced to the user.

## 7. Verification Expectations
Claude Code should verify each stage against the actual Supabase project (via `supabase` CLI — migration apply, schema diff/check, storage bucket confirmation) rather than surfacing raw SQL/config for manual review. Report back what was verified and the outcome, not the intermediate artifacts.

## 8. Explicitly Out of Scope (for now)
- Real-time multi-device sync/conflict resolution (separate feature, harder problem — last-write-wins is not safe for FSRS state)
- Per-card cloud writes
- User-configurable backup frequency
