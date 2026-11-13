/**
 * The sync engine (docs/features/desktop/in-progress/supabase-sync.md).
 *
 * One cycle, for the signed-in user:
 *   1. hello: is sync on for this user? (server switch) + server clock
 *   2. after a backup restore: make the cloud match the restored library
 *      (force-push everything, then prune what wasn't re-pushed)
 *   3. first sync on this device: queue the whole library
 *   4. push the outbox (deletes, then upserts parents-first; media files are
 *      uploaded before their rows; a rejected batch is bisected down to the
 *      bad row, which is parked)
 *   5. pull changes after the cursor into the inbox and apply them
 * Push runs before pull, so a pulled row rarely meets a pending local edit.
 *
 * Every dependency is injected, so tests run two engines (two SQLite
 * "devices") against one Postgres.
 */
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import { localMediaPath, serializeEntry, type PushPart } from './codec';
import { applyInbox, inboxSize, storePage } from './inbox';
import {
    enableCapture, getMeta, getPullCursor, needsRestoreReconcile, setMeta, setPullCursor,
} from './meta';
import { countOutbox, enqueueAll, markFailed, readOutbox, removeEntries, type OutboxEntry } from './outbox';
import { SyncError, type PushPayload, type SyncStatus, type SyncTransport } from './types';

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const PUSH_BATCH = 400;
const PUSH_MAX_BYTES = 1_500_000;
const PULL_PAGE = 1000;
const HELLO_EVERY_MS = 10 * 60_000;
const PULL_EVERY_MS = 2 * 60_000;
const UNAVAILABLE_RETRY_MS = 30 * 60_000;
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
/** Clock differences below this are noise; above it, change times are shifted. */
const CLOCK_SKEW_MS = 60_000;

export interface SyncSession { userId: string }

export interface SyncEngineDeps {
    db: () => Database.Database;
    getSession: () => SyncSession | null;
    transportFor: (session: SyncSession) => SyncTransport;
    deviceId: () => string;
    mediaDir: () => string;
    now?: () => number;
    onStatus?: (status: SyncStatus) => void;
    /** Pulled changes were written locally (tables touched). */
    onApplied?: (tables: string[]) => void;
    /** Unexpected (non-network) failures, for Sentry. */
    onError?: (err: unknown, context: string) => void;
}

const IDLE: SyncStatus = { state: 'signed_out', pending: 0, failed: 0, lastSyncAt: null, lastError: null, phase: null, progress: 0 };

export class SyncEngine {
    private status: SyncStatus = { ...IDLE };
    private running: Promise<SyncStatus> | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private enabled = false;
    private helloAt = 0;
    private helloUser: string | null = null;
    private lastPullAt = 0;
    private pullRequested = true;
    private retryAt = 0;
    private backoffMs = BACKOFF_MIN_MS;
    private clockOffsetMs = 0;

    constructor(private readonly deps: SyncEngineDeps) {}

    private now(): number {
        return this.deps.now?.() ?? Date.now();
    }

    getStatus(): SyncStatus {
        return { ...this.status };
    }

    private setStatus(patch: Partial<SyncStatus>): void {
        this.status = { ...this.status, ...patch };
        this.deps.onStatus?.(this.getStatus());
    }

