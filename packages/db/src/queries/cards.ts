import type { SupabaseClient } from '@supabase/supabase-js';
import type { Card, CardInsert, Note, NoteType } from '../types';

// The joined note shape returned by the select query (only the columns we fetch)
export interface JoinedNote {
    id: string;
    fields: Note['fields'];
    tags: Note['tags'];
    note_type: NoteType;
}

export interface CardWithNote extends Card {
    note: JoinedNote;
}

async function fetchNotesForDeck(client: SupabaseClient, deckId: string): Promise<JoinedNote[]> {
    const { data, error } = await client
        .from('notes')
        .select('id, fields, tags, note_type:note_types(*)') as unknown as { data: JoinedNote[] | null; error: Error | null };

    if (error) throw error;
    return data ?? [];
}

function joinCardsWithNotes(cards: Card[], notes: JoinedNote[]): CardWithNote[] {
    const noteMap = new Map(notes.map(n => [n.id, n]));
    return cards.map(card => ({
        ...card,
        note: noteMap.get(card.note_id)!,
    }));
}

export async function fetchDueCards(client: SupabaseClient, deckId: string, limit = 50): Promise<CardWithNote[]> {
    const now = new Date().toISOString();
    const notes = await fetchNotesForDeck(client, deckId);
    const noteIds = notes.map(n => n.id);
    if (noteIds.length === 0) return [];

    const { data: cards, error } = await client
        .from('cards')
        .select('*')
        .in('note_id', noteIds)
        .or(`state.eq.new,state.eq.learning,state.eq.relearning,and(state.eq.review,due.lte.${now})`)
        .order('due', { ascending: true })
        .limit(limit);

    if (error) throw error;
    return joinCardsWithNotes(cards ?? [], notes);
}

export async function fetchAllCardsForStudy(client: SupabaseClient, deckId: string, limit = 50): Promise<CardWithNote[]> {
    const notes = await fetchNotesForDeck(client, deckId);
    const noteIds = notes.map(n => n.id);
    if (noteIds.length === 0) return [];

    const { data: cards, error } = await client
        .from('cards')
        .select('*')
        .in('note_id', noteIds)
        .order('last_review', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (error) throw error;
    return joinCardsWithNotes(cards ?? [], notes);
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
