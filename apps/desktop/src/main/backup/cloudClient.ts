/**
 * Builds a Supabase client authenticated as the signed-in user, from the
 * session the renderer pushed to main. RLS then scopes every Storage and table
 * operation to that user's own data.
 *
 * The client only *uses* the access token (sent as a bearer header); it never
 * calls setSession/refreshSession. Refreshing in main rotated the refresh token
 * without telling the renderer, whose next refresh then presented a revoked
 * token — Supabase's reuse detection could kill the session and log the user
 * out at random. The renderer owns refresh and re-pushes the session on every
 * TOKEN_REFRESHED, so main just waits for a fresh token when this one expires.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CloudBackupSession } from './cloudTypes';

/** Seconds of headroom so a token doesn't expire mid-upload. */
const EXPIRY_SKEW_S = 60;

/** False when the access token is known to be expired (or about to be). */
export function isSessionUsable(session: CloudBackupSession, nowMs: number): boolean {
    if (!session.accessToken) return false;
    if (session.expiresAt == null) return true; // unknown expiry — let the server decide
    return session.expiresAt - EXPIRY_SKEW_S > nowMs / 1000;
}

export function getAuthedClient(session: CloudBackupSession): SupabaseClient {
    const url = process.env.VITE_SUPABASE_PROJECT_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error('Supabase config missing in main process');

    return createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    });
}
