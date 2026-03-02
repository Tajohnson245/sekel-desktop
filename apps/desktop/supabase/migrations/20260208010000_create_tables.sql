-- Migration: Create core tables for Sekel
-- Tables: decks, note_types, notes, cards, reviews
-- With FSRS spaced repetition fields

---------------------------------------------------------------------
-- DECKS table
-- A deck is a collection of flashcards belonging to a user
---------------------------------------------------------------------
create table public.decks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- index for faster user-based queries
create index decks_user_id_idx on public.decks(user_id);

comment on table public.decks is 'Flashcard decks owned by users';

---------------------------------------------------------------------
-- NOTE_TYPES table
-- Defines the structure of notes (e.g., Basic, Cloze)
---------------------------------------------------------------------
create table public.note_types (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    -- fields: array of field definitions, e.g., [{"name": "Front"}, {"name": "Back"}]
    fields jsonb not null default '[]'::jsonb,
    -- card_templates: how cards are generated from notes
    -- e.g., [{"name": "Card 1", "front_template": "{{Front}}", "back_template": "{{Back}}"}]
    card_templates jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index note_types_user_id_idx on public.note_types(user_id);

comment on table public.note_types is 'Note type templates defining field structure and card generation';

---------------------------------------------------------------------
-- NOTES table
-- A note contains the source content that generates one or more cards
---------------------------------------------------------------------
create table public.notes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id uuid not null references public.decks(id) on delete cascade,
    note_type_id uuid not null references public.note_types(id) on delete restrict,
    -- fields: key-value pairs of field content, e.g., {"Front": "Question?", "Back": "Answer"}
    fields jsonb not null default '{}'::jsonb,
    tags text[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index notes_user_id_idx on public.notes(user_id);
create index notes_deck_id_idx on public.notes(deck_id);
create index notes_note_type_id_idx on public.notes(note_type_id);

comment on table public.notes is 'Source content for generating flashcards';

---------------------------------------------------------------------
-- CARDS table
-- Cards are generated from notes and track FSRS scheduling state
---------------------------------------------------------------------
create type public.card_state as enum ('new', 'learning', 'review', 'relearning');

create table public.cards (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    note_id uuid not null references public.notes(id) on delete cascade,
    -- template_index: which card template from note_type was used to generate this card
    template_index integer not null default 0,
    
    -- FSRS scheduling state
    state public.card_state not null default 'new',
    due timestamptz not null default now(),
    stability real not null default 0,
    difficulty real not null default 0,
    elapsed_days integer not null default 0,
    scheduled_days integer not null default 0,
    reps integer not null default 0,
    lapses integer not null default 0,
    last_review timestamptz,
    
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    -- ensure unique card per note+template combination
    unique(note_id, template_index)
);

create index cards_user_id_idx on public.cards(user_id);
create index cards_note_id_idx on public.cards(note_id);
create index cards_due_idx on public.cards(due);
create index cards_state_idx on public.cards(state);

comment on table public.cards is 'Flashcards with FSRS spaced repetition scheduling state';

---------------------------------------------------------------------
-- REVIEWS table
-- Logs each review for analytics and FSRS parameter optimization
---------------------------------------------------------------------
create type public.rating as enum ('again', 'hard', 'good', 'easy');

create table public.reviews (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade,
    
    -- review details
    rating public.rating not null,
    review_time timestamptz not null default now(),
    review_duration_ms integer, -- how long user spent on review
    
    -- FSRS state before this review (for analytics/optimization)
    state_before public.card_state not null,
    stability_before real not null,
    difficulty_before real not null,
    
    -- FSRS state after this review
    state_after public.card_state not null,
    stability_after real not null,
    difficulty_after real not null,
    scheduled_days integer not null,
    
    created_at timestamptz not null default now()
);

create index reviews_user_id_idx on public.reviews(user_id);
create index reviews_card_id_idx on public.reviews(card_id);
create index reviews_review_time_idx on public.reviews(review_time);

comment on table public.reviews is 'Review history for FSRS analytics and parameter optimization';

---------------------------------------------------------------------
-- Updated_at trigger function
---------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- apply trigger to all tables with updated_at
create trigger update_decks_updated_at
    before update on public.decks
    for each row execute function public.update_updated_at_column();

create trigger update_note_types_updated_at
    before update on public.note_types
    for each row execute function public.update_updated_at_column();

create trigger update_notes_updated_at
    before update on public.notes
    for each row execute function public.update_updated_at_column();

create trigger update_cards_updated_at
    before update on public.cards
    for each row execute function public.update_updated_at_column();
