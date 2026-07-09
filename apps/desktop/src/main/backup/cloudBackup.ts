/**
 * Cloud backup service — automatic, Supabase-backed SQLite snapshots.
 *
 * Snapshot triggers (whichever comes first), per spec:
 *   - every 25 reviews          (requestBackupCheck ← renderer, per review)
 *   - app close                 (snapshotOnClose ← before-quit)
 *   - app blur / 5-min idle      (startIdleMonitor)
 * Hard cap: at most one snapshot per hour, regardless of how often triggers fire.
 *
 * The write is owned entirely by the main process: it produces a WAL-safe copy
 * of sekel.db via better-sqlite3's .backup(), uploads the file to the private
 * `sekel-backups` bucket, and inserts a metadata row — all as the signed-in
 * user (RLS-scoped) using a session pushed over IPC from the renderer.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app, powerMonitor, type BrowserWindow } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { createLogger, consoleTransport, metrics } from '@sekel/observability';
// Type-only import: erased at build, so main never require()s @sekel/db at
// runtime (its entry is raw TS and is externalized in the main bundle). Runtime
// table access goes through supabase-js directly, like ipc/admin.ts.
import type { BackupSnapshot } from '@sekel/db';
import { getDb } from '../db/index';
import * as state from './cloudState';
import { getAuthedClient } from './cloudClient';
import { sendBackupFailureAlert } from './cloudAlert';
import type { BackupReason, CloudBackupSession, CloudSnapshotInfo } from './cloudTypes';

const log = createLogger({ module: 'cloud-backup', transports: [consoleTransport] });

const REVIEW_THRESHOLD = 25;
const MIN_INTERVAL_MS = 60 * 60 * 1000;   // 1 snapshot / hour hard cap
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes blurred/idle
const IDLE_POLL_MS = 60 * 1000;           // check idle once a minute
const CLOSE_TIMEOUT_MS = 15 * 1000;       // never block quit longer than this
const FAILURE_ALERT_THRESHOLD = 3;        // Discord after N consecutive failures
const BUCKET = 'sekel-backups';

/** Coalesces overlapping triggers so only one snapshot runs at a time. */
let inFlight: Promise<boolean> | null = null;
let idleTimer: ReturnType<typeof setInterval> | null = null;

// ── Session wiring (pushed from the renderer) ────────────────────────────────

export function setSession(session: CloudBackupSession | null): void {
    state.setSession(session);
    if (session) log.info('Cloud backup session set', { userId: session.userId });
}

export function clearSession(): void {
    state.setSession(null);
}

// ── Trigger evaluation ───────────────────────────────────────────────────────

function withinHourlyCap(now: Date): boolean {
    const last = state.getLastBackupAt();
    if (!last) return false; // never backed up → cap does not apply
    return now.getTime() - new Date(last).getTime() < MIN_INTERVAL_MS;
}

/** "Unsynced changes" proxy: reviews recorded since the last snapshot. */
function hasUnsyncedChanges(): boolean {
    return state.getReviewsSinceLastBackup() > 0;
}

/** Pure decision: should we snapshot right now for this reason? */
export function shouldSnapshot(reason: BackupReason, now: Date): boolean {
    if (!state.getSession()) return false;      // not signed in → nothing to do
    if (reason === 'manual') return true;       // user-initiated bypasses the cap
    if (withinHourlyCap(now)) return false;     // hard cap
    if (reason === 'review-threshold') {
        return state.getReviewsSinceLastBackup() >= REVIEW_THRESHOLD;
    }
    // app-close / idle: only if there is unsynced work to protect
    return hasUnsyncedChanges();
}

// ── Public entry points ──────────────────────────────────────────────────────

/**
 * Renderer calls this after each review (cheap, fire-and-forget). Increments
 * the counter and fires a snapshot when the 25-review threshold is crossed.
 */
export function requestBackupCheck(reviewDelta = 1): void {
    state.addReviews(reviewDelta);
    void triggerBackupSnapshot('review-threshold');
}

/** Evaluates the trigger and, if conditions are met, performs the snapshot. */
export async function triggerBackupSnapshot(reason: BackupReason): Promise<boolean> {
    if (!shouldSnapshot(reason, new Date())) return false;
    return runSnapshot(reason);
}

/** Synchronous predicate so the quit hook can decide whether to defer at all. */
export function willSnapshotOnClose(): boolean {
    return shouldSnapshot('app-close', new Date());
}

/** Best-effort snapshot at quit time — never blocks the quit past a timeout. */
export async function snapshotOnClose(): Promise<void> {
    if (!shouldSnapshot('app-close', new Date())) return;
    await withTimeout(runSnapshot('app-close'), CLOSE_TIMEOUT_MS);
}

