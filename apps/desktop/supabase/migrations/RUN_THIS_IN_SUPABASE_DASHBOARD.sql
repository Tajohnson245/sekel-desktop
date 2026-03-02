-- Run this in Supabase Dashboard > SQL Editor if "db push" fails
-- Creates deck_sessions and extends reviews for post-session analytics

-- Session status enum (skip if already exists)
do $$ begin
    create type public.session_status as enum ('in_progress', 'completed');
exception
    when duplicate_object then null;
end $$;

-- Deck sessions table (skip if already exists)
create table if not exists public.deck_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id uuid not null references public.decks(id) on delete cascade,
    status public.session_status not null default 'in_progress',
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists deck_sessions_user_id_idx on public.deck_sessions(user_id);
create index if not exists deck_sessions_deck_id_idx on public.deck_sessions(deck_id);
create index if not exists deck_sessions_status_idx on public.deck_sessions(status);

alter table public.deck_sessions enable row level security;

drop policy if exists "Users can view their own deck sessions" on public.deck_sessions;
create policy "Users can view their own deck sessions"
    on public.deck_sessions for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can create their own deck sessions" on public.deck_sessions;
create policy "Users can create their own deck sessions"
    on public.deck_sessions for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own deck sessions" on public.deck_sessions;
create policy "Users can update their own deck sessions"
    on public.deck_sessions for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Add columns to reviews (ignore if already exist)
alter table public.reviews add column if not exists session_id uuid references public.deck_sessions(id) on delete set null;
alter table public.reviews add column if not exists deck_id uuid references public.decks(id) on delete cascade;
alter table public.reviews add column if not exists review_index integer;

create index if not exists reviews_session_id_idx on public.reviews(session_id);
