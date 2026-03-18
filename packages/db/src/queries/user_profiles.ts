import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

export async function fetchUserProfile(
    client: SupabaseClient,
    userId: string,
): Promise<UserProfile | null> {
    const { data, error } = await client
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
    }
    return data as UserProfile;
}

export async function upsertUserProfile(
    client: SupabaseClient,
    userId: string,
    updates: Partial<UserProfile>,
): Promise<UserProfile> {
    const { data, error } = await client
        .from('user_profiles')
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return data as UserProfile;
}
