-- SEKEL-146: make account deletion actually remove the user's rows.
--
-- 1. 20260208010003_drop_auth_fk_dev.sql dropped the user_id -> auth.users
--    foreign keys on decks / note_types / notes / cards / reviews "for
--    development" and they were never re-added. Deleting a user therefore
--    left all of their rows behind.
--
--    This re-adds them with ON DELETE CASCADE and NOT VALID:
--      - NOT VALID skips checking existing rows, so the migration cannot fail
--        or delete anything because of orphan rows already in prod (rows whose
--        user no longer exists). Orphans are left alone on purpose.
--      - The constraint is still enforced for every new or updated row, and
--        the cascade fires for every row that references a deleted user.
--      - FOLLOW-UP (human): count orphans per table, e.g.
--          select count(*) from public.decks t
--          where not exists (select 1 from auth.users u where u.id = t.user_id);
--        Once a table has zero (after deciding what to do with any
--        leftovers), run
--          alter table public.decks validate constraint decks_user_id_fkey;
--        and the same for note_types, notes, cards and reviews.
--
--    Shipped clients only insert rows with user_id = auth.uid() (RLS
--    enforces it), and that user always exists, so new inserts keep working.
--
-- 2. media_user_id_fkey (20260315200244) has no ON DELETE action (NO ACTION).
--    Deleting a user who has media rows fails outright. Recreate it with
--    ON DELETE CASCADE. The old constraint was validated, so the new one can
--    be validated too, while the ACCESS EXCLUSIVE lock from DROP CONSTRAINT
--    is still held in this transaction.

do $$
declare
    t text;
    con text;
begin
    foreach t in array array['decks', 'note_types', 'notes', 'cards', 'reviews'] loop
        con := t || '_user_id_fkey';
        if not exists (
            select 1 from pg_constraint
            where conrelid = format('public.%I', t)::regclass
              and conname = con
        ) then
            execute format(
                'alter table public.%I add constraint %I foreign key (user_id) '
                'references auth.users(id) on delete cascade not valid',
                t, con
            );
        end if;
    end loop;
end
$$;

do $$
declare
    was_validated boolean;
begin
    select convalidated into was_validated
    from pg_constraint
    where conrelid = 'public.media'::regclass
      and conname = 'media_user_id_fkey';

    alter table public.media drop constraint if exists media_user_id_fkey;
    alter table public.media
        add constraint media_user_id_fkey foreign key (user_id)
        references auth.users(id) on delete cascade not valid;

    -- Only validate if the constraint we replaced was already valid (it is,
    -- if 20260315200244 ran as written). If prod has drifted, leave it
    -- NOT VALID rather than failing the release.
    if coalesce(was_validated, false) then
        alter table public.media validate constraint media_user_id_fkey;
    end if;
end
$$;
