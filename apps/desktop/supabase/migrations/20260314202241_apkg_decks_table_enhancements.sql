-- 1. Add new columns
ALTER TABLE IF EXISTS public.decks
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES decks(id);

ALTER TABLE IF EXISTS public.decks
ADD COLUMN IF NOT EXISTS anki_id bigint;

-- 2. Add algorithm column (nullable first, so we can populate it)
ALTER TABLE IF EXISTS public.decks
ADD COLUMN IF NOT EXISTS algorithm text NOT NULL DEFAULT 'fsrs';

-- 3. Migrate existing data BEFORE dropping the old column
UPDATE public.decks
SET algorithm = CASE
    WHEN fsrs_enabled = true THEN 'fsrs'
    WHEN fsrs_enabled = false THEN 'sm2'
    ELSE 'fsrs'
END;

-- 4. Now set the NOT NULL default for future rows
ALTER TABLE IF EXISTS public.decks
ALTER COLUMN algorithm SET NOT NULL,
ALTER COLUMN algorithm SET DEFAULT 'fsrs';

-- 5. Safe to drop now - data is perserved
ALTER TABLE IF EXISTS public.decks
DROP COLUMN IF EXISTS fsrs_enabled;