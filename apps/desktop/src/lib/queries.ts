/**
 * Client-bound shim — wraps @sekel/db query functions with the local supabase instance
 * so callers don't need to pass a client. No other file needs to change its imports.
 */

import { supabase } from './supabase';
import * as db from '@sekel/db';

// ── Re-export types ────────────────────────────────────────────────
export type {
    DeckStats,
    CardWithNote,
    InsertReviewParams,
    ReviewDayCount,
} from '@sekel/db';

// ── Decks ─────────────────────────────────────────────────────────
export const fetchDecks = () => db.fetchDecks(supabase);
export const fetchDeck = (id: string) => db.fetchDeck(supabase, id);
export const createDeck = (deck: db.DeckInsert) => db.createDeck(supabase, deck);
export const updateDeck = (id: string, updates: db.DeckUpdate) => db.updateDeck(supabase, id, updates);
export const deleteDeck = (id: string) => db.deleteDeck(supabase, id);
export const deleteDecks = (ids: string[]) => db.deleteDecks(supabase, ids);
export const fetchDeckStats = (deckId: string) => db.fetchDeckStats(supabase, deckId);
export const fetchAllDueCardsCount = (userId: string) => db.fetchAllDueCardsCount(supabase, userId);
export const fetchGlobalRetention = (userId: string, days?: number) => db.fetchGlobalRetention(supabase, userId, days);

// ── Cards ─────────────────────────────────────────────────────────
export const fetchDueCards = (deckId: string, limit?: number) => db.fetchDueCards(supabase, deckId, limit);
export const fetchAllCardsForStudy = (deckId: string, limit?: number) => db.fetchAllCardsForStudy(supabase, deckId, limit);
export const updateCardAfterReview = (cardId: string, updates: Partial<db.Card>) => db.updateCardAfterReview(supabase, cardId, updates);
export const createCard = (card: db.CardInsert) => db.createCard(supabase, card);
export const fetchCardsByNote = (noteId: string) => db.fetchCardsByNote(supabase, noteId);

// ── Notes ─────────────────────────────────────────────────────────
export const fetchNotesByDeck = (deckId: string) => db.fetchNotesByDeck(supabase, deckId);
export const createNote = (note: db.NoteInsert) => db.createNote(supabase, note);
export const updateNote = (id: string, updates: db.NoteUpdate) => db.updateNote(supabase, id, updates);
export const deleteNote = (id: string) => db.deleteNote(supabase, id);
export const createNoteWithCards = (note: db.NoteInsert, templateCount?: number) => db.createNoteWithCards(supabase, note, templateCount);

// ── Note Types ────────────────────────────────────────────────────
export const fetchNoteTypes = (userId: string) => db.fetchNoteTypes(supabase, userId);
export const createNoteType = (noteType: db.NoteTypeInsert) => db.createNoteType(supabase, noteType);

// ── Deck Sessions ─────────────────────────────────────────────────
export const createDeckSession = (userId: string, deckId: string) => db.createDeckSession(supabase, userId, deckId);
export const completeDeckSession = (sessionId: string) => db.completeDeckSession(supabase, sessionId);
export const fetchSessionAnalytics = (sessionId: string) => db.fetchSessionAnalytics(supabase, sessionId);

// ── Reviews ───────────────────────────────────────────────────────
export const insertReview = (params: db.InsertReviewParams) => db.insertReview(supabase, params);
export const fetchUserReviewHistory = (userId: string, days?: number) => db.fetchUserReviewHistory(supabase, userId, days);
