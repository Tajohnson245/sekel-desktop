-- SEKEL-146: a backup snapshot row may only point inside its owner's folder.
--
-- backup_snapshots.storage_path is written by the client. The insert policy
-- only checks user_id = auth.uid(), so a user could insert a row whose
-- storage_path points at another user's file. The service-role
-- prune-backups function then deleted whatever storage_path named.
-- prune-backups now refuses such paths itself; this constraint stops new
-- rows like that from being written at all.
--
-- Shipped clients (cloudBackup.ts since v2.0.0) always write
-- storage_path = `${userId}/${snapshotId}.sqlite` with user_id = userId, so
-- they satisfy the constraint.
--
-- NOT VALID: existing rows aren't checked, so a tampered row already in prod
-- can't fail the release. FOLLOW-UP (human): run
--   select id, user_id, storage_path from public.backup_snapshots
--   where not (starts_with(storage_path, user_id::text || '/')
--              and strpos(storage_path, '..') = 0);
-- (prune-backups also deletes such rows' metadata on its next run). If it
-- returns 0 rows, run
--   alter table public.backup_snapshots
--     validate constraint backup_snapshots_storage_path_owner_check;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.backup_snapshots'::regclass
          and conname = 'backup_snapshots_storage_path_owner_check'
    ) then
        alter table public.backup_snapshots
            add constraint backup_snapshots_storage_path_owner_check
            check (
                starts_with(storage_path, user_id::text || '/')
                and strpos(storage_path, '..') = 0
            ) not valid;
    end if;
end
$$;
