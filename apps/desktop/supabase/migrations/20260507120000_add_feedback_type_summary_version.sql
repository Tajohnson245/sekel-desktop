-- Add type, summary, and app_version columns to feedback for clearer triage.
--
-- Existing rows are backfilled before NOT NULL is applied so the migration
-- is safe to run against a populated table:
--   - type      → 'other' for legacy rows (couldn't have been classified)
--   - summary   → first 100 chars of description, padded if shorter
-- app_version stays nullable; we don't know which version produced legacy
-- rows, so leave it null rather than guess.

create type public.feedback_type as enum ('bug', 'feature_request', 'question', 'other');

alter table public.feedback add column type public.feedback_type;
update public.feedback set type = 'other' where type is null;
alter table public.feedback alter column type set not null;

alter table public.feedback add column summary text;
update public.feedback set summary = left(description, 100) where summary is null;
alter table public.feedback alter column summary set not null;
alter table public.feedback add constraint feedback_summary_length check (char_length(summary) <= 120);

alter table public.feedback add column app_version text;
