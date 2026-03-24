import { ipcMain, dialog, WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../main/db/index';
import { processApkgFile } from '../main/import/apkg';
import { parseAnkiDatabase } from '../main/import/parser';
import { buildImportSummary } from '../main/import/summaryBuilder';
import { executeImport } from '../main/import/insertionEngine';
import { extractMedia } from '../main/import/media';
import { removeTempDir } from '../main/import/tempCleanup';
import { fetchDecksByAnkiIds } from '../main/db/service';
import type {
    AnkiCollection,
    ImportSummary,
    ImportOptionsPayload,
} from '../main/import/types';
import { CancelledError } from '../main/import/types';
import type { ImportProgress, ImportResult, ImportStage } from '../types/electron';

// In-memory cache: tempDir → AnkiCollection.
// Populated by import:get-summary and consumed by import:confirm.
const collectionCache = new Map<string, AnkiCollection>();

// Cancellation flags: tempDir → cancelled. Set by import:cancel handler.
const cancellationFlags = new Map<string, boolean>();

function sendProgress(sender: WebContents, progress: ImportProgress): void {
    if (!sender.isDestroyed()) sender.send('import:progress', progress);
}

function checkCancelled(tempDir: string): void {
    if (cancellationFlags.get(tempDir)) throw new CancelledError();
}

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
            collectionCache.set(args.tempDir, collection);

            const ankiDeckIds = Array.from(collection.decks.values())
                .filter(d => d.id !== 1)
                .map(d => d.id);
            const existingDecks = fetchDecksByAnkiIds(args.userId, ankiDeckIds);

            return buildImportSummary(collection, args.mediaMap, existingDecks);
        },
    );

    // Cancels an in-progress import for a given tempDir.
    ipcMain.handle('import:cancel', (_event, tempDir: string) => {
        cancellationFlags.set(tempDir, true);
    });

    // Receives ImportOptionsPayload from the renderer, runs Phases 5 & 6,
    // emits progress events, and returns counts. Cleans up temp dir in finally.
    ipcMain.handle(
        'import:confirm',
        async (event, payload: ImportOptionsPayload): Promise<ImportResult> => {
            const collection = collectionCache.get(payload.tempDir);
            if (!collection) {
                throw new Error(
                    '[import] No cached collection found for tempDir. ' +
                    'Was import:get-summary called first?',
                );
            }
            collectionCache.delete(payload.tempDir);
            cancellationFlags.set(payload.tempDir, false);

            const importId = randomUUID();
            const mediaCount = Object.keys(payload.mediaMap).length;

            let mediaResult: Awaited<ReturnType<typeof extractMedia>> | null = null;
            let insertResult: ReturnType<typeof executeImport> | null = null;

            try {
                // Phase 5: media extraction with granular progress
                checkCancelled(payload.tempDir);
                sendProgress(event.sender, {
                    stage: 'extracting-media',
                    detail: mediaCount > 0
                        ? `Extracting ${mediaCount} media file${mediaCount !== 1 ? 's' : ''}`
                        : undefined,
                    percent: 5,
                });

                mediaResult = await extractMedia(
                    payload.tempDir,
                    payload.mediaMap,
                    payload.userId,
                    importId,
                    (processed, total) => {
                        // Map media progress to 5–30% range
                        const percent = total > 0
                            ? 5 + Math.round((processed / total) * 25)
                            : 5;
                        sendProgress(event.sender, {
                            stage: 'extracting-media',
                            detail: `Extracting media... ${processed.toLocaleString()} / ${total.toLocaleString()}`,
                            percent: Math.min(percent, 30),
                        });
                    },
                );
                if (mediaResult.warnings.length > 0) {
                    console.warn('[import] Media extraction warnings:', mediaResult.warnings);
                }

                // Phase 6: data insertion with granular progress
                checkCancelled(payload.tempDir);

                insertResult = executeImport(
                    { ...payload, parsedData: collection },
                    payload.userId,
                    (stage, detail, percent) => {
                        checkCancelled(payload.tempDir);
                        sendProgress(event.sender, {
                            stage: stage as ImportStage,
                            detail,
                            percent,
                        });
                    },
                );

                sendProgress(event.sender, {
                    stage: 'cleaning-up',
                    percent: 95,
                });
            } catch (err) {
                // Roll back any media records inserted under this importId
                if (importId) {
                    try {
                        getDb().prepare('DELETE FROM media WHERE import_id = ?').run(importId);
                    } catch (cleanupErr) {
                        console.warn('[import] Failed to clean up media records:', cleanupErr);
                    }
                }
                throw err;
            } finally {
                cancellationFlags.delete(payload.tempDir);
                await removeTempDir(payload.tempDir);
            }

            sendProgress(event.sender, { stage: 'complete', percent: 100 });

            return {
                ...insertResult!,
                mediaExtracted: mediaResult!.extracted,
                mediaSkipped: mediaResult!.skipped,
                mediaWarnings: mediaResult!.warnings,
            };
        },
    );
}
