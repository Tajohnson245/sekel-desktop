-- Add location and theme_preference to user_profiles
alter table public.user_profiles
add column if not exists location text,
add column if not exists theme_preference text default 'system';
