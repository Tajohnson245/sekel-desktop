-- SEKEL-146: let older desktop clients submit feedback again.
--
-- 20260507120000_add_feedback_type_summary_version.sql made feedback.type
-- and feedback.summary NOT NULL. Clients up to v1.0.6 don't send either
-- column, so every feedback submission from them has failed with a NOT NULL
-- violation ever since. macOS and Linux builds don't auto-update, so those
-- users are stuck on the old client.
--
-- Fill the gaps on the server instead of loosening the constraints:
--   - type    -> column DEFAULT 'other' (allowed by the feedback_type enum;
--                the same value the original migration backfilled)
--   - summary -> BEFORE INSERT trigger: when NULL, use the first 100 chars
--                of description (same backfill rule; fits the
--                char_length(summary) <= 120 CHECK)
-- Newer clients always send both, so neither path changes anything for them.

alter table public.feedback alter column type set default 'other';

create or replace function public.feedback_default_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.summary is null then
        new.summary := left(new.description, 100);
    end if;
    return new;
end;
$$;

comment on function public.feedback_default_summary() is
    'Fills feedback.summary from description for clients that predate the summary column (<= v1.0.6).';

drop trigger if exists feedback_default_summary on public.feedback;
create trigger feedback_default_summary
    before insert on public.feedback
    for each row execute function public.feedback_default_summary();
