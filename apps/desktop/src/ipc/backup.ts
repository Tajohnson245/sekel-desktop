import { app } from 'electron';
import { instrumentedHandle } from '@sekel/observability';
import * as backupService from '../main/backup/service';
import { restoreBackupByFilename } from '../main/backup/restore';

export function setupBackupHandlers(): void {
    instrumentedHandle('backup:list', () =>
        backupService.listBackups());

    instrumentedHandle('backup:create', () =>
        backupService.createBackup('manual'));

    // Takes a backup FILENAME (from backup:list), never a path — it is resolved
    // inside the backup directory by restoreBackupByFilename.
    instrumentedHandle('backup:restore', (_e, filename: string) =>
        restoreBackupByFilename(filename));

    instrumentedHandle('backup:delete', (_e, filename: string) =>
        backupService.deleteBackup(filename));

    instrumentedHandle('backup:getTotalSize', () =>
        backupService.getBackupsTotalSize());

    // Relaunch after a restore so all in-memory state (React Query, stores)
    // matches the freshly restored database.
    instrumentedHandle('backup:restart', () => {
        app.relaunch();
        app.exit(0);
    });
}
