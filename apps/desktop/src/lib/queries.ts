/**
 * Client-bound shim — wraps window.electronAPI.db IPC calls so callers
 * don't need to import or use IPC directly. No other file needs to change its imports.
 */

import type {
    DeckInsert, DeckUpdate,
    NoteInsert, NoteUpdate,
    NoteTypeInsert,
    CardInsert, Card,
    InsertReviewParams,
} from '@sekel/db';

// ── Re-export types (consumed by hooks and components) ──────────────────────
export type {
    DeckStats,
    CardWithNote,
    InsertReviewParams,
    ReviewDayCount,
    TodaySummary,
    CardCountsByMaturity,
    RetentionByMaturity,
} from '@sekel/db';

const db = () => window.electronAPI.db;

// ── Decks ────────────────────────────────────────────────────────────────────
export const fetchDecks = (userId: string) => db().fetchDecks(userId);
export const fetchDeck = (id: string) => db().fetchDeck(id);
export const createDeck = (deck: DeckInsert) => db().createDeck(deck);
export const updateDeck = (id: string, updates: DeckUpdate) => db().updateDeck(id, updates);
export const deleteDeck = (id: string) => db().deleteDeck(id);
export const deleteDecks = (ids: string[]) => db().deleteDecks(ids);
export const fetchDeckStats = (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => db().fetchDeckStats(deckId, userId, dailyNewLimit, dailyReviewLimit);
export const fetchAllDueCardsCount = (userId: string, dailyNewLimit?: number, dailyReviewLimit?: number) => db().fetchAllDueCardsCount(userId, dailyNewLimit, dailyReviewLimit);
export const fetchGlobalRetention = (userId: string, days?: number) => db().fetchGlobalRetention(userId, days);

// ── Cards ────────────────────────────────────────────────────────────────────
export const fetchDueCards = (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => db().fetchDueCards(deckId, userId, dailyNewLimit, dailyReviewLimit);
export const fetchAllCardsForStudy = (deckId: string, limit?: number) => db().fetchAllCardsForStudy(deckId, limit);
export const fetchAllCardsForDeck = (deckId: string) => db().fetchAllCardsForDeck(deckId);
export const updateCardAfterReview = (cardId: string, updates: Partial<Card>) => db().updateCardAfterReview(cardId, updates);
export const createCard = (card: CardInsert) => db().createCard(card);
export const fetchCardsByNote = (noteId: string) => db().fetchCardsByNote(noteId);

// ── Notes ────────────────────────────────────────────────────────────────────
export const fetchNotesByDeck = (deckId: string) => db().fetchNotesByDeck(deckId);
export const createNote = (note: NoteInsert) => db().createNote(note);
export const updateNote = (id: string, updates: NoteUpdate) => db().updateNote(id, updates);
export const deleteNote = (id: string) => db().deleteNote(id);
export const createNoteWithCards = (note: NoteInsert, templateCount?: number) => db().createNoteWithCards(note, templateCount);

// ── Note Types ───────────────────────────────────────────────────────────────
export const fetchNoteTypes = (userId: string) => db().fetchNoteTypes(userId);
export const createNoteType = (noteType: NoteTypeInsert) => db().createNoteType(noteType);

// ── Deck Sessions ─────────────────────────────────────────────────────────────
export const createDeckSession = (userId: string, deckId: string) => db().createDeckSession(userId, deckId);
export const completeDeckSession = (sessionId: string) => db().completeDeckSession(sessionId);
export const fetchSessionAnalytics = (sessionId: string) => db().fetchSessionAnalytics(sessionId);

// ── Reviews ───────────────────────────────────────────────────────────────────
export const insertReview = (params: InsertReviewParams) => db().insertReview(params);
export const fetchUserReviewHistory = (userId: string, days?: number) => db().fetchUserReviewHistory(userId, days);

// ── Statistics ────────────────────────────────────────────────────────────────
export const fetchTodaySummary = (userId: string) => db().fetchTodaySummary(userId);
export const fetchCardCountsByMaturity = (userId: string, deckId?: string) => db().fetchCardCountsByMaturity(userId, deckId);
export const fetchRetentionByMaturity = (userId: string, days?: number) => db().fetchRetentionByMaturity(userId, days);

// ── Export ────────────────────────────────────────────────────────────────────
export const exportDeck = (deckId: string, userId: string) => db().exportDeck(deckId, userId);
export const getExportableCardCount = (deckId: string) => db().getExportableCardCount(deckId);

// ── Yield ─────────────────────────────────────────────────────────────────────
export type { SessionQueueCard, YieldScoreRow } from '../types/electron';
const yieldApi = () => window.electronAPI.yield;
export const buildSessionQueue = (userId: string, examKey: string, limit?: number) => yieldApi().buildSessionQueue(userId, examKey, limit);
export const getYieldScores = (examKey: string, cardIds?: string[]) => yieldApi().getScores(examKey, cardIds);
export const getYieldExplanation = (cardId: string, examKey: string) => yieldApi().getExplanation(cardId, examKey);

// ── Exam ──────────────────────────────────────────────────────────────────────
export type { BlueprintExam, UserExamProfile } from '../types/electron';
export const EXAM_DATE_SENTINEL = '9999-12-31';
export const isExamDateSet = (date: string) => date !== EXAM_DATE_SENTINEL;
const examApi = () => window.electronAPI.exam;
export const listExams         = () => examApi().listExams();
export const getExamProfile    = (userId: string) => examApi().getProfile(userId);
export const upsertExamProfile = (userId: string, examId: number, examDate: string | null, sessionMode?: string) =>
    examApi().upsertProfile(userId, examId, examDate, sessionMode);
export const updateExamProfile = (userId: string, updates: { exam_date?: string; session_mode?: string }) =>
    examApi().updateProfile(userId, updates);
export const fetchAllCardIds   = (userId: string) => examApi().fetchAllCardIds(userId);
