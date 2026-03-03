import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftCard, DraftCardInsert } from '../types';

export async function fetchDrafts(client: SupabaseClient): Promise<DraftCard[]> {
    const { data, error } = await client
        .from('card_drafts')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function saveDraft(client: SupabaseClient, draft: DraftCardInsert): Promise<DraftCard> {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await client
        .from('card_drafts')
        .insert({ ...draft, user_id: user.id })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateDraft(
    client: SupabaseClient,
    id: string,
    updates: Partial<Pick<DraftCard, 'front' | 'back'>>
): Promise<DraftCard> {
    const { data, error } = await client
        .from('card_drafts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteDraft(client: SupabaseClient, id: string): Promise<void> {
    const { error } = await client
        .from('card_drafts')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function clearDrafts(client: SupabaseClient): Promise<void> {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await client
        .from('card_drafts')
        .delete()
        .eq('user_id', user.id);

    if (error) throw error;
}
