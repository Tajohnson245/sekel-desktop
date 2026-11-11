# Supabase Security Hardening
> Closes open database rules, enables RLS on unprotected tables, makes account deletion remove user data, and fixes backup pruning — all applied to prod automatically by the next release.

---

**Status:** `In Progress`
**Target Version:** TBD
**Branch:** `SEKEL-146-supabase-security-hardening`
**Created:** 2026-11-10
**Last Updated:** 2026-11-10
**Shipped:** —

---

## Overview

Server-side fixes from the November 2026 audit. The migrations in this branch are applied to the **prod** project by `release.yml`'s `deploy-server` job at the next release, before users update, so they were written to keep every shipped client (v1.0.0–v2.0.0) working. Run the pre-release checks below against prod **before** cutting the release that contains this branch.

What changes:
- Drops the `"Dev: Anon can do all on …"` policies (anyone with the public anon key could read/write decks, notes, cards, reviews).
- Enables RLS on `media`, `card_classifications` and the five `blueprint_*` tables.
- Re-adds `user_id → auth.users ON DELETE CASCADE` FKs (`NOT VALID`) and a `delete-account` edge function that removes the user's Storage objects before deleting the auth user.
- `prune-backups`: paginates, only deletes paths inside the row owner's folder, keeps rows when Storage removal fails.
- Feedback: default `type` + summary trigger so v1.0.0–v1.0.7 clients can submit again; column-level INSERT grants so users can't set `ticket_number`.
- Storage: owner-scoped SELECT instead of bucket-wide listing.
- Fixed `search_path` on SECURITY DEFINER functions; constant-time secret compares; screenshot links restricted to the project's own bucket.
- CI: Supabase CLI pinned (2.122.1), `tsx` pinned, deploy steps for `prune-backups`, `backup-alert`, `delete-account`.

## Pre-release checks (run against prod in the SQL editor)

```sql
-- 1. Objects the migrations reference must exist (any NULL = a migration will fail)
select to_regclass('public.media'), to_regclass('public.card_classifications'), to_regclass('public.blueprint_exams'),
       to_regclass('public.blueprint_systems'), to_regclass('public.blueprint_physician_tasks'),
       to_regclass('public.blueprint_site_of_care'), to_regclass('public.blueprint_patient_age'),
       to_regprocedure('public.delete_own_account()'), to_regprocedure('public.check_draft_limit()');

-- 2. All policies (expect the 5 "Dev: Anon..." + 4 broad storage SELECTs; flag any other permissive/anon policy)
select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname in ('public','storage') order by 1,2,3;

-- 3. Public tables without RLS (expect exactly media, card_classifications, 5 blueprint_*)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1;

-- 4. Existing FKs to auth.users (the migration skips any <t>_user_id_fkey that already exists)
select conrelid::regclass, conname, confdeltype, convalidated from pg_constraint
where contype='f' and confrelid='auth.users'::regclass order by 1;

-- 5. feedback columns (the GRANT fails if a listed column is missing) + existing triggers
select column_name, is_nullable, column_default from information_schema.columns
where table_schema='public' and table_name='feedback' order by ordinal_position;
select tgname from pg_trigger where tgrelid='public.feedback'::regclass and not tgisinternal;

-- 6. GATE for the storage-policy migration: uploads must carry owner/owner_id.
--    with_owner / with_owner_id should be ≈ total. If not, drop migration
--    20261110120600 from the release.
select bucket_id, count(*) total, count(owner) with_owner, count(owner_id) with_owner_id, max(created_at)
from storage.objects where bucket_id in ('avatars','backgrounds','feedback-screenshots','card-media') group by 1;

-- 7. Orphans / tampered backup rows (informational; NOT VALID constraints tolerate them)
select 'decks', count(*) from public.decks x where not exists (select 1 from auth.users u where u.id=x.user_id)
union all select 'note_types', count(*) from public.note_types x where not exists (select 1 from auth.users u where u.id=x.user_id)
union all select 'notes', count(*) from public.notes x where not exists (select 1 from auth.users u where u.id=x.user_id)
union all select 'cards', count(*) from public.cards x where not exists (select 1 from auth.users u where u.id=x.user_id)
union all select 'reviews', count(*) from public.reviews x where not exists (select 1 from auth.users u where u.id=x.user_id);
select count(*) from public.backup_snapshots
where not (starts_with(storage_path, user_id::text||'/') and strpos(storage_path,'..')=0);
```

## Manual setup: nightly backup pruning

`prune-backups` is deployed by CI but only runs when called by a cron job holding `CRON_SECRET`. Until this is done it returns 403 and old snapshots accumulate.

1. `supabase secrets set CRON_SECRET=<random string> --project-ref uawkoueqectmkiyjcrtb`
2. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
3. SQL: `select vault.create_secret('<same random string>', 'backup_cron_secret');`
4. SQL:
   ```sql
   select cron.schedule('prune-backups-daily', '0 4 * * *', $$
     select net.http_post(
       url := 'https://uawkoueqectmkiyjcrtb.supabase.co/functions/v1/prune-backups',
       headers := jsonb_build_object('Content-Type','application/json',
                  'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='backup_cron_secret')),
       body := '{}'::jsonb)
   $$);
   ```

## After the release

- If query 7 returned zeros (or orphans were cleaned up), validate the constraints:
  `alter table public.<decks|note_types|notes|cards|reviews> validate constraint <table>_user_id_fkey;`
  and `alter table public.backup_snapshots validate constraint backup_snapshots_storage_path_owner_check;`
- Smoke test: delete a throwaway account in the new client → its Storage objects are gone and Sentry shows no "RPC fallback" warning.

## Key Decisions

1. **FKs added `NOT VALID`** — legacy orphan rows (from the dev mock-user period) are not deleted automatically; validating is a deliberate follow-up.
2. **Column-level feedback grants** — the column list is the union of what every released client sends; any future feedback column needs its own GRANT.
3. **delete-account falls back to the old RPC** only on network/relay/404 errors, so dev setups without the function still work (logged to Sentry).

## Known Limitations / Future Work

- **Not fixed here, critical:** the prod `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are compiled into every shipped installer (`electron.vite.config.ts` `define` + `release.yml` build env). Needs admin/AI calls moved to JWT-verified edge functions, then key rotation.
- avatars / backgrounds / feedback-screenshots INSERT policies still accept any object name (shipped clients always use the `${uid}-` prefix, so tightening later is safe).

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-10 | Created with pre-release checks and cron setup steps |
