create table public.user_profiles (
  id uuid not null references auth.users(id) on delete cascade primary key,
  first_name text,
  last_name text,
  role text,
  medical_school text,
  degree_track text,
  exam text,
  target_date text,
  language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can view their own profile"
  on public.user_profiles for select
  using ( auth.uid() = id );

create policy "Users can update their own profile"
  on public.user_profiles for update
  using ( auth.uid() = id );

create policy "Users can insert their own profile"
  on public.user_profiles for insert
  with check ( auth.uid() = id );
