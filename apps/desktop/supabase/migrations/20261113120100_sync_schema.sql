-- SEKEL-157: row-level sync tables (docs/features/desktop/in-progress/supabase-sync.md).
--
-- One table per user-owned SQLite table, with the same columns and ids. The
-- column lists come from apps/desktop/src/main/sync/tables.ts, and
-- syncSchema.test.ts checks this schema against that file. JSON columns are
-- json, not jsonb: jsonb reorders object keys, and note fields are
-- order-sensitive. Every table also carries the sync columns:
--   client_changed_at  last-writer-wins clock, from the device that made the change
--   deleted_at         tombstone; clients never hard-delete, so deletes reach every device
--   origin_device      device that wrote the current version
--   server_seq         global sequence, bumped on every write; the pull cursor
--   server_updated_at  server time of the last write
--
-- Clients write through sync_push_v1 (20261113120200_sync_functions.sql).
-- RLS limits every row to its owner, and DELETE isn't granted to clients.
-- Additive only: no released client reads these tables, so this can ship
-- ahead of the app release that syncs.

create sequence public.sync_seq as bigint;
-- nextval() in the stamp trigger runs as the writing role.
grant usage on sequence public.sync_seq to authenticated, service_role;

create function public.sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.server_seq := nextval('public.sync_seq');
    new.server_updated_at := now();
    return new;
end;
$$;

-- ── Synced tables (generated from the spec) ─────────────────────────────────

