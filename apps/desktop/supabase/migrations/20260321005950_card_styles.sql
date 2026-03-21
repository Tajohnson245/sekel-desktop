ALTER TABLE IF EXISTS public.user_profiles
ADD COLUMN IF NOT EXISTS card_style boolean DEFAULT true;