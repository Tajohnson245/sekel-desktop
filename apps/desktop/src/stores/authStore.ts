import * as Sentry from '@sentry/electron/renderer';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { deleteAccountViaEdgeFunction } from '../lib/accountDeletion';
import { Session, User } from '@supabase/supabase-js';
import {
    getSession,
    onAuthStateChange,
    signOut as authSignOut,
    updatePassword as authUpdatePassword,
} from '@sekel/db';

function syncSentryUser(user: User | null) {
    if (user) {
        Sentry.setUser({ id: user.id, email: user.email });
    } else {
        Sentry.setUser(null);
    }
}

/**
 * Mirror the Supabase session into the main process so it can perform
 * RLS-scoped cloud-backup writes as the user (incl. a final snapshot at quit).
 * Fires on sign-in, token refresh, and sign-out. Best-effort — never throws
 * into the auth flow.
 */
function syncCloudBackupSession(session: Session | null) {
    const api = window.electronAPI?.cloudBackup;
    if (!api) return;
    const promise = session?.user
        ? api.setSession({
              userId: session.user.id,
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              expiresAt: session.expires_at,
          })
        : api.clearSession();
    void Promise.resolve(promise).catch(() => { /* best effort */ });
}

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    error: string | null;
    /**
     * True after the user clicks a password-recovery email link and lands
     * back in the app via sekel://. While true, the auth boundary renders
     * the reset-password form instead of the dashboard, even though a
     * Supabase session is active. Cleared once the user submits a new
     * password.
     */
    recoveryMode: boolean;
    setUser: (user: User | null) => void;
    setSession: (session: Session | null) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
    setRecoveryMode: (recoveryMode: boolean) => void;
    initialize: () => Promise<void>;
    signOut: () => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
    deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    session: null,
    isLoading: true,
    error: null,
    recoveryMode: false,
    setUser: (user) => set({ user }),
    setSession: (session) => set({ session, user: session?.user ?? null }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setRecoveryMode: (recoveryMode) => set({ recoveryMode }),
    initialize: async () => {
        try {
            set({ isLoading: true });
            const { data: { session } } = await getSession(supabase);
            set({ session, user: session?.user ?? null });
            syncSentryUser(session?.user ?? null);
            syncCloudBackupSession(session);

            onAuthStateChange(supabase, (_event, session) => {
                set({ session, user: session?.user ?? null, isLoading: false });
                syncSentryUser(session?.user ?? null);
                syncCloudBackupSession(session);
            });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
        } finally {
            set({ isLoading: false });
        }
    },
    signOut: async () => {
        try {
            set({ isLoading: true });
            const userId = useAuthStore.getState().user?.id;
            if (userId) {
                await window.electronAPI.db.abandonOpenSessions(userId);
            }
            const { error } = await authSignOut(supabase);
            if (error) throw error;
            set({ session: null, user: null, recoveryMode: false });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
        } finally {
            set({ isLoading: false });
        }
    },
    updatePassword: async (password: string) => {
        set({ isLoading: true, error: null });
        try {
            const { error } = await authUpdatePassword(supabase, password);
            if (error) throw error;
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            throw err;
        } finally {
            set({ isLoading: false });
        }
    },
    deleteAccount: async () => {
        set({ isLoading: true, error: null });
        try {
            // The delete-account edge function removes Storage objects and
            // the auth user. It falls back to the delete_own_account RPC only
            // if the function can't be reached.
            const { error, usedFallback } = await deleteAccountViaEdgeFunction(supabase);
            if (error) throw error;
            if (usedFallback) {
                // The account is gone but Storage objects may be left behind;
                // flag it so they can be cleaned up.
                Sentry.captureMessage('delete-account edge function unreachable; used delete_own_account RPC', {
                    level: 'warning',
                    tags: { feature: 'account-delete' },
                });
            }
            await authSignOut(supabase);
            set({ session: null, user: null });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            throw err;
        } finally {
            set({ isLoading: false });
        }
    },
}));
