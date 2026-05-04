-- Add onboarded_at to user_profiles to track first-time tour completion.
-- NULL = user has not yet completed (or skipped) onboarding.
-- Existing users are backfilled to now() so the tour does not fire for them.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz NULL;

UPDATE user_profiles
  SET onboarded_at = now()
  WHERE onboarded_at IS NULL;
