-- Cloud backup snapshots.
-- Each row is metadata pointing at a full SQLite file stored in the private
-- `sekel-backups` bucket at path {user_id}/{snapshot_id}.sqlite. The bytes live
-- in Storage; this table is the queryable index for the restore UI and the
-- generational pruning job. See docs/features/desktop/in-progress/cloud-backup-system.md.

create table public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  generation text not null default 'daily' check (generation in ('daily', 'weekly', 'monthly')),
  size_bytes bigint not null,
  storage_path text not null,
  review_count_at_snapshot integer,
  app_version text
);

create index idx_backup_snapshots_user_created
  on public.backup_snapshots (user_id, created_at desc);

alter table public.backup_snapshots enable row level security;

-- Users see only their own snapshot metadata (drives the restore list).
create policy "Users can read own backup snapshots"
  on public.backup_snapshots for select
  to authenticated
  using (auth.uid() = user_id);

-- Clients insert new snapshots (always as the newest 'daily' generation).
create policy "Users can insert own backup snapshots"
  on public.backup_snapshots for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Clients may delete their own snapshots (manual cleanup); generational
-- promotion/pruning runs server-side via the service role and bypasses RLS.
create policy "Users can delete own backup snapshots"
  on public.backup_snapshots for delete
  to authenticated
  using (auth.uid() = user_id);

-- Private bucket (public = false): backups are never world-readable.
-- 1 GiB per-file ceiling comfortably covers a full SQLite copy for heavy users.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sekel-backups', 'sekel-backups', false, 1073741824)
on conflict (id) do nothing;

-- Per-user folder isolation: the first path segment must be the caller's uid.
create policy "Users can read own backups"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sekel-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload own backups"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sekel-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own backups"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sekel-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