    /** Polls every few seconds; a cycle only does work when something is due. */
    start(intervalMs = 5_000): void {
        if (this.timer) return;
        this.timer = setInterval(() => { void this.tick(); }, intervalMs);
        void this.tick();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** App came to the foreground / user signed in: pull soon. */
    nudge(): void {
        this.pullRequested = true;
        this.retryAt = 0;
        void this.tick();
    }

    /** "Sync now": a full cycle regardless of timers. */
    syncNow(): Promise<SyncStatus> {
        this.pullRequested = true;
        this.retryAt = 0;
        this.helloAt = 0;
        return this.run(true);
    }

    /**
     * Before quit: push what's pending, bounded by the caller's timeout.
     * Returns immediately when there's nothing to push, sync is off, or the
     * engine is backing off (offline) — quitting shouldn't wait on the network.
     */
    async flush(): Promise<void> {
        if (this.running) await this.running.catch(() => undefined);
        const session = this.deps.getSession();
        if (!session || !this.enabled) return;
        if (countOutbox(this.deps.db(), session.userId).pending === 0) return;
        await this.run(false, { pushOnly: true }).catch(() => undefined);
    }

    private tick(): Promise<SyncStatus> {
        if (this.running) return this.running;
        return this.run(false);
    }

    private run(force: boolean, opts: { pushOnly?: boolean } = {}): Promise<SyncStatus> {
        if (this.running) return this.running;
        this.running = this.cycle(force, opts).finally(() => { this.running = null; });
        return this.running;
    }

    private async cycle(force: boolean, opts: { pushOnly?: boolean }): Promise<SyncStatus> {
        const session = this.deps.getSession();
        if (!session) {
            if (this.status.state !== 'signed_out') this.setStatus({ ...IDLE });
            this.helloUser = null;
            return this.getStatus();
        }
        const now = this.now();
        if (!force && now < this.retryAt) return this.getStatus();

        const userId = session.userId;
        const db = this.deps.db();
        const transport = this.deps.transportFor(session);
        try {
            if (force || this.helloUser !== userId || now - this.helloAt > HELLO_EVERY_MS) {
                const sentAt = this.now();
                const hello = await transport.hello();
                const rtt = this.now() - sentAt;
                const offset = Date.parse(hello.server_time) - (sentAt + rtt / 2);
                this.clockOffsetMs = Math.abs(offset) > CLOCK_SKEW_MS ? offset : 0;
                this.enabled = hello.enabled;
                this.helloAt = this.now();
                if (this.helloUser !== userId) this.pullRequested = true;
                this.helloUser = userId;
            }
            if (!this.enabled) {
                this.setStatus({ state: 'disabled', phase: null, lastError: null, ...countOutboxStatus(db, userId) });
                return this.getStatus();
            }
            enableCapture(db);

            if (needsRestoreReconcile(db, userId)) {
                await this.reconcileRestore(db, userId, transport);
            } else if (!getMeta(db, `backfilled:${userId}`)) {
                enqueueAll(db, userId, 'own-time');
                setMeta(db, `backfilled:${userId}`, new Date(this.now()).toISOString());
            }

            const { pending } = countOutbox(db, userId);
            if (pending > 0) await this.pushAll(db, userId, transport, false);

            if (!opts.pushOnly && (force || this.pullRequested || this.now() - this.lastPullAt > PULL_EVERY_MS || inboxSize(db, userId) > 0)) {
                await this.pullAll(db, userId, transport);
                this.pullRequested = false;
                this.lastPullAt = this.now();
            }

            this.backoffMs = BACKOFF_MIN_MS;
            this.retryAt = 0;
            this.setStatus({ state: 'idle', phase: null, progress: 0, lastSyncAt: new Date(this.now()).toISOString(), lastError: null, ...countOutboxStatus(db, userId) });
        } catch (err) {
            this.handleError(err, db, userId);
        }
        return this.getStatus();
    }

    private handleError(err: unknown, db: Database.Database, userId: string): void {
        const counts = countOutboxStatus(db, userId);
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof SyncError && err.kind === 'unavailable') {
            this.retryAt = this.now() + UNAVAILABLE_RETRY_MS;
            this.setStatus({ state: 'unavailable', phase: null, lastError: message, ...counts });
            return;
        }
        if (err instanceof SyncError && (err.kind === 'transient' || err.kind === 'auth')) {
            // auth: the renderer refreshes the token and pushes a new session.
            this.retryAt = this.now() + this.backoffMs;
            this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
            this.setStatus({ state: 'offline', phase: null, lastError: message, ...counts });
            return;
        }
        this.retryAt = this.now() + this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
        this.deps.onError?.(err, 'sync cycle');
        this.setStatus({ state: 'error', phase: null, lastError: message, ...counts });
    }

