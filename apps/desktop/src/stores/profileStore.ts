import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { fetchUserProfile, upsertUserProfile } from '@sekel/db';
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
            const data = await fetchUserProfile(supabase, userId);
            set({ profile: data });
            // Configure notification scheduler with profile settings
            if (data) {
                window.electronAPI?.notify.configure({
                    userId,
                    enabled: data.notifications_enabled ?? false,
                    reminderTimes: data.reminder_times ?? [],
                });
            }
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
        } finally {
            set({ isLoading: false });
        }
    },

    updateProfile: async (userId: string, updates: Partial<UserProfile>) => {
        set({ isLoading: true, error: null });
        try {
            const data = await upsertUserProfile(supabase, userId, updates);
            set({ profile: data });
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
            const data = await upsertUserProfile(supabase, userId, updates);
            set({ profile: data });
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
            const fileName = `${userId}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const avatarUrl = data.publicUrl;
            const updatedProfile = await upsertUserProfile(supabase, userId, { avatar_url: avatarUrl });
            set({ profile: updatedProfile });
            return avatarUrl;
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
            return null;
        } finally {
            set({ isLoading: false });
        }
    }
}));
