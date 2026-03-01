import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface UserProfile {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    medical_school: string | null;
    degree_track: string | null;
    exam: string | null;
    target_date: string | null;
    language: string;
    avatar_url: string | null;
    location: string | null;
    theme_preference: 'light' | 'dark' | 'system';
    flip_animation: boolean;
    created_at: string;
    updated_at: string;
}

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
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                // If profile doesn't exist, we might want to fail silently or return null
                // But for now, let's throw if it's not a "not found" error, or handle "not found"
                if (error.code === 'PGRST116') { // code for no rows returned
                    set({ profile: null });
                    return;
                }
                throw error;
            }

            set({ profile: data });
        } catch (err: unknown) {
            set({ error: err instanceof Error ? err.message : String(err) });
        } finally {
            set({ isLoading: false });
        }
    },

    updateProfile: async (userId: string, updates: Partial<UserProfile>) => {
        set({ isLoading: true, error: null });
        try {
            const { error, data } = await supabase
                .from('user_profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;
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
            const payload = { ...updates, id: userId, updated_at: new Date().toISOString() };
            const { error, data } = await supabase
                .from('user_profiles')
                .upsert(payload)
                .select()
                .single();

            if (error) throw error;
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
            const fileName = `${userId}-${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const avatarUrl = data.publicUrl;

            // Update user profile
            const { error: updateError, data: updatedProfile } = await supabase
                .from('user_profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', userId)
                .select()
                .single();

            if (updateError) throw updateError;

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