    // ── Push ────────────────────────────────────────────────────────────────

    private async pushAll(db: Database.Database, userId: string, transport: SyncTransport, force: boolean): Promise<void> {
        let done = 0;
        this.setStatus({ state: 'syncing', phase: 'uploading', progress: 0 });
        for (;;) {
            const entries = readOutbox(db, userId, PUSH_BATCH);
            if (entries.length === 0) return;
            const batch = await this.prepareBatch(db, userId, transport, entries);
            if (batch.length > 0) await this.sendWithBisect(db, transport, batch, force);
            done += batch.length;
            this.setStatus({ progress: done, ...countOutboxStatus(db, userId) });
            // prepareBatch always consumes the first entry (sent, dropped or parked), so this terminates.
        }
    }

    /** Serializes entries (up to the byte budget), uploading media files first. */
    private async prepareBatch(
        db: Database.Database, userId: string, transport: SyncTransport, entries: OutboxEntry[],
    ): Promise<Array<{ entry: OutboxEntry; part: NonNullable<PushPart> }>> {
        const out: Array<{ entry: OutboxEntry; part: NonNullable<PushPart> }> = [];
        let bytes = 0;
        for (const entry of entries) {
            let part: PushPart;
            try {
                part = serializeEntry(db, entry, userId, this.clockOffsetMs);
            } catch (err) {
                markFailed(db, entry.rowid, `serialize: ${(err as Error).message}`, true);
                continue;
            }
            if (!part) {
                removeEntries(db, [entry.rowid]); // nothing to send (e.g. its exam no longer exists here)
                continue;
            }
            const size = JSON.stringify(part.value).length;
            if (out.length > 0 && bytes + size > PUSH_MAX_BYTES) break; // next batch
            if (part.kind === 'upsert' && part.table === 'media') {
                const ok = await this.uploadMediaFile(db, entry, part.value, transport);
                if (!ok) continue;
            }
            bytes += size;
            out.push({ entry, part });
        }
        return out;
    }

    /** Uploads the file behind a media row; false when the row must wait or is parked. */
    private async uploadMediaFile(db: Database.Database, entry: OutboxEntry, value: Record<string, unknown>, transport: SyncTransport): Promise<boolean> {
        const row = db.prepare('SELECT file_path, mime_type FROM media WHERE id = ?').get(entry.row_id) as { file_path: string; mime_type: string | null } | undefined;
        if (!row) return true;
        let data: Buffer;
        try {
            data = await fs.readFile(row.file_path);
        } catch {
            markFailed(db, entry.rowid, 'media file missing on this device', true);
            return false;
        }
        if (data.length > MEDIA_MAX_BYTES) {
            markFailed(db, entry.rowid, `media file larger than ${MEDIA_MAX_BYTES / 1024 / 1024} MB`, true);
            return false;
        }
        try {
            await transport.uploadMedia(String(value.storage_path), data, row.mime_type);
        } catch (err) {
            // A rejected file (e.g. a type the bucket refuses) is parked;
            // network problems stop this push and retry later.
            if (err instanceof SyncError && err.kind === 'data') {
                markFailed(db, entry.rowid, `media upload: ${err.message}`, true);
                return false;
            }
            throw err;
        }
        return true;
    }

    private async sendWithBisect(
        db: Database.Database, transport: SyncTransport,
        batch: Array<{ entry: OutboxEntry; part: NonNullable<PushPart> }>, force: boolean,
    ): Promise<void> {
        try {
            await transport.push(this.deps.deviceId(), toPayload(batch.map((b) => b.part)), force);
            removeEntries(db, batch.map((b) => b.entry.rowid));
        } catch (err) {
            if (!(err instanceof SyncError) || err.kind !== 'data') throw err;
            if (batch.length === 1) {
                markFailed(db, batch[0].entry.rowid, err.message, true);
                return;
            }
            const mid = Math.ceil(batch.length / 2);
            await this.sendWithBisect(db, transport, batch.slice(0, mid), force);
            await this.sendWithBisect(db, transport, batch.slice(mid), force);
        }
    }

