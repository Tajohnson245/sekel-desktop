import type { SupabaseClient } from '@supabase/supabase-js';
import type { Review, ReviewInsert, Rating, Card } from '../types';

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

export interface ReviewDayCount {
    date: string;   // YYYY-MM-DD
    count: number;
}

export async function insertReview(client: SupabaseClient, params: InsertReviewParams): Promise<Review> {
    const { data, error } = await client
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

/**
 * Fetch aggregated review counts per day for the given user.
 * Returns the last `days` days of history (default 365).
 */
export async function fetchUserReviewHistory(
    client: SupabaseClient,
    userId: string,
    days = 365,
): Promise<ReviewDayCount[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await client
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
