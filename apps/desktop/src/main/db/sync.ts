import { createClient } from '@supabase/supabase-js';
import { getSyncMetadata, bulkUpsertAll } from './service';
import type { UserProfile, NoteType, Deck, Note, Card, Review, DeckSession, DraftCard } from '@sekel/db';

export function isFirstRun(userId: string): boolean {
    const storedUserId = getSyncMetadata('user_id');
    const lastSync = getSyncMetadata('last_sync_at');
    // First run if: never synced, or a different user is stored
    return storedUserId !== userId || lastSync === null;
}

export async function pullFromSupabase(
    supabaseUrl: string,
    supabaseKey: string,
    userId: string,
    accessToken: string,
): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false },
    });

    console.log(`[Sync] Pulling all data for user ${userId}...`);

    // Fetch all tables in parallel
    const [
        profilesRes,
        noteTypesRes,
        decksRes,
        notesRes,
        cardsRes,
        reviewsRes,
        sessionsRes,
        draftsRes,
    ] = await Promise.all([
        client.from('user_profiles').select('*').eq('id', userId),
        client.from('note_types').select('*').eq('user_id', userId),
        client.from('decks').select('*').eq('user_id', userId),
        client.from('notes').select('*').eq('user_id', userId),
        client.from('cards').select('*').eq('user_id', userId),
        client.from('reviews').select('*').eq('user_id', userId),
        client.from('deck_sessions').select('*').eq('user_id', userId),
        client.from('card_drafts').select('*').eq('user_id', userId),
    ]);

    // Log any errors but don't abort — partial data is better than nothing
    for (const [name, res] of [
        ['user_profiles', profilesRes],
        ['note_types', noteTypesRes],
        ['decks', decksRes],
        ['notes', notesRes],
        ['cards', cardsRes],
        ['reviews', reviewsRes],
        ['deck_sessions', sessionsRes],
        ['card_drafts', draftsRes],
    ] as const) {
        if ((res as { error: unknown }).error) {
            console.warn(`[Sync] Error fetching ${name}:`, (res as { error: { message: string } }).error?.message);
        }
    }

    // Write atomically to SQLite
    bulkUpsertAll(
        {
            profiles: (profilesRes.data ?? []) as UserProfile[],
            noteTypes: (noteTypesRes.data ?? []) as NoteType[],
            decks: (decksRes.data ?? []) as Deck[],
            notes: (notesRes.data ?? []) as Note[],
            cards: (cardsRes.data ?? []) as Card[],
            reviews: (reviewsRes.data ?? []) as Review[],
            sessions: (sessionsRes.data ?? []) as DeckSession[],
            drafts: (draftsRes.data ?? []) as DraftCard[],
        },
        userId,
    );

    console.log(`[Sync] Pull complete for user ${userId}`);
}
