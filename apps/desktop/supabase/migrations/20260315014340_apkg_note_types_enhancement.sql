-- Notes table: add anki_id for tracking columns for inport/re-import dedup
ALTER TABLE IF EXISTS note_types
ADD COLUMN IF NOT EXISTS anki_id bigint;

-- Partial unique index for fast dedup lookups on re-import
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_types_anki_id
ON note_types (user_id, anki_id)
WHERE anki_id IS NOT NULL;