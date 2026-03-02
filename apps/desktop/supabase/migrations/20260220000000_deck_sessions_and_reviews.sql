-- Migration: deck_sessions table and reviews session scoping
-- Enables post-session analytics

---------------------------------------------------------------------
-- SESSION_STATUS enum
---------------------------------------------------------------------
create type public.session_status as enum ('in_progress', 'completed');

---------------------------------------------------------------------
-- DECK_SESSIONS table
---------------------------------------------------------------------
create table public.deck_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id uuid not null references public.decks(id) on delete cascade,
    status public.session_status not null default 'in_progress',
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

create index deck_sessions_user_id_idx on public.deck_sessions(user_id);
create index deck_sessions_deck_id_idx on public.deck_sessions(deck_id);
create index deck_sessions_status_idx on public.deck_sessions(status);

comment on table public.deck_sessions is 'Deck study sessions for post-session analytics';

-- RLS for deck_sessions
alter table public.deck_sessions enable row level security;

create policy "Users can view their own deck sessions"
    on public.deck_sessions for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own deck sessions"
    on public.deck_sessions for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own deck sessions"
    on public.deck_sessions for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

---------------------------------------------------------------------
-- Alter REVIEWS table
---------------------------------------------------------------------
alter table public.reviews
    add column session_id uuid references public.deck_sessions(id) on delete set null,
    add column deck_id uuid references public.decks(id) on delete cascade,
    add column review_index integer;

create index reviews_session_id_idx on public.reviews(session_id);
