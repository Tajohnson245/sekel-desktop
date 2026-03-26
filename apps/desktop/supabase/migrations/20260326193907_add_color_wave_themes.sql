-- Expand theme_preference to accept color wave themes (red, purple, pink, turquoise)
-- Column is already text with no constraints, so this is a no-op migration for documentation.
-- Valid values: 'system', 'light', 'dark', 'red', 'purple', 'pink', 'turquoise'
COMMENT ON COLUMN public.user_profiles.theme_preference IS
  'UI theme: system, light, dark, red, purple, pink, turquoise';
