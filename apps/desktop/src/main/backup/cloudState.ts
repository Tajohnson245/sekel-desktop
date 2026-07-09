/**
 * Persistent control state for the cloud backup subsystem.
 *
 * Counters/timestamps live in a dedicated electron-store file (cloud-backup.json
 * in userData) — deliberately NOT inside sekel.db, so restoring an old snapshot
 * can't roll the trigger counters backwards. The auth session is held in memory
 * only (tokens are never persisted to disk).
 */

import Store from 'electron-store';
import type { CloudBackupSession } from './cloudTypes';

interface PersistedState {
    /** ISO timestamp of the last *successful* snapshot, or null if never. */
    lastBackupAt: string | null;
    /** Reviews recorded since the last successful snapshot (trigger counter). */
    reviewsSinceLastBackup: number;
    /** Consecutive snapshot failures; resets to 0 on success. */
    consecutiveFailures: number;
    /** Whether a Discord alert has already fired for the current failure streak. */
    failureAlertSent: boolean;
}

const DEFAULTS: PersistedState = {
    lastBackupAt: null,
    reviewsSinceLastBackup: 0,
    consecutiveFailures: 0,
    failureAlertSent: false,
};

// Dedicated store file so keys never collide with the default window-state
// store. Lazily created: this module is imported at the top of main.ts (before
// app.whenReady), and we don't want to touch app paths until we actually read
// or write state — which only happens after the app is up and a user signs in.
let _store: Store<PersistedState> | undefined;
function store(): Store<PersistedState> {
    if (!_store) _store = new Store<PersistedState>({ name: 'cloud-backup', defaults: DEFAULTS });
    return _store;
}

// ── Persistent counters ──────────────────────────────────────────────────────

export function getLastBackupAt(): string | null {
    return store().get('lastBackupAt', null);
}

export function getReviewsSinceLastBackup(): number {
    return store().get('reviewsSinceLastBackup', 0);
}

export function addReviews(n = 1): number {
    const next = getReviewsSinceLastBackup() + n;
    store().set('reviewsSinceLastBackup', next);
    return next;
}

export function getConsecutiveFailures(): number {
    return store().get('consecutiveFailures', 0);
}

export function isFailureAlertSent(): boolean {
    return store().get('failureAlertSent', false);
}

export function setFailureAlertSent(sent: boolean): void {
    store().set('failureAlertSent', sent);
}

/** Records a successful snapshot: stamps the time and clears counters/failures. */
export function markSuccess(at: Date): void {
    store().set('lastBackupAt', at.toISOString());
    store().set('reviewsSinceLastBackup', 0);
    store().set('consecutiveFailures', 0);
    store().set('failureAlertSent', false);
}

/** Records a failed snapshot: bumps the failure counter and returns the new count. */
export function markFailure(): number {
    const next = getConsecutiveFailures() + 1;
    store().set('consecutiveFailures', next);
    return next;
}

// ── In-memory auth session (never persisted) ─────────────────────────────────

let session: CloudBackupSession | null = null;

export function setSession(next: CloudBackupSession | null): void {
    session = next;
}

export function getSession(): CloudBackupSession | null {
    return session;
}

// ── In-memory activity tracking (blur / idle) ────────────────────────────────

let blurredSince: number | null = null;

/** Marks the app as backgrounded (window blurred), starting the idle clock. */
export function markBlurred(nowMs: number): void {
    if (blurredSince === null) blurredSince = nowMs;
}

/** Marks the app as foregrounded (window focused), stopping the idle clock. */
export function markFocused(): void {
    blurredSince = null;
}

/** Milliseconds the app has been continuously blurred, or 0 if focused. */
export function blurredForMs(nowMs: number): number {
    return blurredSince === null ? 0 : nowMs - blurredSince;
}
