import { ipcMain, dialog } from 'electron';
import { processApkgFile } from '../main/import/apkg';

export function setupImportHandlers(): void {
    // Opens native file dialog filtered to .apkg — returns selected path or null if cancelled
    ipcMain.handle('import:select-file', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Import Anki Deck',
            filters: [{ name: 'Anki Package', extensions: ['apkg'] }],
            properties: ['openFile'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // Runs the full extraction + format detection + validation pipeline for a given .apkg path
    ipcMain.handle('import:process-apkg', async (_event, filePath: string) => {
        return processApkgFile(filePath);
    });
}
