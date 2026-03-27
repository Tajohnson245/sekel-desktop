import { ipcMain } from 'electron';
import * as backupService from '../main/backup/service';
import { restoreFromBackup } from '../main/backup/restore';

export function setupBackupHandlers(): void {
    ipcMain.handle('backup:list', () =>
        backupService.listBackups());

    ipcMain.handle('backup:create', () =>
        backupService.createBackup());

    ipcMain.handle('backup:restore', (_e, filePath: string) =>
        restoreFromBackup(filePath));

    ipcMain.handle('backup:delete', (_e, filename: string) =>
        backupService.deleteBackup(filename));

    ipcMain.handle('backup:getSettings', () =>
        backupService.getBackupSettings());

    ipcMain.handle('backup:updateSettings', (_e, settings: Partial<backupService.BackupSettings>) => {
        backupService.updateBackupSettings(settings);
        return backupService.getBackupSettings();
    });

    ipcMain.handle('backup:getTotalSize', () =>
        backupService.getBackupsTotalSize());
}
