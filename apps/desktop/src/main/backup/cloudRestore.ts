/**
 * Cloud restore — downloads a snapshot from Supabase Storage and replaces the
 * local database with it, reusing the safe local restore flow (safety backup →
 * close → overwrite → reopen). The renderer restarts the app afterwards.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createLogger, consoleTransport, metrics } from '@sekel/observability';
// Type-only (erased): main never require()s @sekel/db at runtime — see cloudBackup.ts.
import type { BackupSnapshot } from '@sekel/db';
import { restoreFromBackup } from './restore';
import { getAuthedClient } from './cloudClient';
import * as state from './cloudState';
import type { CloudRestoreResult } from './cloudTypes';

const log = createLogger({ module: 'cloud-restore', transports: [consoleTransport] });

const BUCKET = 'sekel-backups';
// SQLite files begin with this 15-byte printable magic prefix; a cheap guard against
// restoring a truncated/garbage download over the live database.
const SQLITE_MAGIC = 'SQLite format 3';

export async function restoreCloudSnapshot(snapshotId: string): Promise<CloudRestoreResult> {
    const session = state.getSession();
    if (!session) return { success: false, error: 'Not signed in' };

    let tmpPath: string | null = null;
    try {
        const client = await getAuthedClient(session);

        // Resolve the storage path from the row (list is small — ≤ a handful).
        const { data: listData, error: listError } = await client
            .from('backup_snapshots')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (listError) throw listError;
        const rows = (listData ?? []) as BackupSnapshot[];
        const row = rows.find((r) => r.id === snapshotId);
        if (!row) return { success: false, error: 'Snapshot not found' };

        // Download the bytes (RLS restricts this to the user's own folder).
        const { data, error } = await client.storage.from(BUCKET).download(row.storage_path);
        if (error || !data) {
            return { success: false, error: `Download failed: ${error?.message ?? 'no data'}` };
        }
        const buf = Buffer.from(await data.arrayBuffer());

        if (buf.byteLength < SQLITE_MAGIC.length || buf.toString('utf8', 0, SQLITE_MAGIC.length) !== SQLITE_MAGIC) {
            return { success: false, error: 'Downloaded file is not a valid SQLite database' };
        }

        tmpPath = path.join(app.getPath('temp'), `sekel-restore-${snapshotId}.sqlite`);
        fs.writeFileSync(tmpPath, buf);

        // Reuse the battle-tested local restore (creates a safety backup first).
        const result = await restoreFromBackup(tmpPath);
        if (result.success) {
            metrics.increment('cloud_backup.restore_success_total');
            log.info('Cloud snapshot restored', { snapshotId, bytes: buf.byteLength });
        } else {
            metrics.increment('cloud_backup.restore_failure_total');
            log.error('Cloud restore failed', { snapshotId, error: result.error });
        }
        return {
            success: result.success,
            error: result.error,
            safetyBackup: result.safetyBackup?.filename,
        };
    } catch (err) {
        metrics.increment('cloud_backup.restore_failure_total');
        const message = err instanceof Error ? err.message : String(err);
        log.error('Cloud restore threw', { snapshotId, error: message });
        return { success: false, error: message };
    } finally {
        try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* best effort */ }
    }
}
