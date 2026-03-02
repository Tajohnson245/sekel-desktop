import { createSupabaseClient } from '@sekel/db';

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

export function createClient() {
    return supabase;
}
