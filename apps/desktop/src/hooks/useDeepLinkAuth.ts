import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Listens for sekel:// deep links delivered by the main process and
 * completes Supabase auth flows (email confirmation, password reset,
 * magic links) by extracting the access/refresh tokens from the URL
 * hash and calling supabase.auth.setSession().
 *
 * Supabase redirects to: sekel://auth/callback#access_token=...&refresh_token=...&type=signup
 * The OS opens us with that URL, main forwards it via IPC, this hook
 * applies it.
 */
export function useDeepLinkAuth() {
    useEffect(() => {
        const handle = async (url: string) => {
            try {
                const parsed = new URL(url);
                // Hash starts with '#'; URLSearchParams understands '?'-style
                // pairs so strip the leading '#'.
                const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
                const params = new URLSearchParams(hash);

                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                const errorCode = params.get('error') ?? params.get('error_code');

                if (errorCode) {
                    console.error('[deep-link] auth error from Supabase', {
                        errorCode,
                        description: params.get('error_description'),
                    });
                    return;
                }

                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                    if (error) {
                        console.error('[deep-link] setSession failed', error);
                    }
                    // onAuthStateChange in authStore picks up the new session
                    // and updates the React tree; no further action needed.
                }
            } catch (err) {
                console.error('[deep-link] failed to parse', url, err);
            }
        };

        // Cold-start: app was launched by clicking the email link.
        window.electronAPI.deepLink.getInitial().then((url) => {
            if (url) handle(url);
        });

        // Runtime: app was already open when the link was clicked.
        const unsubscribe = window.electronAPI.deepLink.on(handle);
        return unsubscribe;
    }, []);
}
