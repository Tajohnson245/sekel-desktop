import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
    if (!url || !anonKey) {
        throw new Error('Missing Supabase environment variables: url and anonKey are required');
    }
    return createClient(url, anonKey);
}
