/**
 * Parsing for sekel:// auth callbacks. Kept free of React / Supabase imports
 * so it can be unit-tested and shared with the main process.
 */

export const AUTH_CALLBACK_PREFIX = 'sekel://auth/callback';

/** Generous upper bound — a real callback URL is a few hundred characters. */
const MAX_DEEP_LINK_LENGTH = 4096;

/** True when `raw` is a sekel://auth/callback URL we are willing to handle. */
export function isAuthCallbackUrl(raw: unknown): raw is string {
    if (typeof raw !== 'string' || raw.length > MAX_DEEP_LINK_LENGTH) return false;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    return url.protocol === 'sekel:' && url.host === 'auth' && url.pathname === '/callback';
}

export type AuthCallback =
    | { kind: 'code'; code: string }
    | { kind: 'error'; code: string; description: string | null }
    | { kind: 'ignored'; reason: string };

/**
 * Extracts the PKCE `code` (or an error) from an auth callback URL.
 *
 * Implicit-flow links (`#access_token=…&refresh_token=…`) are deliberately
 * NOT honoured: applying tokens from a URL lets any web page that can open a
 * sekel:// link silently sign the user into an account the attacker controls.
 */
export function parseAuthCallback(raw: string): AuthCallback {
    if (!isAuthCallbackUrl(raw)) return { kind: 'ignored', reason: 'not an auth callback URL' };
    const url = new URL(raw);
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    const query = url.searchParams;

    const errorCode = query.get('error_code') ?? query.get('error') ?? hash.get('error_code') ?? hash.get('error');
    if (errorCode) {
        return {
            kind: 'error',
            code: errorCode,
            description: query.get('error_description') ?? hash.get('error_description'),
        };
    }

    const code = query.get('code');
    if (code) return { kind: 'code', code };

    if (hash.has('access_token') || hash.has('refresh_token')) {
        return { kind: 'ignored', reason: 'implicit-flow tokens are not accepted' };
    }
    return { kind: 'ignored', reason: 'no code in callback' };
}
