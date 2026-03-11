import type { SupabaseClient } from '@supabase/supabase-js';
import type { NoteType, NoteTypeInsert } from '../types';

export async function fetchNoteTypes(client: SupabaseClient, userId: string): Promise<NoteType[]> {
    const { data, error } = await client
        .from('note_types')
        .select('*')
        .eq('user_id', userId);

    if (error) throw error;
    return data ?? [];
}

export async function createNoteType(client: SupabaseClient, noteType: NoteTypeInsert): Promise<NoteType> {
    const { data, error } = await client
        .from('note_types')
        .insert(noteType)
        .select()
        .single();

    if (error) throw error;
    return data;
}
