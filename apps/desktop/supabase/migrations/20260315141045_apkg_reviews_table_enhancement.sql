-- The card's interval (in days) going into this review
-- Maps to Anki's lastIvl field from the revlog table
ALTER TABLE IF EXISTS reviews
ADD COLUMN IF NOT EXISTS interval_before integer;

-- The ease factor after this review (e.g., 2500 = 250%)
-- Only used for SM-2 imported reviews; maps to Anki's factor field
ALTER TABLE IF EXISTS reviews
ADD COLUMN IF NOT EXISTS ease_factor_after integer;

-- The type of review that occurred
-- 0 = learn, 1 = review, 2 = relearn, 3 = filtered
-- Maps to Anki's type field from the revlog table
ALTER TABLE IF EXISTS reviews
ADD COLUMN IF NOT EXISTS review_type integer;