ALTER TABLE public.user_profiles
ADD COLUMN notifications_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN reminder_times jsonb NOT NULL DEFAULT '[]'::jsonb;
