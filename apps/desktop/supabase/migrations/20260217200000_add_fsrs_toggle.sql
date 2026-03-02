-- Migration: Add fsrs_enabled toggle to decks
ALTER TABLE public.decks ADD COLUMN fsrs_enabled boolean DEFAULT true;
