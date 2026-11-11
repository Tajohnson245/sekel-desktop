import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { parseAuthCallback } from '../lib/deepLink';
import { useAuthStore } from '../stores/authStore';

/**
 * Listens for sekel:// deep links delivered by the main process and
 * completes Supabase auth flows (email confirmation, password reset).
 *
 * The Supabase client uses the PKCE flow, so Supabase redirects to
 * sekel://auth/callback?code=… and we exchange that code for a session.
 * The exchange only succeeds with the code verifier this app stored when the
 * user started the flow (signup / "forgot password"), so a link crafted by a
 * third party cannot switch the signed-in account.
 */
export function useDeepLinkAuth() {
    useEffect(() => {
        const handle = async (url: string) => {
            const callback = parseAuthCallback(url);

            if (callback.kind === 'error') {
                console.error('[deep-link] auth error from Supabase', {
                    errorCode: callback.code,
                    description: callback.description,
                });
                return;
            }
            if (callback.kind === 'ignored') {
                console.warn('[deep-link] ignored:', callback.reason);
                return;
            }

            const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
            if (error) {
                // Typical causes: link opened on another device/install (no
                // stored verifier), link already used, or link expired. The
                // email address is still confirmed by Supabase before the
                // redirect, so the user can simply sign in.
                console.error('[deep-link] code exchange failed', error.message);
                return;
            }

            // onAuthStateChange in authStore picks up the new session and
            // updates the React tree. For password recovery, flag the store so
            // ProtectedRoute renders the reset-password form instead of
            // dropping the user straight into the dashboard.
            // auth-js returns `redirectType` at runtime ('PASSWORD_RECOVERY'
            // when the verifier was stored by resetPasswordForEmail) but its
            // published typings omit it.
            const redirectType = (data as { redirectType?: string | null }).redirectType;
            if (redirectType === 'PASSWORD_RECOVERY') {
                useAuthStore.getState().setRecoveryMode(true);
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
