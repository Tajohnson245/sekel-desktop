import { app } from 'electron';
import { instrumentedHandle } from '@sekel/observability';
import * as cloudBackup from '../main/backup/cloudBackup';
import { restoreCloudSnapshot } from '../main/backup/cloudRestore';
import type { CloudBackupSession } from '../main/backup/cloudTypes';
import { nudgeSync } from '../main/sync/service';

export function setupCloudBackupHandlers(): void {
    // Renderer pushes its Supabase session so main can write as the user
    // (cloud backups and cloud sync both use it). A new session — sign-in or
    // token refresh — is also the moment to sync.
    instrumentedHandle('cloudBackup:setSession', (_e, session: CloudBackupSession | null) => {
        cloudBackup.setSession(session);
        nudgeSync();
    });

    instrumentedHandle('cloudBackup:clearSession', () => {
        cloudBackup.clearSession();
        nudgeSync();
    });

    // Cheap per-review ping: increments the counter, fires at the threshold.
    instrumentedHandle('cloudBackup:requestCheck', (_e, reviewDelta?: number) => {
        cloudBackup.requestBackupCheck(typeof reviewDelta === 'number' ? reviewDelta : 1);
    });

    // Manual "back up now" (bypasses the hourly cap).
    instrumentedHandle('cloudBackup:snapshotNow', () =>
        cloudBackup.triggerBackupSnapshot('manual'));

    // Restore UI.
    instrumentedHandle('cloudBackup:list', () =>
        cloudBackup.listCloudSnapshots());

    instrumentedHandle('cloudBackup:restore', (_e, snapshotId: string) =>
        restoreCloudSnapshot(snapshotId));

    // Relaunch after a restore so all in-memory state (React Query, stores)
    // matches the freshly restored database.
    instrumentedHandle('cloudBackup:restart', () => {
        app.relaunch();
        app.exit(0);
    });
}