create table public.note_types (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    fields json not null,
    card_templates json not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    anki_id bigint,
    anki_meta json,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index note_types_user_seq_idx on public.note_types (user_id, server_seq);
create trigger note_types_sync_stamp before insert or update on public.note_types
    for each row execute function public.sync_stamp();
alter table public.note_types enable row level security;
create policy "Users read their own note_types" on public.note_types
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own note_types" on public.note_types
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own note_types" on public.note_types
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.note_types from public, anon, authenticated;
grant select, insert, update on public.note_types to authenticated;
grant all on public.note_types to service_role;

create table public.decks (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    algorithm text not null,
    parent_id uuid references public.decks(id) on delete cascade deferrable initially deferred,
    anki_id bigint,
    anki_meta json,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index decks_user_seq_idx on public.decks (user_id, server_seq);
create index decks_parent_id_idx on public.decks (parent_id);
create trigger decks_sync_stamp before insert or update on public.decks
    for each row execute function public.sync_stamp();
alter table public.decks enable row level security;
create policy "Users read their own decks" on public.decks
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own decks" on public.decks
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own decks" on public.decks
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.decks from public, anon, authenticated;
grant select, insert, update on public.decks to authenticated;
grant all on public.decks to service_role;

create table public.notes (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id uuid not null references public.decks(id) on delete cascade deferrable initially deferred,
    note_type_id uuid not null references public.note_types(id) on delete cascade deferrable initially deferred,
    fields json not null,
    tags json not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    anki_id bigint,
    anki_guid text,
    anki_meta json,
    format text,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index notes_user_seq_idx on public.notes (user_id, server_seq);
create index notes_deck_id_idx on public.notes (deck_id);
create index notes_note_type_id_idx on public.notes (note_type_id);
create trigger notes_sync_stamp before insert or update on public.notes
    for each row execute function public.sync_stamp();
alter table public.notes enable row level security;
create policy "Users read their own notes" on public.notes
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own notes" on public.notes
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own notes" on public.notes
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.notes from public, anon, authenticated;
grant select, insert, update on public.notes to authenticated;
grant all on public.notes to service_role;

create table public.cards (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid not null references public.notes(id) on delete cascade deferrable initially deferred,
    template_index integer not null,
    state text not null,
    due timestamptz not null,
    stability double precision not null,
    difficulty double precision not null,
    elapsed_days integer not null,
    scheduled_days integer not null,
    reps integer not null,
    lapses integer not null,
    last_review timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    anki_id bigint,
    ease_factor double precision,
    anki_meta json,
    learning_steps integer not null,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index cards_user_seq_idx on public.cards (user_id, server_seq);
create index cards_note_id_idx on public.cards (note_id);
create trigger cards_sync_stamp before insert or update on public.cards
    for each row execute function public.sync_stamp();
alter table public.cards enable row level security;
create policy "Users read their own cards" on public.cards
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own cards" on public.cards
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own cards" on public.cards
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.cards from public, anon, authenticated;
grant select, insert, update on public.cards to authenticated;
grant all on public.cards to service_role;

create table public.deck_sessions (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id uuid not null references public.decks(id) on delete cascade deferrable initially deferred,
    status text not null,
    started_at timestamptz not null,
    completed_at timestamptz,
    created_at timestamptz not null,
    kind text not null,
    scope text,
    system_keys json,
    updated_at timestamptz,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index deck_sessions_user_seq_idx on public.deck_sessions (user_id, server_seq);
create index deck_sessions_deck_id_idx on public.deck_sessions (deck_id);
create trigger deck_sessions_sync_stamp before insert or update on public.deck_sessions
    for each row execute function public.sync_stamp();
alter table public.deck_sessions enable row level security;
create policy "Users read their own deck_sessions" on public.deck_sessions
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own deck_sessions" on public.deck_sessions
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own deck_sessions" on public.deck_sessions
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.deck_sessions from public, anon, authenticated;
grant select, insert, update on public.deck_sessions to authenticated;
grant all on public.deck_sessions to service_role;

create table public.reviews (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade deferrable initially deferred,
    rating text not null,
    review_time timestamptz not null,
    review_duration_ms integer,
    state_before text not null,
    stability_before double precision not null,
    difficulty_before double precision not null,
    state_after text not null,
    stability_after double precision not null,
    difficulty_after double precision not null,
    scheduled_days integer not null,
    session_id uuid references public.deck_sessions(id) on delete set null deferrable initially deferred,
    deck_id uuid,
    review_index integer,
    created_at timestamptz not null,
    interval_before integer,
    ease_factor_after double precision,
    review_type integer,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index reviews_user_seq_idx on public.reviews (user_id, server_seq);
create index reviews_card_id_idx on public.reviews (card_id);
create index reviews_session_id_idx on public.reviews (session_id);
create index reviews_user_id_review_time_idx on public.reviews (user_id, review_time);
create trigger reviews_sync_stamp before insert or update on public.reviews
    for each row execute function public.sync_stamp();
alter table public.reviews enable row level security;
create policy "Users read their own reviews" on public.reviews
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own reviews" on public.reviews
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own reviews" on public.reviews
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.reviews from public, anon, authenticated;
grant select, insert, update on public.reviews to authenticated;
grant all on public.reviews to service_role;

create table public.card_drafts (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    front text not null,
    back text not null,
    source text,
    created_at timestamptz not null,
    updated_at timestamptz,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index card_drafts_user_seq_idx on public.card_drafts (user_id, server_seq);
create trigger card_drafts_sync_stamp before insert or update on public.card_drafts
    for each row execute function public.sync_stamp();
alter table public.card_drafts enable row level security;
create policy "Users read their own card_drafts" on public.card_drafts
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own card_drafts" on public.card_drafts
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own card_drafts" on public.card_drafts
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.card_drafts from public, anon, authenticated;
grant select, insert, update on public.card_drafts to authenticated;
grant all on public.card_drafts to service_role;

create table public.media (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    filename text not null,
    file_hash text not null,
    file_size bigint,
    mime_type text,
    created_at timestamptz not null,
    storage_path text not null,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null,
    constraint media_storage_path_owner_check check (storage_path like user_id::text || '/%' and position('..' in storage_path) = 0)
);
create index media_user_seq_idx on public.media (user_id, server_seq);
create trigger media_sync_stamp before insert or update on public.media
    for each row execute function public.sync_stamp();
alter table public.media enable row level security;
create policy "Users read their own media" on public.media
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own media" on public.media
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own media" on public.media
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.media from public, anon, authenticated;
grant select, insert, update on public.media to authenticated;
grant all on public.media to service_role;

create table public.plans (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    exam_key text not null,
    name text not null,
    cards_per_day integer not null,
    suggested_per_day integer not null,
    snapshot json not null,
    status text not null,
    activated_at timestamptz not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deck_filter json,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index plans_user_seq_idx on public.plans (user_id, server_seq);
create trigger plans_sync_stamp before insert or update on public.plans
    for each row execute function public.sync_stamp();
alter table public.plans enable row level security;
create policy "Users read their own plans" on public.plans
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own plans" on public.plans
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own plans" on public.plans
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.plans from public, anon, authenticated;
grant select, insert, update on public.plans to authenticated;
grant all on public.plans to service_role;

create table public.user_exam_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    exam_key text not null,
    exam_date text not null,
    is_primary boolean not null,
    session_mode text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    last_notified_threshold double precision,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null,
    constraint user_exam_profiles_user_exam_key unique (user_id, exam_key)
);
create index user_exam_profiles_user_seq_idx on public.user_exam_profiles (user_id, server_seq);
create trigger user_exam_profiles_sync_stamp before insert or update on public.user_exam_profiles
    for each row execute function public.sync_stamp();
alter table public.user_exam_profiles enable row level security;
create policy "Users read their own user_exam_profiles" on public.user_exam_profiles
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own user_exam_profiles" on public.user_exam_profiles
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own user_exam_profiles" on public.user_exam_profiles
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.user_exam_profiles from public, anon, authenticated;
grant select, insert, update on public.user_exam_profiles to authenticated;
grant all on public.user_exam_profiles to service_role;

create table public.card_classifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade deferrable initially deferred,
    exam_key text not null,
    system_key text,
    topic_key text,
    confidence double precision,
    split_weight double precision not null,
    classified_at timestamptz not null,
    model_version text,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null,
    constraint card_classifications_natural_key unique nulls not distinct (card_id, exam_key, system_key)
);
create index card_classifications_user_seq_idx on public.card_classifications (user_id, server_seq);
create index card_classifications_card_id_idx on public.card_classifications (card_id);
create trigger card_classifications_sync_stamp before insert or update on public.card_classifications
    for each row execute function public.sync_stamp();
alter table public.card_classifications enable row level security;
create policy "Users read their own card_classifications" on public.card_classifications
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own card_classifications" on public.card_classifications
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own card_classifications" on public.card_classifications
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.card_classifications from public, anon, authenticated;
grant select, insert, update on public.card_classifications to authenticated;
grant all on public.card_classifications to service_role;

create table public.time_travel_log (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    triggered_at timestamptz not null,
    overdue_count integer not null,
    window_days integer not null,
    daily_target integer not null,
    client_changed_at timestamptz not null,
    deleted_at timestamptz,
    origin_device uuid,
    server_seq bigint not null,
    server_updated_at timestamptz not null
);
create index time_travel_log_user_seq_idx on public.time_travel_log (user_id, server_seq);
create trigger time_travel_log_sync_stamp before insert or update on public.time_travel_log
    for each row execute function public.sync_stamp();
alter table public.time_travel_log enable row level security;
create policy "Users read their own time_travel_log" on public.time_travel_log
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert their own time_travel_log" on public.time_travel_log
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own time_travel_log" on public.time_travel_log
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.time_travel_log from public, anon, authenticated;
grant select, insert, update on public.time_travel_log to authenticated;
grant all on public.time_travel_log to service_role;

-- ── Remote switch ───────────────────────────────────────────────────────────
-- Sync starts switched off. Turn it on for a few accounts first:
--   update public.app_config
--      set value = jsonb_set(value, '{allow_users}', '["<auth user id>"]'::jsonb)
--    where key = 'sync';
-- and later for everyone:
--   update public.app_config set value = jsonb_set(value, '{enabled}', 'true') where key = 'sync';

create table public.app_config (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "Signed-in users read app config" on public.app_config
    for select to authenticated using (true);
revoke all on public.app_config from public, anon, authenticated;
grant select on public.app_config to authenticated;
grant all on public.app_config to service_role;

insert into public.app_config (key, value)
values ('sync', '{"enabled": false, "allow_users": []}'::jsonb)
on conflict (key) do nothing;

-- ── user_profiles: per-user UI state, server-stamped updated_at ─────────────
-- ui_state holds small UI preferences that should follow the user between
-- devices (minimal study view, dismissed tours and briefings, …). The
-- default keeps older clients, which upsert without it, unaffected.
alter table public.user_profiles add column if not exists ui_state jsonb not null default '{}'::jsonb;

create trigger user_profiles_updated_at before update on public.user_profiles
    for each row execute function public.update_updated_at_column();

-- ── Media files ─────────────────────────────────────────────────────────────
-- Private, content-addressed: {user id}/{sha1}{ext}. Uploads are idempotent,
-- so there's no update policy; delete-account removes a user's folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sekel-media', 'sekel-media', false, 52428800)
on conflict (id) do nothing;

create policy "Users read their own synced media" on storage.objects
    for select to authenticated
    using (bucket_id = 'sekel-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload their own synced media" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'sekel-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
