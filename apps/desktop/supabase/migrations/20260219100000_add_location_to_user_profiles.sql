-- Add location column to user_profiles (for City, Country display)
alter table public.user_profiles
add column if not exists location text;
