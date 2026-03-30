import { instrumentedHandle } from '@sekel/observability';
import * as backupService from '../main/backup/service';
import { restoreFromBackup } from '../main/backup/restore';

export function setupBackupHandlers(): void {
    instrumentedHandle('backup:list', () =>
        backupService.listBackups());

    instrumentedHandle('backup:create', () =>
        backupService.createBackup());

    instrumentedHandle('backup:restore', (_e, filePath: string) =>
        restoreFromBackup(filePath));

    instrumentedHandle('backup:delete', (_e, filename: string) =>
        backupService.deleteBackup(filename));

    instrumentedHandle('backup:getTotalSize', () =>
        backupService.getBackupsTotalSize());
}
