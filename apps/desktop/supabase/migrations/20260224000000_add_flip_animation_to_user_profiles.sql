-- Add flip_animation preference to user_profiles
-- Defaults to true so all existing users keep the animation enabled

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS flip_animation boolean NOT NULL DEFAULT true;
