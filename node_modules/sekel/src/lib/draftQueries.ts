/**
 * Supabase query functions for card_drafts table
 */

import { supabase } from './supabase';
import type { DraftCard, DraftCardInsert } from './types';

export async function fetchDrafts(): Promise<DraftCard[]> {
    const { data, error } = await supabase
        .from('card_drafts')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function saveDraft(draft: DraftCardInsert): Promise<DraftCard> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('card_drafts')
        .insert({ ...draft, user_id: user.id })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateDraft(
    id: string,
    updates: Partial<Pick<DraftCard, 'front' | 'back'>>
): Promise<DraftCard> {
    const { data, error } = await supabase
        .from('card_drafts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteDraft(id: string): Promise<void> {
    const { error } = await supabase
        .from('card_drafts')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function clearDrafts(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('card_drafts')
        .delete()
        .eq('user_id', user.id);

    if (error) throw error;
}
