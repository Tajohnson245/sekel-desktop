/**
 * Main-process wiring for cloud sync: one SyncEngine for the app, using the
 * signed-in session the renderer already pushes for cloud backups, the
 * RLS-scoped Supabase client, a per-install device id, and the media folder.
 * Status and "pulled changes landed" events go to every window.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import * as Sentry from '@sentry/electron/main';
import { createLogger, consoleTransport } from '@sekel/observability';
import { getDb } from '../db/index';
import { getSession } from '../backup/cloudState';
import { getAuthedClient, isSessionUsable } from '../backup/cloudClient';
import { SyncEngine } from './engine';
import { createSupabaseTransport } from './supabaseTransport';
import type { SyncStatus, SyncTransport } from './types';

const log = createLogger({ module: 'sync', transports: [consoleTransport] });

/** Never hold up quitting longer than this for a final push. */
const FLUSH_TIMEOUT_MS = 10_000;

let engine: SyncEngine | null = null;
let transportCache: { token: string; transport: SyncTransport } | null = null;

// Device id: per install, kept outside sekel.db so restoring a database made
// on another computer doesn't make two devices share an id.
let deviceStore: Store<{ deviceId: string }> | undefined;
function deviceId(): string {
    deviceStore ??= new Store<{ deviceId: string }>({ name: 'sync-device' });
    let id = deviceStore.get('deviceId');
    if (!id) {
        id = randomUUID();
        deviceStore.set('deviceId', id);
    }
    return id;
}

function broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
}

function getEngine(): SyncEngine {
    engine ??= new SyncEngine({
        db: getDb,
        getSession: () => {
            const s = getSession();
            return s && isSessionUsable(s, Date.now()) ? { userId: s.userId } : null;
        },
        transportFor: () => {
            const s = getSession();
            if (!s) throw new Error('sync: no session');
            if (transportCache?.token !== s.accessToken) {
                transportCache = { token: s.accessToken, transport: createSupabaseTransport(getAuthedClient(s)) };
            }
            return transportCache.transport;
        },
        deviceId,
        mediaDir: () => path.join(app.getPath('userData'), 'media'),
        onStatus: (status: SyncStatus) => broadcast('sync:status', status),
        onApplied: (tables: string[]) => broadcast('sync:applied', tables),
        onError: (err, context) => {
            log.error('Sync failed', { context, error: err instanceof Error ? err.message : String(err) });
            Sentry.withScope((scope) => {
                scope.setTag('sync', context);
                Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
            });
        },
    });
    return engine;
}

export function startSync(): void {
    getEngine().start();
}

/** Window focused or session changed: pull soon. */
export function nudgeSync(): void {
    engine?.nudge();
}

export function syncNow(): Promise<SyncStatus> {
    return getEngine().syncNow();
}

export function getSyncStatus(): SyncStatus {
    return getEngine().getStatus();
}

/** Pushes pending changes before quit, bounded so quitting never hangs. */
export async function flushSync(): Promise<void> {
    if (!engine) return;
    engine.stop();
    await Promise.race([
        engine.flush(),
        new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]);
}

/** Downloads a synced media file that isn't on this device yet. */
export function fetchMissingMedia(row: { user_id: string; file_path: string; file_hash: string; filename: string }): Promise<string | null> {
    return engine ? engine.fetchMedia(row) : Promise.resolve(null);
}
