/**
 * Supabase query functions for decks, notes, cards
 */

import { supabase } from './supabase';
import type {
    Deck, DeckInsert, DeckUpdate,
    Card, CardInsert,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    DeckSession, DeckSessionInsert,
    Review, ReviewInsert,
    SessionAnalytics,
    Rating,
} from './types';

// ─────────────────────────────────────────────────────────────────
// Decks
// ─────────────────────────────────────────────────────────────────

export async function fetchDecks(): Promise<Deck[]> {
    const { data, error } = await supabase
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function fetchDeck(id: string): Promise<Deck | null> {
    const { data, error } = await supabase
        .from('decks')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function createDeck(deck: DeckInsert): Promise<Deck> {
    const { data, error } = await supabase
        .from('decks')
        .insert(deck)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateDeck(id: string, updates: DeckUpdate): Promise<Deck> {
    const { data, error } = await supabase
        .from('decks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteDeck(id: string): Promise<void> {
    const { error } = await supabase
        .from('decks')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function deleteDecks(ids: string[]): Promise<void> {
    const { error } = await supabase
        .from('decks')
        .delete()
        .in('id', ids);

    if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────
// Deck Stats (cards due, new, learning, review counts)
// ─────────────────────────────────────────────────────────────────

export interface DeckStats {
    deckId: string;
    newCount: number;
    learningCount: number;
    reviewCount: number;
    totalCount: number;
}

export async function fetchDeckStats(deckId: string): Promise<DeckStats> {
    const now = new Date().toISOString();

    // Get cards for this deck via notes
    const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('id')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return { deckId, newCount: 0, learningCount: 0, reviewCount: 0, totalCount: 0 };
    }

    const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('state, due')
        .in('note_id', noteIds);

    if (cardsError) throw cardsError;

    const stats: DeckStats = {
        deckId,
        newCount: 0,
        learningCount: 0,
        reviewCount: 0,
        totalCount: cards?.length ?? 0,
    };

    for (const card of cards ?? []) {
        if (card.state === 'new') {
            stats.newCount++;
        } else if (card.state === 'learning' || card.state === 'relearning') {
            stats.learningCount++;
        } else if (card.state === 'review' && new Date(card.due) <= new Date(now)) {
            stats.reviewCount++;
        }
    }

    return stats;
}

/**
 * Count all cards due for review across every deck owned by the user.
 * Mirrors the same due logic as fetchDeckStats but operates globally.
 */
export async function fetchAllDueCardsCount(userId: string): Promise<number> {
    const now = new Date().toISOString();

    // Get all deck IDs for this user
    const { data: decks, error: decksError } = await supabase
        .from('decks')
        .select('id')
        .eq('user_id', userId);

    if (decksError) throw decksError;
    if (!decks || decks.length === 0) return 0;

    const deckIds = decks.map((d) => d.id);

    // Get all note IDs across those decks
    const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('id')
        .in('deck_id', deckIds);

    if (notesError) throw notesError;
    if (!notes || notes.length === 0) return 0;

    const noteIds = notes.map((n) => n.id);

    const { count, error: cardsError } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .in('note_id', noteIds)
        .or(`state.eq.new,state.eq.learning,state.eq.relearning,and(state.eq.review,due.lte.${now})`);

    if (cardsError) throw cardsError;
    return count ?? 0;
}

/**
 * Compute retention rate (%) for the user over the last `days` days.
 * Retention = non-Again reviews / total reviews * 100.
 * Returns null when the user has no reviews in the window.
 */
export async function fetchGlobalRetention(
    userId: string,
    days = 30,
): Promise<number | null> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
        .from('reviews')
        .select('rating')
        .eq('user_id', userId)
        .gte('review_time', since.toISOString());

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const nonAgain = data.filter((r) => r.rating !== 'again').length;
    return Math.round((nonAgain / data.length) * 100);
}

// ─────────────────────────────────────────────────────────────────
// Cards due for study
// ─────────────────────────────────────────────────────────────────

export interface CardWithNote extends Card {
    note: Note & { note_type: NoteType };
}

export async function fetchDueCards(deckId: string, limit = 50): Promise<CardWithNote[]> {
    const now = new Date().toISOString();

    // Get notes in this deck
    const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('id, fields, tags, note_type:note_types(*)')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return [];
    }

    // Get due cards
    const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .in('note_id', noteIds)
        .or(`state.eq.new,state.eq.learning,state.eq.relearning,and(state.eq.review,due.lte.${now})`)
        .order('due', { ascending: true })
        .limit(limit);

    if (cardsError) throw cardsError;

    // Join cards with notes
    const noteMap = new Map(notes?.map(n => [n.id, n]));

    return (cards ?? []).map(card => ({
        ...card,
        note: noteMap.get(card.note_id) as unknown as Note & { note_type: NoteType },
    }));
}

/**
 * Fetch all cards in a deck for study (Cram Mode)
 */
export async function fetchAllCardsForStudy(deckId: string, limit = 50): Promise<CardWithNote[]> {
    // Get notes in this deck
    const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('id, fields, tags, note_type:note_types(*)')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return [];
    }

    // Get all cards (ordered by last review or oldest due)
    const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .in('note_id', noteIds)
        .order('last_review', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (cardsError) throw cardsError;

    // Join cards with notes
    const noteMap = new Map(notes?.map(n => [n.id, n]));

    return (cards ?? []).map(card => ({
        ...card,
        note: noteMap.get(card.note_id) as unknown as Note & { note_type: NoteType },
    }));
}

// ─────────────────────────────────────────────────────────────────
// Update card after review
// ─────────────────────────────────────────────────────────────────

export async function updateCardAfterReview(
    cardId: string,
    updates: Partial<Card>
): Promise<Card> {
    const { data, error } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─────────────────────────────────────────────────────────────────
// Notes
// ─────────────────────────────────────────────────────────────────

export async function fetchNotesByDeck(deckId: string): Promise<Note[]> {
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function createNote(note: NoteInsert): Promise<Note> {
    const { data, error } = await supabase
        .from('notes')
        .insert(note)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateNote(id: string, updates: NoteUpdate): Promise<Note> {
    const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteNote(id: string): Promise<void> {
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────
// Cards (creation)
// ─────────────────────────────────────────────────────────────────

export async function createCard(card: CardInsert): Promise<Card> {
    const { data, error } = await supabase
        .from('cards')
        .insert(card)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function fetchCardsByNote(noteId: string): Promise<Card[]> {
    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('note_id', noteId);

    if (error) throw error;
    return data ?? [];
}

// ─────────────────────────────────────────────────────────────────
// Note Types
// ─────────────────────────────────────────────────────────────────

export async function fetchNoteTypes(userId: string): Promise<NoteType[]> {
    const { data, error } = await supabase
        .from('note_types')
        .select('*')
        .eq('user_id', userId);

    if (error) throw error;
    return data ?? [];
}

export async function createNoteType(noteType: NoteTypeInsert): Promise<NoteType> {
    const { data, error } = await supabase
        .from('note_types')
        .insert(noteType)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─────────────────────────────────────────────────────────────────
// Deck Sessions (for post-session analytics)
// ─────────────────────────────────────────────────────────────────

export async function createDeckSession(userId: string, deckId: string): Promise<DeckSession> {
    const insert: DeckSessionInsert = {
        user_id: userId,
        deck_id: deckId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
        .from('deck_sessions')
        .insert(insert)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function completeDeckSession(sessionId: string): Promise<DeckSession> {
    const { data, error } = await supabase
        .from('deck_sessions')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─────────────────────────────────────────────────────────────────
// Reviews (insert on each rating for analytics)
// ─────────────────────────────────────────────────────────────────

export interface InsertReviewParams {
    user_id: string;
    card_id: string;
    rating: Rating;
    session_id: string;
    deck_id: string;
    review_index: number;
    state_before: Card['state'];
    stability_before: number;
    difficulty_before: number;
    state_after: Card['state'];
    stability_after: number;
    difficulty_after: number;
    scheduled_days: number;
    review_duration_ms?: number | null;
}

export async function insertReview(params: InsertReviewParams): Promise<Review> {
    const { data, error } = await supabase
        .from('reviews')
        .insert({
            user_id: params.user_id,
            card_id: params.card_id,
            rating: params.rating,
            review_time: new Date().toISOString(),
            review_duration_ms: params.review_duration_ms ?? null,
            state_before: params.state_before,
            stability_before: params.stability_before,
            difficulty_before: params.difficulty_before,
            state_after: params.state_after,
            stability_after: params.stability_after,
            difficulty_after: params.difficulty_after,
            scheduled_days: params.scheduled_days,
            session_id: params.session_id,
            deck_id: params.deck_id,
            review_index: params.review_index,
        } as ReviewInsert)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─────────────────────────────────────────────────────────────────
// Session Analytics (gated by session status)
// ─────────────────────────────────────────────────────────────────

export async function fetchSessionAnalytics(sessionId: string): Promise<SessionAnalytics | null> {
    const { data: session } = await supabase
        .from('deck_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

    if (!session || session.status !== 'completed') return null;

    const { data: reviews } = await supabase
        .from('reviews')
        .select('id, card_id, rating, review_index')
        .eq('session_id', sessionId)
        .order('review_index', { ascending: true });

    if (!reviews || reviews.length === 0) {
        return {
            retentionTrend: [],
            ratingDistribution: [],
            lapseStats: {
                lapseCount: 0,
                lapseRate: 0,
                totalReviews: 0,
                topForgottenCards: [],
            },
        };
    }

    const totalReviews = reviews.length;
    const againCount = reviews.filter((r) => r.rating === 'again').length;

    // Chart 1: Retention trend (cumulative)
    const retentionTrend: SessionAnalytics['retentionTrend'] = [];
    let correctSoFar = 0;
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        if (r.rating === 'good' || r.rating === 'easy' || r.rating === 'hard') {
            correctSoFar++;
        }
        retentionTrend.push({
            reviewIndex: i + 1,
            retentionRate: Math.round((correctSoFar / (i + 1)) * 1000) / 1000,
        });
    }

    // Chart 2: Rating distribution
    const ratingOrder: Rating[] = ['again', 'hard', 'good', 'easy'];
    const ratingDistribution: SessionAnalytics['ratingDistribution'] = ratingOrder.map((rating) => {
        const count = reviews.filter((r) => r.rating === rating).length;
        const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
        return { rating, count, percent };
    });

    // Chart 3: Lapse stats + top 5 forgotten cards
    const cardAgainCounts = new Map<string, number>();
    for (const r of reviews) {
        if (r.rating === 'again') {
            cardAgainCounts.set(r.card_id, (cardAgainCounts.get(r.card_id) ?? 0) + 1);
        }
    }
    const topCardIds = [...cardAgainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cardId]) => cardId);

    const topForgottenCards: SessionAnalytics['lapseStats']['topForgottenCards'] = topCardIds.map((cardId) => ({
        cardId,
        lapseCount: cardAgainCounts.get(cardId) ?? 0,
    }));

    if (topCardIds.length > 0) {
        const { data: cardsWithNotes } = await supabase
            .from('cards')
            .select('id, note:notes(fields, note_type:note_types(card_templates))')
            .in('id', topCardIds);

        if (cardsWithNotes) {
            const cardMap = new Map<string, (typeof cardsWithNotes)[0]>(
                cardsWithNotes.map((c) => [c.id, c])
            );
            for (const item of topForgottenCards) {
                const row = cardMap.get(item.cardId);
                const note = row?.note;
                const fields = note && typeof note === 'object' && !Array.isArray(note) ? (note as { fields?: Record<string, string> }).fields : undefined;
                if (fields && typeof fields === 'object') {
                    const preview = fields.Front ?? fields.front ?? Object.values(fields)[0] ?? '';
                    item.frontPreview = String(preview).replace(/\s+/g, ' ').trim().slice(0, 60);
                }
            }
        }
    }

    return {
        retentionTrend,
        ratingDistribution,
        lapseStats: {
            lapseCount: againCount,
            lapseRate: totalReviews > 0 ? (againCount / totalReviews) * 100 : 0,
            totalReviews,
            topForgottenCards,
        },
    };
}

// ─────────────────────────────────────────────────────────────────
// Review History (for dashboard heatmap)
// ─────────────────────────────────────────────────────────────────

export interface ReviewDayCount {
    date: string;   // YYYY-MM-DD
    count: number;
}

/**
 * Fetch aggregated review counts per day for the given user.
 * Returns the last `days` days of history (default 365).
 */
export async function fetchUserReviewHistory(
    userId: string,
    days = 365,
): Promise<ReviewDayCount[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
        .from('reviews')
        .select('review_time')
        .eq('user_id', userId)
        .gte('review_time', since.toISOString())
        .order('review_time', { ascending: true });

    if (error) throw error;

    // Aggregate client-side by date string
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
        const dateKey = row.review_time.slice(0, 10); // YYYY-MM-DD
        counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

// Helper: Create a note with its card(s)
export async function createNoteWithCards(
    note: NoteInsert,
    templateCount: number = 1
): Promise<{ note: Note; cards: Card[] }> {
    // Create the note
    const createdNote = await createNote(note);

    // Create cards for each template
    const cards: Card[] = [];
    for (let i = 0; i < templateCount; i++) {
        const card = await createCard({
            user_id: note.user_id,
            note_id: createdNote.id,
            template_index: i,
            state: 'new',
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            last_review: null,
        });
        cards.push(card);
    }

    return { note: createdNote, cards };
}