    // ── Pull ────────────────────────────────────────────────────────────────

    private async pullAll(db: Database.Database, userId: string, transport: SyncTransport): Promise<void> {
        this.setStatus({ state: 'syncing', phase: 'downloading', progress: 0 });
        let cursor = getPullCursor(db, userId);
        let received = 0;
        for (;;) {
            const res = await transport.pull(cursor, PULL_PAGE, this.deps.deviceId());
            received += storePage(db, userId, res.changes, res.next);
            cursor = res.next;
            this.setStatus({ progress: received });
            if (!res.more) break;
            await new Promise<void>((r) => setImmediate(r));
        }
        const applied = await applyInbox(db, userId, this.deps.mediaDir(), (n) => this.setStatus({ progress: n }));
        if (applied.tables.size > 0) this.deps.onApplied?.([...applied.tables]);
    }

    // ── Restore ─────────────────────────────────────────────────────────────

    /**
     * After a backup restore the restored library becomes the truth on every
     * device: remember the cursor, force-push every local row, then tombstone
     * whatever the push didn't touch. If the push can't finish (offline), no
     * prune happens — the cloud keeps the union until the next attempt.
     */
    private async reconcileRestore(db: Database.Database, userId: string, transport: SyncTransport): Promise<void> {
        this.setStatus({ state: 'syncing', phase: 'restoring', progress: 0 });
        const before = (await transport.hello()).max_seq;
        db.prepare('DELETE FROM sync_inbox WHERE user_id = ?').run(userId);
        enqueueAll(db, userId, 'now');
        await this.pushAll(db, userId, transport, true);
        if (countOutbox(db, userId).pending > 0) {
            throw new SyncError('transient', 'restore upload incomplete');
        }
        const pruned = await transport.prune(before);
        setPullCursor(db, userId, pruned.max_seq);
        const stamp = new Date(this.now()).toISOString();
        setMeta(db, `restore_reconciled:${userId}`, stamp);
        setMeta(db, `backfilled:${userId}`, stamp);
    }

    // ── Media on demand ─────────────────────────────────────────────────────

    /**
     * Downloads a synced media file that isn't on this device yet (pulled
     * from another device). Returns the local path, or null if unavailable.
     */
    async fetchMedia(mediaRow: { user_id: string; file_path: string; file_hash: string; filename: string }): Promise<string | null> {
        const session = this.deps.getSession();
        if (!session || session.userId !== mediaRow.user_id || !this.enabled) return null;
        const storagePath = `${mediaRow.user_id}/${mediaRow.file_hash}${extOf(mediaRow.file_path || mediaRow.filename)}`;
        const dest = localMediaPath(this.deps.mediaDir(), storagePath);
        try {
            const data = await this.deps.transportFor(session).downloadMedia(storagePath);
            await fs.mkdir(this.deps.mediaDir(), { recursive: true });
            await fs.writeFile(dest, data);
            return dest;
        } catch {
            return null;
        }
    }
}

function extOf(p: string): string {
    const i = p.lastIndexOf('.');
    const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return i > slash ? p.slice(i) : '';
}

function countOutboxStatus(db: Database.Database, userId: string): Pick<SyncStatus, 'pending' | 'failed'> {
    const { pending, failed } = countOutbox(db, userId);
    return { pending, failed };
}

export function toPayload(parts: Array<NonNullable<PushPart>>): PushPayload {
    const payload: PushPayload = { deletes: {}, upserts: {} };
    for (const p of parts) {
        const bucket = p.kind === 'delete' ? payload.deletes : payload.upserts;
        (bucket[p.table] ??= []).push(p.value);
    }
    return payload;
}
