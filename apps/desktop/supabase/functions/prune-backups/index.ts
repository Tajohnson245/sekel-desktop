// Generational pruning of cloud backup snapshots. Runs daily (pg_cron →
// net.http_post → this function). Keeps, per user:
//   - Daily:   the newest snapshot of each of the 5 most recent days
//   - Weekly:  the newest snapshot of each of the 4 most recent ISO weeks
//   - Monthly: the newest snapshot of each of the 3 most recent months
// The kept set is the union (≤ ~12/user); everything else is deleted from both
// Storage and the metadata table. Kept rows are re-labelled to the coarsest
// tier they satisfy (monthly > weekly > daily) — the daily→weekly→monthly
// "promotion" the spec describes.
//
// Safety rules (SEKEL-146):
//   - storage_path is client-written. An object is only removed if its path
//     is inside the row owner's folder (`${user_id}/...`). Rows pointing
//     anywhere else never take a keep slot, and only their metadata is
//     deleted; their storage_path is never touched. (New rows like that are
//     blocked by the backup_snapshots_storage_path_owner_check constraint.)
//   - If removing the files fails, the matching rows are kept so the next run
//     retries. Deleting them would leave the files orphaned and invisible.
//   - Every row is read (paged past the PostgREST max_rows cap) before
//     anything is deleted.
//
// Auth: cron sends `x-cron-secret: <CRON_SECRET>`; deployed with --no-verify-jwt.
//
// Secrets (function env):
//   - CRON_SECRET                       shared secret matched against x-cron-secret
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { sharedSecretMatches } from '../_shared/security.ts';

const BUCKET = 'sekel-backups';
const KEEP = { daily: 5, weekly: 4, monthly: 3 } as const;
// Rows requested per page. The server may cap a page lower (max_rows); the
// loop only stops on an empty page, so a lower cap just means more pages.
const PAGE_SIZE = 1000;
// Batch size for storage.remove() and `id in (...)` deletes. Keeps request
// bodies and URLs well under Storage/PostgREST limits.
const DELETE_CHUNK = 100;

interface SnapshotRow {
    id: string;
    user_id: string;
    created_at: string;
    storage_path: string;
    generation: 'daily' | 'weekly' | 'monthly';
}

function dayKey(iso: string): string {
    return iso.slice(0, 10); // YYYY-MM-DD (created_at is stored/returned in UTC)
}

function monthKey(iso: string): string {
    return iso.slice(0, 7); // YYYY-MM
}

