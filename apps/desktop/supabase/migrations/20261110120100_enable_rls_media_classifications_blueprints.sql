-- SEKEL-146: enable RLS on tables that were created without it.
--
-- public.media (20260315200244), public.card_classifications and the five
-- public.blueprint_* tables (20260403150005) never had RLS enabled. With
-- Supabase's default table grants, anon and authenticated could read and
-- write every row through PostgREST.
--
-- No shipped client (v1.0.0 - v2.0.0) reads or writes these tables in
-- Supabase. Media, classifications and blueprints live in the local SQLite
-- database. The blueprint seeder (scripts/seed-blueprints-supabase.ts) and
-- the admin dashboard use the service role, which bypasses RLS. The policies
-- below keep any future client access scoped to the owner.

---------------------------------------------------------------------
-- media: owner-only for signed-in users
---------------------------------------------------------------------
alter table public.media enable row level security;

drop policy if exists "Users can view their own media" on public.media;
create policy "Users can view their own media"
    on public.media for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own media" on public.media;
create policy "Users can create their own media"
    on public.media for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own media" on public.media;
create policy "Users can update their own media"
    on public.media for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own media" on public.media;
create policy "Users can delete their own media"
    on public.media for delete
    to authenticated
    using ((select auth.uid()) = user_id);

---------------------------------------------------------------------
-- card_classifications: no user_id column, so ownership comes from the card.
---------------------------------------------------------------------
alter table public.card_classifications enable row level security;

drop policy if exists "Users can view classifications of their own cards" on public.card_classifications;
create policy "Users can view classifications of their own cards"
    on public.card_classifications for select
    to authenticated
    using (exists (
        select 1 from public.cards c
        where c.id = card_classifications.card_id
          and c.user_id = (select auth.uid())
    ));

drop policy if exists "Users can create classifications for their own cards" on public.card_classifications;
create policy "Users can create classifications for their own cards"
    on public.card_classifications for insert
    to authenticated
    with check (exists (
        select 1 from public.cards c
        where c.id = card_classifications.card_id
          and c.user_id = (select auth.uid())
    ));

drop policy if exists "Users can update classifications of their own cards" on public.card_classifications;
create policy "Users can update classifications of their own cards"
    on public.card_classifications for update
    to authenticated
    using (exists (
        select 1 from public.cards c
        where c.id = card_classifications.card_id
          and c.user_id = (select auth.uid())
    ))
    with check (exists (
        select 1 from public.cards c
        where c.id = card_classifications.card_id
          and c.user_id = (select auth.uid())
    ));

drop policy if exists "Users can delete classifications of their own cards" on public.card_classifications;
create policy "Users can delete classifications of their own cards"
    on public.card_classifications for delete
    to authenticated
    using (exists (
        select 1 from public.cards c
        where c.id = card_classifications.card_id
          and c.user_id = (select auth.uid())
    ));

---------------------------------------------------------------------
-- blueprint_*: public reference data. Read-only for clients. Only the
-- service-role seeder writes; with RLS on and no write policies, anon and
-- authenticated writes are denied.
---------------------------------------------------------------------
alter table public.blueprint_exams enable row level security;
alter table public.blueprint_systems enable row level security;
alter table public.blueprint_physician_tasks enable row level security;
alter table public.blueprint_site_of_care enable row level security;
alter table public.blueprint_patient_age enable row level security;

drop policy if exists "Blueprint exams are readable" on public.blueprint_exams;
create policy "Blueprint exams are readable"
    on public.blueprint_exams for select
    to anon, authenticated
    using (true);

drop policy if exists "Blueprint systems are readable" on public.blueprint_systems;
create policy "Blueprint systems are readable"
    on public.blueprint_systems for select
    to anon, authenticated
    using (true);

drop policy if exists "Blueprint physician tasks are readable" on public.blueprint_physician_tasks;
create policy "Blueprint physician tasks are readable"
    on public.blueprint_physician_tasks for select
    to anon, authenticated
    using (true);

drop policy if exists "Blueprint site of care is readable" on public.blueprint_site_of_care;
create policy "Blueprint site of care is readable"
    on public.blueprint_site_of_care for select
    to anon, authenticated
    using (true);

drop policy if exists "Blueprint patient age is readable" on public.blueprint_patient_age;
create policy "Blueprint patient age is readable"
    on public.blueprint_patient_age for select
    to anon, authenticated
    using (true);
