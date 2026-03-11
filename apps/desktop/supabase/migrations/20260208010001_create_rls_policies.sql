-- Migration: Row Level Security policies
-- Ensures users can only access their own data

-- enable RLS on all tables
alter table public.decks enable row level security;
alter table public.note_types enable row level security;
alter table public.notes enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;

---------------------------------------------------------------------
-- DECKS RLS policies
---------------------------------------------------------------------
create policy "Users can view their own decks"
    on public.decks for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own decks"
    on public.decks for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own decks"
    on public.decks for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own decks"
    on public.decks for delete
    to authenticated
    using (auth.uid() = user_id);

---------------------------------------------------------------------
-- NOTE_TYPES RLS policies
---------------------------------------------------------------------
create policy "Users can view their own note types"
    on public.note_types for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own note types"
    on public.note_types for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own note types"
    on public.note_types for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own note types"
    on public.note_types for delete
    to authenticated
    using (auth.uid() = user_id);

---------------------------------------------------------------------
-- NOTES RLS policies
---------------------------------------------------------------------
create policy "Users can view their own notes"
    on public.notes for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own notes"
    on public.notes for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own notes"
    on public.notes for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own notes"
    on public.notes for delete
    to authenticated
    using (auth.uid() = user_id);

---------------------------------------------------------------------
-- CARDS RLS policies
---------------------------------------------------------------------
create policy "Users can view their own cards"
    on public.cards for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own cards"
    on public.cards for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own cards"
    on public.cards for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own cards"
    on public.cards for delete
    to authenticated
    using (auth.uid() = user_id);

---------------------------------------------------------------------
-- REVIEWS RLS policies
---------------------------------------------------------------------
create policy "Users can view their own reviews"
    on public.reviews for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can create their own reviews"
    on public.reviews for insert
    to authenticated
    with check (auth.uid() = user_id);

-- reviews are immutable, no update policy

create policy "Users can delete their own reviews"
    on public.reviews for delete
    to authenticated
    using (auth.uid() = user_id);
