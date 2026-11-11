-- SEKEL-146: drop the development-only anon policies.
--
-- 20260208010002_dev_anon_policies.sql created
--   "Dev: Anon can do all on {decks,note_types,notes,cards,reviews}"
--   FOR ALL TO anon USING (true) WITH CHECK (true)
-- and they were never removed. Because the anon key ships inside every
-- desktop build, anyone could read, insert, update or delete every user's
-- decks/notes/cards/reviews through PostgREST without signing in.
--
-- Shipped clients (v1.0.0 - v2.0.0) only touch these tables while signed in,
-- through the per-user "Users can ... their own ..." policies from
-- 20260208010001_create_rls_policies.sql, which are unchanged. The admin
-- dashboard uses the service role and bypasses RLS. So nothing legitimate
-- depends on the anon policies.

drop policy if exists "Dev: Anon can do all on decks" on public.decks;
drop policy if exists "Dev: Anon can do all on note_types" on public.note_types;
drop policy if exists "Dev: Anon can do all on notes" on public.notes;
drop policy if exists "Dev: Anon can do all on cards" on public.cards;
drop policy if exists "Dev: Anon can do all on reviews" on public.reviews;
