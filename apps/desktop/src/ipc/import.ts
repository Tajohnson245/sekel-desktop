import { app, dialog, WebContents } from 'electron';
import { instrumentedHandle } from '@sekel/observability';
import { randomUUID } from 'node:crypto';
import { getDb } from '../main/db/index';
import { processApkgFile } from '../main/import/apkg';
import { parseAnkiDatabase } from '../main/import/parser';
import { buildImportSummary } from '../main/import/summaryBuilder';
import { executeImport } from '../main/import/insertionEngine';
import { classifyCardsBatch } from './classify';
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

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Main-owned state for one in-flight .apkg import, keyed by the temp dir that
 * processApkgFile() created. The renderer echoes tempDir / dbFilePath / mediaMap
 * back to us, but those values are never trusted: tempDir is only used as a
 * lookup key into this map, and the DB path + media map come from here.
 */
interface ImportSession {
    dbFilePath: string;
    mediaMap: Record<string, string>;
    /** Populated by import:get-summary, consumed by import:confirm. */
    collection?: AnkiCollection;
    cachedAt: number;
}

// In-memory cache: tempDir → ImportSession (with TTL).
// Populated by import:process-apkg, extended by import:get-summary and
// consumed by import:confirm.
const importSessions = new Map<string, ImportSession>();

// Cancellation flags: tempDir → cancelled. Created by import:confirm,
// flipped by import:cancel.
const cancellationFlags = new Map<string, boolean>();

function sendProgress(sender: WebContents, progress: ImportProgress): void {
    if (!sender.isDestroyed()) sender.send('import:progress', progress);
}

function checkCancelled(tempDir: string): void {
    if (cancellationFlags.get(tempDir)) throw new CancelledError();
}

export function setupImportHandlers(): void {
    // Opens native file dialog filtered to .apkg — returns selected path or null if cancelled
    instrumentedHandle('import:select-file', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Import Anki Deck',
            filters: [{ name: 'Anki Package', extensions: ['apkg'] }],
            properties: ['openFile'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // Runs the full extraction + format detection + validation pipeline for a given .apkg path
    instrumentedHandle('import:process-apkg', async (_event, filePath: string) => {
        const result = await processApkgFile(filePath);
        importSessions.set(result.tempDir, {
            dbFilePath: result.dbFilePath,
            mediaMap: result.mediaMap,
            cachedAt: Date.now(),
        });
        return result;
    });

    // Parses the Anki database, caches the AnkiCollection, performs conflict detection,
    // and returns a renderer-safe ImportSummary (no Maps, fully JSON-serializable).
    // Only tempDir and userId are read from args; the DB path and media map are the
    // ones main cached in import:process-apkg.
    instrumentedHandle(
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
            const session = importSessions.get(args.tempDir);
            if (!session) {
                throw new Error(
                    '[import] Unknown import session. Was import:process-apkg called first?',
                );
            }
            const collection = await parseAnkiDatabase(session.dbFilePath);
            session.collection = collection;
            session.cachedAt = Date.now();

            try {
                const ankiDeckIds = Array.from(collection.decks.values())
                    .filter(d => d.id !== 1)
                    .map(d => d.id);
                const existingDecks = fetchDecksByAnkiIds(args.userId, ankiDeckIds);

                return buildImportSummary(collection, session.mediaMap, existingDecks);
            } catch (err) {
                session.collection = undefined;
                throw err;
            }
        },
    );

    // Cancels an in-progress import for a given tempDir. Only flips a flag that
    // import:confirm created, so arbitrary keys never accumulate.
    instrumentedHandle('import:cancel', (_event, tempDir: string) => {
        if (cancellationFlags.has(tempDir)) cancellationFlags.set(tempDir, true);
    });

    // Cleans up cached state and the temp directory for an abandoned import.
    // removeTempDir() refuses anything that isn't an import temp dir.
    instrumentedHandle('import:cleanup', async (_event, tempDir: string) => {
        importSessions.delete(tempDir);
        // An import:confirm still running for this dir owns its cleanup.
        if (cancellationFlags.has(tempDir)) return;
        await removeTempDir(tempDir);
    });

    // Receives ImportOptionsPayload from the renderer, runs Phases 5 & 6,
    // emits progress events, and returns counts. Cleans up temp dir in finally.
    // payload.mediaMap / mediaFilePaths are ignored in favour of main's cached map.
    instrumentedHandle(
        'import:confirm',
        async (event, payload: ImportOptionsPayload): Promise<ImportResult> => {
            const session = importSessions.get(payload.tempDir);
            if (!session?.collection) {
                throw new Error(
                    '[import] No cached collection found for tempDir. ' +
                    'Was import:get-summary called first?',
                );
            }
            importSessions.delete(payload.tempDir);
            const collection = session.collection;
            const mediaMap = session.mediaMap;
            cancellationFlags.set(payload.tempDir, false);

            const importId = randomUUID();
            const mediaCount = Object.keys(mediaMap).length;

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
                    mediaMap,
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
                    { ...payload, mediaMap, parsedData: collection },
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

            // Classify the freshly-imported cards against the user's primary exam so
            // plan coverage reflects them (imported cards were never classified before).
            // Fire-and-forget: never block or fail the import on classification.
            const { cardIds: importedCardIds, ...importCounts } = insertResult!;
            if (importedCardIds && importedCardIds.length > 0) {
                const examRow = getDb().prepare(`
                    SELECT be.exam_key FROM user_exam_profiles uep
                    JOIN blueprint_exams be ON be.id = uep.exam_id
                    WHERE uep.user_id = ? AND uep.is_primary = 1
                `).get(payload.userId) as { exam_key: string } | undefined;
                if (examRow) {
                    void classifyCardsBatch(importedCardIds, examRow.exam_key)
                        .catch(err => console.error('[import] post-import classification failed:', err));
                }
            }

            sendProgress(event.sender, { stage: 'complete', percent: 100 });

            return {
                ...importCounts,
                mediaExtracted: mediaResult!.extracted,
                mediaSkipped: mediaResult!.skipped,
                mediaWarnings: mediaResult!.warnings,
            };
        },
    );

    // Periodic sweep: evict cache entries older than CACHE_TTL_MS. Keys only ever
    // come from processApkgFile(), and removeTempDir() re-validates them anyway.
    const sweepInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of importSessions) {
            if (now - entry.cachedAt > CACHE_TTL_MS) {
                importSessions.delete(key);
                removeTempDir(key).catch(() => {});
            }
        }
    }, 60_000);

    app.on('will-quit', () => clearInterval(sweepInterval));
}
