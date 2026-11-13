-- SEKEL-157: set the pre-local-first study tables aside.
--
-- decks, note_types, notes, cards, reviews, deck_sessions, card_drafts, media
-- and card_classifications date from before the app moved to local SQLite.
-- Nothing in the app has read or written them since; only the admin
-- dashboard still counted them. Their shape no longer matches the local
-- schema and their user FKs were never validated (20261110120200).
--
-- They move to a `legacy` schema (with their data, indexes, constraints,
-- policies and triggers) so the synced tables can take the public names
-- (20261113120100_sync_schema.sql). The legacy schema isn't exposed through
-- the API: no client role can use it. Drop it once nothing needs the old
-- rows (Phase 5 of docs/features/desktop/in-progress/supabase-sync.md).
--
-- Account deletion still cascades into these rows through their auth.users FKs.

create schema if not exists legacy;
revoke all on schema legacy from public, anon, authenticated;

alter table public.card_classifications set schema legacy;
alter table public.reviews              set schema legacy;
alter table public.deck_sessions        set schema legacy;
alter table public.cards                set schema legacy;
alter table public.notes                set schema legacy;
alter table public.note_types           set schema legacy;
alter table public.decks                set schema legacy;
alter table public.card_drafts          set schema legacy;
alter table public.media                set schema legacy;
