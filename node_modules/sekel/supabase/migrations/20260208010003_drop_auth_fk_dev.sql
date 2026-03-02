-- Migration: Drop auth.users foreign key constraints for development
-- This allows using mock user IDs without Supabase Auth
-- TODO: Re-add constraints when auth is implemented

ALTER TABLE public.decks DROP CONSTRAINT IF EXISTS decks_user_id_fkey;
ALTER TABLE public.note_types DROP CONSTRAINT IF EXISTS note_types_user_id_fkey;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_user_id_fkey;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_user_id_fkey;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_user_id_fkey;
