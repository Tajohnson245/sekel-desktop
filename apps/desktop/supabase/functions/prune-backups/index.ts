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
// Auth: cron sends `x-cron-secret: <CRON_SECRET>`; deployed with --no-verify-jwt.
//
// Secrets (function env):
//   - CRON_SECRET                       shared secret matched against x-cron-secret
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const BUCKET = 'sekel-backups';
const KEEP = { daily: 5, weekly: 4, monthly: 3 } as const;

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

Deno.serve(async (req) => {
    const expected = Deno.env.get('CRON_SECRET');
    if (!expected || req.headers.get('x-cron-secret') !== expected) {
        return new Response('forbidden', { status: 403 });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Service role bypasses RLS so we can rotate every user's snapshots.
    const { data, error } = await supabase
        .from('backup_snapshots')
        .select('id,user_id,created_at,storage_path,generation')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('failed to load snapshots', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const rows = (data ?? []) as SnapshotRow[];
    const byUser = new Map<string, SnapshotRow[]>();
    for (const r of rows) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r); // preserves the global newest-first order within each user
        byUser.set(r.user_id, list);
    }

    let deletedRows = 0;
    let deletedFiles = 0;
    let promoted = 0;

    for (const [, snaps] of byUser) {
        const keep = new Map<string, SnapshotRow['generation']>();
        for (const s of newestPerBucket(snaps, monthKey, KEEP.monthly)) keep.set(s.id, 'monthly');
        for (const s of newestPerBucket(snaps, isoWeekKey, KEEP.weekly)) if (!keep.has(s.id)) keep.set(s.id, 'weekly');
        for (const s of newestPerBucket(snaps, dayKey, KEEP.daily)) if (!keep.has(s.id)) keep.set(s.id, 'daily');

        const toDelete = snaps.filter((s) => !keep.has(s.id));
        if (toDelete.length > 0) {
            const paths = toDelete.map((s) => s.storage_path);
            const ids = toDelete.map((s) => s.id);
            const rm = await supabase.storage.from(BUCKET).remove(paths);
            if (rm.error) console.error('storage remove failed', rm.error);
            else deletedFiles += paths.length;
            const del = await supabase.from('backup_snapshots').delete().in('id', ids);
            if (del.error) console.error('row delete failed', del.error);
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

    const summary = { ok: true, users: byUser.size, snapshots: rows.length, deletedRows, deletedFiles, promoted };
    console.log('prune-backups complete', summary);
    return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});
