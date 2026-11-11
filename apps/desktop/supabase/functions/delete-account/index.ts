// Deletes the caller's account completely: their Storage objects in every
// bucket first, then the auth user. Deleting the auth user cascades every
// public.* row through the ON DELETE CASCADE user_id foreign keys
// (see 20261110120200_restore_user_fk_cascades.sql).
//
// Called from the renderer through supabase.functions.invoke('delete-account')
// (authStore.deleteAccount). Older clients still call the delete_own_account
// RPC, which removes the DB rows but not Storage objects.
//
// Auth: deployed WITH JWT verification (no --no-verify-jwt). The caller is
// identified only from their JWT via auth.getUser(), never from the request
// body. The service role is used only after that check.
//
// The renderer runs on a file:// origin, so the function answers CORS
// preflights. With JWT verification on, the platform still forwards OPTIONS
// without a token.
//
// Storage naming (must match the clients; see profileStore.ts,
// FeedbackSection.tsx, cloudBackup.ts and the storage policies):
//   sekel-backups          `${userId}/${snapshotId}.sqlite`   folder
//   card-media             `${userId}/...`                    folder (INSERT policy requires it)
//   avatars                `${userId}-${ts}.${ext}`           bucket root, name prefix
//   backgrounds            `${userId}-bg-${ts}.${ext}`        bucket root, name prefix
//   feedback-screenshots   `${userId}-${ts}.${ext}`           bucket root, name prefix
//
// If any Storage step fails, the auth user is NOT deleted and the function
// returns 500, so the user can retry without leaving their files behind.
//
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FOLDER_BUCKETS = ['sekel-backups', 'card-media'] as const;
const PREFIX_BUCKETS = ['avatars', 'backgrounds', 'feedback-screenshots'] as const;
const LIST_LIMIT = 1000;
const REMOVE_CHUNK = 100;

type Storage = SupabaseClient['storage'];

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function isBucketMissing(error: { message?: string }): boolean {
    return /bucket not found/i.test(error.message ?? '');
}

/** Every object path under `folder`, recursing into sub-folders. Lists everything before anything is deleted. */
async function listFolder(storage: Storage, bucket: string, folder: string): Promise<string[]> {
    const out: string[] = [];
    let offset = 0;
    for (;;) {
        const { data, error } = await storage.from(bucket).list(folder, {
            limit: LIST_LIMIT,
            offset,
            sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;
        const entries = data ?? [];
        if (entries.length === 0) break;
        for (const e of entries) {
            const path = `${folder}/${e.name}`;
            // Folder placeholders come back with a null id.
            if (!e.id) out.push(...await listFolder(storage, bucket, path));
            else out.push(path);
        }
        offset += entries.length;
    }
    return out;
}

/** Root-level objects whose name starts with `prefix`. */
async function listRootPrefix(storage: Storage, bucket: string, prefix: string): Promise<string[]> {
    const out: string[] = [];
    let offset = 0;
    for (;;) {
        const { data, error } = await storage.from(bucket).list('', {
            limit: LIST_LIMIT,
            offset,
            search: prefix,
            sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;
        const entries = data ?? [];
        if (entries.length === 0) break;
        for (const e of entries) {
            // `search` is a server-side prefix filter. Check it again here so
            // we never delete anything that isn't exactly this user's.
            if (e.id && e.name.startsWith(prefix)) out.push(e.name);
        }
        offset += entries.length;
    }
    return out;
}

async function removeAll(storage: Storage, bucket: string, paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const { error } = await storage.from(bucket).remove(paths.slice(i, i + REMOVE_CHUNK));
        if (error) throw error;
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return json({ error: 'method not allowed' }, 405);
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Identify the caller from the token only.
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
        return json({ error: 'unauthorized' }, 401);
    }
    const userId = userData.user.id;

    // 1. Storage objects. Any failure aborts before the auth user is deleted.
    const removed: Record<string, number> = {};
    const buckets: Array<{ bucket: string; list: () => Promise<string[]> }> = [
        ...FOLDER_BUCKETS.map((bucket) => ({ bucket, list: () => listFolder(admin.storage, bucket, userId) })),
        ...PREFIX_BUCKETS.map((bucket) => ({ bucket, list: () => listRootPrefix(admin.storage, bucket, `${userId}-`) })),
    ];
    for (const { bucket, list } of buckets) {
        try {
            const paths = await list();
            await removeAll(admin.storage, bucket, paths);
            removed[bucket] = paths.length;
        } catch (err) {
            const e = err as { message?: string };
            if (isBucketMissing(e)) {
                console.warn('bucket missing; skipping', { bucket });
                removed[bucket] = 0;
                continue;
            }
            console.error('storage cleanup failed', { userId, bucket, error: e.message ?? String(err) });
            return json({ error: 'storage cleanup failed', bucket }, 500);
        }
    }

    // 2. The auth user (hard delete). public.* rows cascade.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
        console.error('auth user delete failed', { userId, error: delErr.message });
        return json({ error: 'account delete failed' }, 500);
    }

    console.log('account deleted', { userId, removed });
    return json({ ok: true, removed }, 200);
});
