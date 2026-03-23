-- Create feedback table for user bug reports / feature requests
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  areas text[] not null,
  description text not null,
  screenshot_url text,
  desired_fix text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Users can read their own feedback (needed for insert...returning)
create policy "Users can read own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

-- Create feedback-screenshots storage bucket (public read)
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', true)
on conflict (id) do nothing;

-- Allow public access to view feedback screenshots
create policy "Feedback screenshots are publicly accessible."
  on storage.objects for select
  using (bucket_id = 'feedback-screenshots');

-- Allow authenticated users to upload feedback screenshots
create policy "Authenticated users can upload feedback screenshots."
  on storage.objects for insert
  with check (bucket_id = 'feedback-screenshots' and auth.role() = 'authenticated');
