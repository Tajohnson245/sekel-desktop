-- Migration: Restore accidentally dropped columns and policies
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS fsrs_enabled boolean DEFAULT true;
