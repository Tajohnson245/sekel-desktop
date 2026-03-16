-- Note: This migration adds two new columns to the `cards` table: `anki_id` and `ease_factor`. The `anki_id` column is a bigint that can be used to store the corresponding Anki card ID, while the `ease_factor` column is an integer that can be used to store the ease factor for the card. Additionally, a unique index is created on the combination of `user_id` and `anki_id` to ensure that each user can only have one card with a specific Anki ID.
ALTER TABLE IF EXISTS public.cards
ADD COLUMN IF NOT EXISTS anki_id bigint;

ALTER TABLE IF EXISTS public.cards
ADD COLUMN IF NOT EXISTS ease_factor integer;

-- Create a unique index on the combination of user_id and anki_id to ensure that each user can only have one card with a specific Anki ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_anki_id
ON public.cards (user_id, anki_id)
WHERE anki_id IS NOT NULL;