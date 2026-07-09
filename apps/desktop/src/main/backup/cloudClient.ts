/**
 * Builds a Supabase client authenticated as the signed-in user, from the
 * session the renderer pushed to main. RLS then scopes every Storage and table
 * operation to that user's own data.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as state from './cloudState';
import type { CloudBackupSession } from './cloudTypes';

/**
 * setSession refreshes the access token when it has expired; any rotated tokens
 * are persisted back to the in-memory session so the next call (including a
 * snapshot fired at quit) stays valid.
 */
export async function getAuthedClient(session: CloudBackupSession): Promise<SupabaseClient> {
    const url = process.env.VITE_SUPABASE_PROJECT_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Supabase config missing in main process');

    const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
    });
    if (error) throw new Error(`Auth setSession failed: ${error.message}`);

    if (data.session) {
        state.setSession({
            userId: session.userId,
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresAt: data.session.expires_at,
        });
    }
    return client;
}
