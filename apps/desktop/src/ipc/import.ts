import { ipcMain, dialog } from 'electron';
import { processApkgFile } from '../main/import/apkg';
import { parseAnkiDatabase } from '../main/import/parser';
import { buildImportSummary } from '../main/import/summaryBuilder';
import { executeImport } from '../main/import/insertionEngine';
import { fetchDecksByAnkiIds } from '../main/db/service';
import type {
    AnkiCollection,
    ImportSummary,
    ImportOptionsPayload,
} from '../main/import/types';
import type { ImportResult } from '../types/electron';

// In-memory cache: tempDir → AnkiCollection.
// Populated by import:get-summary and consumed by import:confirm.
// Entries linger until import:confirm fires or the app restarts (stale entries
// are harmless; cleanupStaleTempDirs handles the disk side on next launch).
const collectionCache = new Map<string, AnkiCollection>();

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

    // Parses the Anki database, caches the AnkiCollection, performs conflict detection,
    // and returns a renderer-safe ImportSummary (no Maps, fully JSON-serializable).
    ipcMain.handle(
        'import:get-summary',
        async (
            _event,
            args: {
                dbFilePath: string;
                mediaMap: Record<string, string>;
                mediaFilePaths: string[];
                userId: string;
                tempDir: string;
            },
        ): Promise<ImportSummary> => {
            const collection = await parseAnkiDatabase(args.dbFilePath);

            // Cache the collection keyed by tempDir for retrieval in import:confirm
            collectionCache.set(args.tempDir, collection);

            // Conflict detection: find SEKEL decks that share an anki_id with this import
            const ankiDeckIds = Array.from(collection.decks.values())
                .filter(d => d.id !== 1)
                .map(d => d.id);
            const existingDecks = fetchDecksByAnkiIds(args.userId, ankiDeckIds);

            return buildImportSummary(collection, args.mediaMap, existingDecks);
        },
    );

    // Receives ImportOptionsPayload from the renderer, enriches it with the cached
    // AnkiCollection, runs Phase 6 insertion, and returns counts to the renderer.
    ipcMain.handle(
        'import:confirm',
        async (_event, payload: ImportOptionsPayload): Promise<ImportResult> => {
            const collection = collectionCache.get(payload.tempDir);
            if (!collection) {
                throw new Error(
                    '[import] No cached collection found for tempDir. ' +
                    'Was import:get-summary called first?',
                );
            }
            // Consume the cache entry — this is the only place collection is used
            collectionCache.delete(payload.tempDir);
            return executeImport(
                { ...payload, parsedData: collection },
                payload.userId,
            );
        },
    );
}
