import type { SupabaseClient } from '@supabase/supabase-js';
import type { Feedback, FeedbackInsert } from '../types';

export async function insertFeedback(
    client: SupabaseClient,
    feedback: FeedbackInsert,
): Promise<Feedback> {
    const { data, error } = await client
        .from('feedback')
        .insert(feedback)
        .select()
        .single();
    if (error) throw error;
    return data as Feedback;
}

export async function fetchAllFeedback(
    client: SupabaseClient,
): Promise<Feedback[]> {
    const { data, error } = await client
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Feedback[];
}