/** Starts blur/focus tracking + a 1-minute idle poll for the idle trigger. */
export function startIdleMonitor(window: BrowserWindow): void {
    window.on('blur', () => state.markBlurred(Date.now()));
    window.on('focus', () => state.markFocused());

    stopIdleMonitor();
    idleTimer = setInterval(() => {
        try {
            const now = Date.now();
            const systemIdleMs = powerMonitor.getSystemIdleTime() * 1000;
            const appBlurredMs = state.blurredForMs(now);
            if (systemIdleMs >= IDLE_THRESHOLD_MS || appBlurredMs >= IDLE_THRESHOLD_MS) {
                void triggerBackupSnapshot('idle');
            }
        } catch (err) {
            log.warn('Idle check failed', { error: errMsg(err) });
        }
    }, IDLE_POLL_MS);
    idleTimer.unref?.();
}

export function stopIdleMonitor(): void {
    if (idleTimer) {
        clearInterval(idleTimer);
        idleTimer = null;
    }
}

/** Lists the signed-in user's cloud snapshots for the restore UI. */
export async function listCloudSnapshots(): Promise<CloudSnapshotInfo[]> {
    const session = state.getSession();
    if (!session) throw new Error('Not signed in');
    const client = await getAuthedClient(session);
    const { data, error } = await client
        .from('backup_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    const rows = (data ?? []) as BackupSnapshot[];
    return rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        generation: r.generation,
        sizeBytes: r.size_bytes,
        reviewCount: r.review_count_at_snapshot,
        appVersion: r.app_version,
    }));
}

// ── Snapshot mechanism ───────────────────────────────────────────────────────

function runSnapshot(reason: BackupReason): Promise<boolean> {
    // Coalesce: if a snapshot is already running, ride along with it.
    if (inFlight) return inFlight;
    inFlight = doSnapshot(reason).finally(() => { inFlight = null; });
    return inFlight;
}

async function doSnapshot(reason: BackupReason): Promise<boolean> {
    const session = state.getSession();
    if (!session) return false;

    const snapshotId = crypto.randomUUID();
    const tmpPath = path.join(app.getPath('temp'), `sekel-cloud-${snapshotId}.sqlite`);

    try {
        // 1. WAL-safe consistent copy (never a raw file copy of a live WAL db).
        await getDb().backup(tmpPath);
        const bytes = fs.readFileSync(tmpPath);
        const reviewCount = countReviews();

        // 2. Per-user, RLS-scoped client.
        const client = await getAuthedClient(session);
        const storagePath = `${session.userId}/${snapshotId}.sqlite`;

        // 3. Upload the file to Storage.
        const { error: uploadError } = await client.storage
            .from(BUCKET)
            .upload(storagePath, bytes, { contentType: 'application/octet-stream', upsert: true });
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

        // 4. Insert the metadata row (new snapshots always start as 'daily';
        //    the scheduled pruning job promotes daily→weekly→monthly).
        const { error: insertError } = await client.from('backup_snapshots').insert({
            user_id: session.userId,
            generation: 'daily',
            size_bytes: bytes.byteLength,
            storage_path: storagePath,
            review_count_at_snapshot: reviewCount,
            app_version: app.getVersion(),
        });
        if (insertError) throw new Error(`Metadata insert failed: ${insertError.message}`);

        state.markSuccess(new Date());
        metrics.increment('cloud_backup.snapshot_success_total');
        log.info('Cloud snapshot uploaded', { reason, bytes: bytes.byteLength, reviewCount });
        return true;
    } catch (err) {
        await handleFailure(err, reason);
        return false;
    } finally {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* best effort */ }
    }
}

function countReviews(): number | null {
    try {
        const row = getDb().prepare('SELECT COUNT(*) AS c FROM reviews').get() as { c: number } | undefined;
        return row?.c ?? null;
    } catch {
        return null;
    }
}

// ── Failure handling (Sentry + throttled Discord) ────────────────────────────

async function handleFailure(err: unknown, reason: BackupReason): Promise<void> {
    const failures = state.markFailure();
    metrics.increment('cloud_backup.snapshot_failure_total');
    log.error('Cloud snapshot failed', { reason, consecutiveFailures: failures, error: errMsg(err) });

    Sentry.withScope((scope) => {
        scope.setTag('backup', reason);
        scope.setContext('cloud_backup', { reason, consecutiveFailures: failures });
        Sentry.captureException(err instanceof Error ? err : new Error(errMsg(err)));
    });

    // Discord only once per failure streak, after the threshold — not per blip.
    if (failures >= FAILURE_ALERT_THRESHOLD && !state.isFailureAlertSent()) {
        state.setFailureAlertSent(true);
        await sendBackupFailureAlert(state.getSession(), failures, errMsg(err));
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Resolves when `p` settles or after `ms`, whichever comes first. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
    try {
        return await Promise.race([p, timeout]);
    } finally {
        clearTimeout(timer!);
    }
}
