import type { SupabaseClient } from '@supabase/supabase-js';
import type { Note, NoteInsert, NoteUpdate, Card } from '../types';
import { createCard } from './cards';

export async function fetchNotesByDeck(client: SupabaseClient, deckId: string): Promise<Note[]> {
    const { data, error } = await client
        .from('notes')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function createNote(client: SupabaseClient, note: NoteInsert): Promise<Note> {
    const { data, error } = await client
        .from('notes')
        .insert(note)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateNote(client: SupabaseClient, id: string, updates: NoteUpdate): Promise<Note> {
    const { data, error } = await client
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteNote(client: SupabaseClient, id: string): Promise<void> {
    const { error } = await client
        .from('notes')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Helper: Create a note with its card(s)
export async function createNoteWithCards(
    client: SupabaseClient,
    note: NoteInsert,
    templateCount: number = 1
): Promise<{ note: Note; cards: Card[] }> {
    // Create the note
    const createdNote = await createNote(client, note);

    // Create cards for each template
    const cards: Card[] = [];
    for (let i = 0; i < templateCount; i++) {
        const card = await createCard(client, {
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
