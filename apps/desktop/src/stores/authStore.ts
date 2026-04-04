import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import {
    getSession,
    onAuthStateChange,
    signOut as authSignOut,
    updatePassword as authUpdatePassword,
    deleteAccount as authDeleteAccount,
} from '@sekel/db';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    error: string | null;
    setUser: (user: User | null) => void;
    setSession: (session: Session | null) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
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
    setUser: (user) => set({ user }),
    setSession: (session) => set({ session, user: session?.user ?? null }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    initialize: async () => {
        try {
            set({ isLoading: true });
            const { data: { session } } = await getSession(supabase);
            set({ session, user: session?.user ?? null });

            onAuthStateChange(supabase, (_event, session) => {
                set({ session, user: session?.user ?? null, isLoading: false });
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
            set({ session: null, user: null });
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
            const { error } = await authDeleteAccount(supabase);
            if (error) throw error;
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
