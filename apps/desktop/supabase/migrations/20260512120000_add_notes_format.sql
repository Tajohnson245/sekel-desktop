-- Add format column to notes for AI-generated card format tracking.
-- Nullable: existing rows + imported Anki notes have no AI format and stay null.
-- Renderers branch on this attribute to apply format-specific styling instead
-- of fishing for HTML shape patterns (e.g. detecting MCQ vs compare-contrast).

ALTER TABLE public.notes
    ADD COLUMN IF NOT EXISTS format text;

ALTER TABLE public.notes
    DROP CONSTRAINT IF EXISTS notes_format_check;

ALTER TABLE public.notes
    ADD CONSTRAINT notes_format_check
    CHECK (format IS NULL OR format IN (
        'basic',
        'cloze',
        'reversed',
        'true-false',
        'compare-contrast',
        'multiple-choice'
    ));
