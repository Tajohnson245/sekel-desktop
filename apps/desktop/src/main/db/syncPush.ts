import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function initSyncClient(url: string, anonKey: string, accessToken: string): void {
    supabaseClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false },
    });
}

export function pushRecord(table: string, record: Record<string, unknown>): void {
    if (!supabaseClient) return;
    supabaseClient
        .from(table)
        .upsert(record, { onConflict: 'id' })
        .then(({ error }) => {
            if (error) console.warn(`[Sync] Failed to push to ${table}:`, error.message);
        });
}

export function deleteRecord(table: string, id: string): void {
    if (!supabaseClient) return;
    supabaseClient
        .from(table)
        .delete()
        .eq('id', id)
        .then(({ error }) => {
            if (error) console.warn(`[Sync] Failed to delete from ${table} id=${id}:`, error.message);
        });
}
