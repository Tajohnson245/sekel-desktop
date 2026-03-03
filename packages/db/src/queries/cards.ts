import type { SupabaseClient } from '@supabase/supabase-js';
import type { Card, CardInsert, Note, NoteType } from '../types';

export interface CardWithNote extends Card {
    note: Note & { note_type: NoteType };
}

export async function fetchDueCards(client: SupabaseClient, deckId: string, limit = 50): Promise<CardWithNote[]> {
    const now = new Date().toISOString();

    // Get notes in this deck
    const { data: notes, error: notesError } = await client
        .from('notes')
        .select('id, fields, tags, note_type:note_types(*)')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return [];
    }

    // Get due cards
    const { data: cards, error: cardsError } = await client
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
export async function fetchAllCardsForStudy(client: SupabaseClient, deckId: string, limit = 50): Promise<CardWithNote[]> {
    // Get notes in this deck
    const { data: notes, error: notesError } = await client
        .from('notes')
        .select('id, fields, tags, note_type:note_types(*)')
        .eq('deck_id', deckId);

    if (notesError) throw notesError;

    const noteIds = notes?.map(n => n.id) ?? [];

    if (noteIds.length === 0) {
        return [];
    }

    // Get all cards (ordered by last review or oldest due)
    const { data: cards, error: cardsError } = await client
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

export async function updateCardAfterReview(
    client: SupabaseClient,
    cardId: string,
    updates: Partial<Card>
): Promise<Card> {
    const { data, error } = await client
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function createCard(client: SupabaseClient, card: CardInsert): Promise<Card> {
    const { data, error } = await client
        .from('cards')
        .insert(card)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function fetchCardsByNote(client: SupabaseClient, noteId: string): Promise<Card[]> {
    const { data, error } = await client
        .from('cards')
        .select('*')
        .eq('note_id', noteId);

    if (error) throw error;
    return data ?? [];
}
