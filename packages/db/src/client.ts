import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
    if (!url || !anonKey) {
        throw new Error('Missing Supabase environment variables: url and anonKey are required');
    }
    return createClient(url, anonKey, {
        auth: {
            // PKCE: email-confirmation / password-reset links come back as
            // sekel://auth/callback?code=…, and the code can only be exchanged
            // with the verifier this client stored when the flow started. A
            // link crafted by anyone else (e.g. carrying their own access and
            // refresh tokens) can't sign the user into a foreign account.
            flowType: 'pkce',
        },
    });
}
