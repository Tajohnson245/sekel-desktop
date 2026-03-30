import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckSession, DeckSessionInsert, SessionAnalytics, Rating } from '../types';

export async function createDeckSession(client: SupabaseClient, userId: string, deckId: string): Promise<DeckSession> {
    const insert: DeckSessionInsert = {
        user_id: userId,
        deck_id: deckId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
    };
    const { data, error } = await client
        .from('deck_sessions')
        .insert(insert)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function completeDeckSession(client: SupabaseClient, sessionId: string): Promise<DeckSession> {
    const { data, error } = await client
        .from('deck_sessions')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function fetchSessionAnalytics(client: SupabaseClient, sessionId: string): Promise<SessionAnalytics | null> {
    const { data: session } = await client
        .from('deck_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

    if (!session || session.status !== 'completed') return null;

    const { data: reviews } = await client
        .from('reviews')
        .select('id, card_id, rating, review_index')
        .eq('session_id', sessionId)
        .order('review_index', { ascending: true });

    if (!reviews || reviews.length === 0) {
        return {
            retentionTrend: [],
            ratingDistribution: [],
            lapseStats: {
                lapseCount: 0,
                lapseRate: 0,
                totalReviews: 0,
                topForgottenCards: [],
                missedCardIds: [],
            },
        };
    }

    const totalReviews = reviews.length;
    const againCount = reviews.filter((r) => r.rating === 'again').length;

    // Chart 1: Retention trend (cumulative)
    const retentionTrend: SessionAnalytics['retentionTrend'] = [];
    let correctSoFar = 0;
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        if (r.rating === 'good' || r.rating === 'easy' || r.rating === 'hard') {
            correctSoFar++;
        }
        retentionTrend.push({
            reviewIndex: i + 1,
            retentionRate: Math.round((correctSoFar / (i + 1)) * 1000) / 1000,
        });
    }

    // Chart 2: Rating distribution
    const ratingOrder: Rating[] = ['again', 'hard', 'good', 'easy'];
    const ratingDistribution: SessionAnalytics['ratingDistribution'] = ratingOrder.map((rating) => {
        const count = reviews.filter((r) => r.rating === rating).length;
        const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
        return { rating, count, percent };
    });

    // Chart 3: Lapse stats + top 5 forgotten cards
    const cardAgainCounts = new Map<string, number>();
    for (const r of reviews) {
        if (r.rating === 'again') {
            cardAgainCounts.set(r.card_id, (cardAgainCounts.get(r.card_id) ?? 0) + 1);
        }
    }
    const topCardIds = [...cardAgainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cardId]) => cardId);

    const topForgottenCards: SessionAnalytics['lapseStats']['topForgottenCards'] = topCardIds.map((cardId) => ({
        cardId,
        lapseCount: cardAgainCounts.get(cardId) ?? 0,
    }));

    if (topCardIds.length > 0) {
        const { data: cardsWithNotes } = await client
            .from('cards')
            .select('id, note:notes(fields, note_type:note_types(card_templates))')
            .in('id', topCardIds);

        if (cardsWithNotes) {
            const cardMap = new Map<string, (typeof cardsWithNotes)[0]>(
                cardsWithNotes.map((c) => [c.id, c])
            );
            for (const item of topForgottenCards) {
                const row = cardMap.get(item.cardId);
                const note = row?.note;
                const fields = note && typeof note === 'object' && !Array.isArray(note) ? (note as { fields?: Record<string, string> }).fields : undefined;
                if (fields && typeof fields === 'object') {
                    const preview = fields.Front ?? fields.front ?? Object.values(fields)[0] ?? '';
                    item.frontPreview = String(preview).replace(/\s+/g, ' ').trim().slice(0, 60);
                }
            }
        }
    }

    return {
        retentionTrend,
        ratingDistribution,
        lapseStats: {
            lapseCount: againCount,
            lapseRate: totalReviews > 0 ? (againCount / totalReviews) * 100 : 0,
            totalReviews,
            topForgottenCards,
            missedCardIds: [...cardAgainCounts.keys()],
        },
    };
}
