-- Per-user preference for how wide image-occlusion ("Visual") cards render
-- during study sessions. Independent of Electron's renderer-wide zoom — this
-- only widens .occlusion-card containers; the rest of the UI is unaffected.
--
-- Values:
--   'compact' — 480px max-width (side-by-side study, smaller screens)
--   'default' — 600px max-width (current behaviour)
--   'large'   — 800px max-width
--   'full'    — fill available width, minus margins

ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS visual_card_size text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_visual_card_size_check;

ALTER TABLE IF EXISTS public.user_profiles
ADD CONSTRAINT user_profiles_visual_card_size_check
CHECK (visual_card_size IN ('compact', 'default', 'large', 'full'));
