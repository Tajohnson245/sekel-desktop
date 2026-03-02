-- Add avatar_url to user_profiles
alter table public.user_profiles
add column if not exists avatar_url text;

-- Create avatar storage bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS for avatars
-- Allow public access to view avatars
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatar
create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

-- Allow users to update their own avatar
create policy "Anyone can update their own avatar."
  on storage.objects for update
  using ( bucket_id = 'avatars' AND auth.uid() = owner )
  with check ( bucket_id = 'avatars' AND auth.uid() = owner );

-- Allow users to delete their own avatar
create policy "Anyone can delete their own avatar."
  on storage.objects for delete
  using ( bucket_id = 'avatars' AND auth.uid() = owner );