function isoWeekKey(iso: string): string {
    const d = new Date(iso);
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Shift to the Thursday of the current ISO week, then count weeks from Jan 4.
    const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(
        ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** From a newest-first list, the newest row for each of the `max` most-recent buckets. */
function newestPerBucket(rows: SnapshotRow[], keyFn: (iso: string) => string, max: number): SnapshotRow[] {
    const seen = new Set<string>();
    const out: SnapshotRow[] = [];
    for (const r of rows) {
        const k = keyFn(r.created_at);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(r);
            if (out.length >= max) break;
        }
    }
    return out;
}

/** True when the row's object lives inside its owner's folder in the bucket. */
function isOwnPath(row: SnapshotRow): boolean {
    return row.storage_path.startsWith(`${row.user_id}/`) && !row.storage_path.includes('..');
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Loads every snapshot row, grouped by user then newest first, with id as a
 * tiebreaker so offset paging is stable. Everything is read before anything
 * is deleted, because deleting while paging would shift later pages. Rows
 * seen twice (an insert landing mid-scan) are dropped by id.
 */
async function loadAllSnapshots(supabase: SupabaseClient): Promise<SnapshotRow[]> {
    const rows: SnapshotRow[] = [];
    const seen = new Set<string>();
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('backup_snapshots')
            .select('id,user_id,created_at,storage_path,generation')
            .order('user_id', { ascending: true })
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as SnapshotRow[];
        if (page.length === 0) break;
        for (const r of page) {
            if (!seen.has(r.id)) {
                seen.add(r.id);
                rows.push(r);
            }
        }
        from += page.length;
    }
    return rows;
}

Deno.serve(async (req) => {
    if (!(await sharedSecretMatches(req, 'x-cron-secret', Deno.env.get('CRON_SECRET')))) {
        return new Response('forbidden', { status: 403 });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Service role bypasses RLS so we can rotate every user's snapshots.
    let rows: SnapshotRow[];
    try {
        rows = await loadAllSnapshots(supabase);
    } catch (error) {
        console.error('failed to load snapshots', error);
        const message = (error as { message?: string })?.message ?? String(error);
        return new Response(JSON.stringify({ error: message }), { status: 500 });
    }

    const byUser = new Map<string, SnapshotRow[]>();
    for (const r of rows) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r); // rows arrive newest-first within each user
        byUser.set(r.user_id, list);
    }

    let deletedRows = 0;
    let deletedFiles = 0;
    let promoted = 0;
    let foreignRows = 0;
    let storageFailures = 0;

    for (const [userId, all] of byUser) {
        // A row whose path is outside the owner's folder (tampered, or written
        // before the CHECK constraint) can't be restored. RLS only lets a user
        // download from their own folder. So it never takes a keep slot.
        // Delete its metadata only; never touch its storage_path.
        const snaps = all.filter(isOwnPath);
        const foreign = all.filter((s) => !isOwnPath(s));
        if (foreign.length > 0) {
            console.warn('dropping snapshot rows whose storage_path is outside the owner folder', { userId, count: foreign.length });
            for (const ids of chunk(foreign.map((s) => s.id), DELETE_CHUNK)) {
                const del = await supabase.from('backup_snapshots').delete().in('id', ids);
                if (del.error) console.error('foreign row delete failed', { userId, error: del.error.message });
                else foreignRows += ids.length;
            }
        }

        const keep = new Map<string, SnapshotRow['generation']>();
        for (const s of newestPerBucket(snaps, monthKey, KEEP.monthly)) keep.set(s.id, 'monthly');
        for (const s of newestPerBucket(snaps, isoWeekKey, KEEP.weekly)) if (!keep.has(s.id)) keep.set(s.id, 'weekly');
        for (const s of newestPerBucket(snaps, dayKey, KEEP.daily)) if (!keep.has(s.id)) keep.set(s.id, 'daily');

        const toDelete = snaps.filter((s) => !keep.has(s.id));
        for (const batch of chunk(toDelete, DELETE_CHUNK)) {
            const rm = await supabase.storage.from(BUCKET).remove(batch.map((s) => s.storage_path));
            if (rm.error) {
                // Keep the rows: the next run retries this batch. Deleting them
                // now would orphan the files with nothing left pointing at them.
                storageFailures++;
                console.error('storage remove failed; keeping rows for retry', { userId, error: rm.error.message });
                continue;
            }
            deletedFiles += batch.length;
            const ids = batch.map((s) => s.id);
            const del = await supabase.from('backup_snapshots').delete().in('id', ids);
            if (del.error) console.error('row delete failed', { userId, error: del.error.message });
            else deletedRows += ids.length;
        }

        // Re-label kept rows whose tier changed (daily → weekly → monthly).
        const changed = [...keep.entries()].filter(([id, gen]) => {
            const cur = snaps.find((s) => s.id === id);
            return cur && cur.generation !== gen;
        });
        for (const [id, gen] of changed) {
            const upd = await supabase.from('backup_snapshots').update({ generation: gen }).eq('id', id);
            if (upd.error) console.error('generation update failed', upd.error);
            else promoted++;
        }
    }

    const summary = {
        ok: true,
        users: byUser.size,
        snapshots: rows.length,
        deletedRows,
        deletedFiles,
        promoted,
        foreignRows,
        storageFailures,
    };
    console.log('prune-backups complete', summary);
    return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});
