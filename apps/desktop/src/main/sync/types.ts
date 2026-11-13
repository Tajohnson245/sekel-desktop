/** Wire types of the sync RPCs (supabase/migrations/*_sync_functions.sql). */

export interface HelloResult {
    enabled: boolean;
    server_time: string;
    max_seq: number;
    version: number;
}

export interface PushPayload {
    deletes: Record<string, unknown[]>;
    upserts: Record<string, unknown[]>;
}

export interface PushResult {
    upserted: number;
    deleted: number;
    max_seq: number;
}

export interface PullChange {
    t: string;
    seq: number;
    /** Null when the row was last written by the pulling device. */
    row: Record<string, unknown> | null;
}

export interface PullResult {
    changes: PullChange[];
    next: number;
    more: boolean;
}

/** How the engine reaches the server; Supabase in the app, PGlite in tests. */
export interface SyncTransport {
    hello(): Promise<HelloResult>;
    push(deviceId: string, payload: PushPayload, force: boolean): Promise<PushResult>;
    pull(since: number, limit: number, skipDevice: string | null): Promise<PullResult>;
    prune(beforeSeq: number): Promise<{ pruned: number; max_seq: number }>;
    /** Idempotent: uploading a path that already exists succeeds. */
    uploadMedia(storagePath: string, data: Buffer, mimeType: string | null): Promise<void>;
    downloadMedia(storagePath: string): Promise<Buffer>;
}

/**
 * auth: the session is missing or expired — wait for a fresh one.
 * unavailable: the server has no sync API yet (migrations not deployed).
 * data: the server rejected the batch's content — bisect to find the row.
 * transient: network / 5xx / timeout — retry later.
 */
export type SyncErrorKind = 'auth' | 'unavailable' | 'data' | 'transient';

export class SyncError extends Error {
    constructor(public readonly kind: SyncErrorKind, message: string, public readonly code?: string) {
        super(message);
        this.name = 'SyncError';
    }
}

export type SyncState =
    | 'signed_out'   // no session
    | 'disabled'     // server switch is off for this user
    | 'unavailable'  // server has no sync API yet
    | 'idle'
    | 'syncing'
    | 'offline'      // transient failures; retrying with backoff
    | 'error';       // unexpected failure

export interface SyncStatus {
    state: SyncState;
    /** Local changes not yet uploaded (excluding ones that keep failing). */
    pending: number;
    /** Local changes the server keeps rejecting; see lastError. */
    failed: number;
    lastSyncAt: string | null;
    lastError: string | null;
    phase: 'uploading' | 'downloading' | 'restoring' | null;
    /** Rows handled in the current phase. */
    progress: number;
}
