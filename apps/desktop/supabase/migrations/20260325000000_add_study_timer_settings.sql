-- Add study timer settings to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS max_answer_seconds INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS show_timer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_advance_on_timeout BOOLEAN NOT NULL DEFAULT false;
