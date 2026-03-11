import type { SupabaseClient } from '@supabase/supabase-js';
import type { Deck, DeckInsert, DeckUpdate, Rating } from '../types';

export interface DeckStats {
    deckId: string;
    newCount: number;
    learningCount: number;
    reviewCount: number;
    totalCount: number;
}

export async function fetchDecks(client: SupabaseClient): Promise<Deck[]> {
    const { data, error } = await client
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function fetchDeck(client: SupabaseClient, id: string): Promise<Deck | null> {
    const { data, error } = await client
        .from('decks')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function createDeck(client: SupabaseClient, deck: DeckInsert): Promise<Deck> {
    const { data, error } = await client
        .from('decks')
        .insert(deck)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateDeck(client: SupabaseClient, id: string, updates: DeckUpdate): Promise<Deck> {
    const { data, error } = await client
        .from('decks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteDeck(client: SupabaseClient, id: string): Promise<void> {
    const { error } = await client
        .from('decks')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function deleteDecks(client: SupabaseClient, ids: string[]): Promise<void> {
    const { error } = await client
        .from('decks')
        .delete()
        .in('id', ids);

    if (error) throw error;
}

export async function fetchDeckStats(client: SupabaseClient, deckId: string): Promise<DeckStats> {
    const now = new Date().toISOString();

    // Get cards for this deck via notes
    const { data: notes, error: notesError } = await client
        .from('notes')
        .select('id')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return { deckId, newCount: 0, learningCount: 0, reviewCount: 0, totalCount: 0 };
    }

    const { data: cards, error: cardsError } = await client
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
export async function fetchAllDueCardsCount(client: SupabaseClient, userId: string): Promise<number> {
    const now = new Date().toISOString();

    // Get all deck IDs for this user
    const { data: decks, error: decksError } = await client
        .from('decks')
        .select('id')
        .eq('user_id', userId);

    if (decksError) throw decksError;
    if (!decks || decks.length === 0) return 0;

    const deckIds = decks.map((d) => d.id);

    // Get all note IDs across those decks
    const { data: notes, error: notesError } = await client
        .from('notes')
        .select('id')
        .in('deck_id', deckIds);

    if (notesError) throw notesError;
    if (!notes || notes.length === 0) return 0;

    const noteIds = notes.map((n) => n.id);

    const { count, error: cardsError } = await client
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
    client: SupabaseClient,
    userId: string,
    days = 30,
): Promise<number | null> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await client
        .from('reviews')
        .select('rating')
        .eq('user_id', userId)
        .gte('review_time', since.toISOString());

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const nonAgain = data.filter((r) => (r.rating as Rating) !== 'again').length;
    return Math.round((nonAgain / data.length) * 100);
}
