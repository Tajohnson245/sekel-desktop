import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '@sekel/db';

export type { UserProfile };

interface ProfileState {
    profile: UserProfile | null;
    isLoading: boolean;
    error: string | null;
    fetchProfile: (userId: string) => Promise<void>;
    updateProfile: (userId: string, updates: Partial<UserProfile>) => Promise<void>;
    upsertProfile: (userId: string, updates: Partial<UserProfile>) => Promise<void>;
    uploadAvatar: (userId: string, file: File) => Promise<string | null>;
}

export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    isLoading: false,
    error: null,

    fetchProfile: async (userId: string) => {
        set({ isLoading: true, error: null });
        try {
            const data = await window.electronAPI.db.fetchProfile(userId);
            set({ profile: data as UserProfile | null });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
        } finally {
            set({ isLoading: false });
        }
    },

    updateProfile: async (userId: string, updates: Partial<UserProfile>) => {
        set({ isLoading: true, error: null });
        try {
            const data = await window.electronAPI.db.upsertProfile(userId, updates);
            set({ profile: data as UserProfile });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            throw err;
        } finally {
            set({ isLoading: false });
        }
    },

    upsertProfile: async (userId: string, updates: Partial<UserProfile>) => {
        set({ isLoading: true, error: null });
        try {
            const data = await window.electronAPI.db.upsertProfile(userId, updates);
            set({ profile: data as UserProfile });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            throw err;
        } finally {
            set({ isLoading: false });
        }
    },

    uploadAvatar: async (userId: string, file: File) => {
        set({ isLoading: true, error: null });
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${userId}-${Math.random()}.${fileExt}`;

            // Avatar file storage stays on Supabase Storage (file blobs are cloud-only)
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const avatarUrl = data.publicUrl;

            // Persist the URL to SQLite (and sync push will update Supabase row)
            const updatedProfile = await window.electronAPI.db.upsertProfile(userId, { avatar_url: avatarUrl });
            set({ profile: updatedProfile as UserProfile });
            return avatarUrl;
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            return null;
        } finally {
            set({ isLoading: false });
        }
    }
}));
