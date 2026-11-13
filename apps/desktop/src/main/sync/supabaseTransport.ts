/**
 * SyncTransport over Supabase: the sync_*_v1 RPCs and the private sekel-media
 * bucket, called as the signed-in user (RLS-scoped client built from the
 * session the renderer pushes; see main/backup/cloudClient.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    SyncError,
    type HelloResult, type PullResult, type PushPayload, type PushResult, type SyncTransport,
} from './types';

export const MEDIA_BUCKET = 'sekel-media';

interface RpcError { message?: string; code?: string; details?: string; hint?: string }

/** Maps a PostgREST / Postgres error to how the engine should react. */
export function classifyRpcError(error: RpcError, status?: number): SyncError {
    const code = error.code ?? '';
    const message = error.message || 'sync request failed';
    if (code === 'PGRST202' || code === '42883' || code === '42P01' || status === 404) {
        return new SyncError('unavailable', 'Cloud sync is not set up on the server yet', code);
    }
    if (code === '28000' || code === 'PGRST301' || code === 'PGRST302' || status === 401 || /jwt/i.test(message)) {
        return new SyncError('auth', message, code);
    }
    if (/^(22|23|42|P0)/.test(code)) {
        return new SyncError('data', message, code);
    }
    return new SyncError('transient', message, code);
}

function isAlreadyThere(error: { message?: string; statusCode?: string | number; status?: number }): boolean {
    const status = Number(error.statusCode ?? error.status);
    return status === 409 || /already exists|duplicate/i.test(error.message ?? '');
}

export function createSupabaseTransport(client: SupabaseClient): SyncTransport {
    async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
        let res: { data: unknown; error: RpcError | null; status?: number };
        try {
            res = await client.rpc(fn, args) as typeof res;
        } catch (err) {
            throw new SyncError('transient', err instanceof Error ? err.message : String(err));
        }
        if (res.error) throw classifyRpcError(res.error, res.status);
        return res.data as T;
    }

    return {
        hello: () => call<HelloResult>('sync_hello_v1', {}),
        push: (deviceId: string, payload: PushPayload, force: boolean) =>
            call<PushResult>('sync_push_v1', { p_device: deviceId, p_changes: payload, p_force: force }),
        pull: (since: number, limit: number, skipDevice: string | null) =>
            call<PullResult>('sync_pull_v1', { p_since: since, p_limit: limit, p_skip_device: skipDevice }),
        prune: (beforeSeq: number) => call<{ pruned: number; max_seq: number }>('sync_prune_v1', { p_before_seq: beforeSeq }),

        async uploadMedia(storagePath: string, data: Buffer, mimeType: string | null): Promise<void> {
            let error: { message?: string; statusCode?: string | number; status?: number } | null;
            try {
                ({ error } = await client.storage.from(MEDIA_BUCKET).upload(storagePath, data, {
                    contentType: mimeType ?? 'application/octet-stream',
                    upsert: false,
                }));
            } catch (err) {
                throw new SyncError('transient', err instanceof Error ? err.message : String(err));
            }
            if (!error || isAlreadyThere(error)) return; // content-addressed: same path, same bytes
            const status = Number(error.statusCode ?? error.status);
            if (status === 404) throw new SyncError('unavailable', 'Cloud media storage is not set up yet');
            if (status >= 400 && status < 500 && status !== 408 && status !== 429) throw new SyncError('data', error.message ?? 'upload rejected');
            throw new SyncError('transient', error.message ?? 'upload failed');
        },

        async downloadMedia(storagePath: string): Promise<Buffer> {
            const { data, error } = await client.storage.from(MEDIA_BUCKET).download(storagePath);
            if (error || !data) throw new SyncError('transient', error?.message ?? 'download failed');
            return Buffer.from(await data.arrayBuffer());
        },
    };
}
