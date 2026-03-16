-- Notes table: add Anki tracking columns for inport/re-import dedup

ALTER TABLE IF EXISTS public.notes
ADD COLUMN IF NOT EXISTS anki_id bigint;

ALTER TABLE IF EXISTS public.notes
ADD COLUMN IF NOT EXISTS anki_guid text;

-- Partial unique index for fast dedup lookups on re-import
CREATE INDEX IF NOT EXISTS idx_notes_anki_guid
ON public.notes(anki_guid)
WHERE anki_guid IS NOT NULL;