-- Add ticket_number to feedback for human-friendly Feedback-NNN display IDs.
--
-- bigserial gives us:
--   - an auto-incrementing sequence (no app-side counter to maintain)
--   - existing rows get values during the column add, so no NULL backfill
--   - NOT NULL by default
-- A UNIQUE constraint protects the display ID from accidental duplication.

alter table public.feedback add column ticket_number bigserial;
alter table public.feedback add constraint feedback_ticket_number_unique unique (ticket_number);
