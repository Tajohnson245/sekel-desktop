-- Add daily study limit columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS daily_new_limit INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS daily_review_limit INTEGER NOT NULL DEFAULT 200;
