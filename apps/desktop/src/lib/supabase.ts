import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables: SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY');
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

export function createClient() {
    return supabase;
}
