import { app } from 'electron';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createMedia, fetchMediaByHash } from '../db/service';
import type { MediaExtractionResult } from './types';

const MIME_MAP: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
};

function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return MIME_MAP[ext] ?? 'application/octet-stream';
}

export type MediaProgressCallback = (processed: number, total: number) => void;

/** Read a file and compute its SHA1 hash in one pass. */
async function readAndHash(filePath: string): Promise<{ buffer: Buffer; sha1: string }> {
    const buffer = await readFile(filePath);
    const sha1 = createHash('sha1').update(buffer).digest('hex');
    return { buffer, sha1 };
}

/**
 * Phase 5: Extract media files from a .apkg temp directory into permanent storage.
 *
 * For each entry in mediaMap:
 *   - Reads the numbered file (e.g. "0") from tempDir
 *   - Computes SHA1 hash for deduplication
 *   - Copies to {userData}/media/{sha1}{ext} if not already present for this user
 *   - Inserts a record into the media table
 *
 * Missing numbered files produce a warning but do not abort the import.
 * An empty mediaMap returns immediately with zero counts.
 */
export async function extractMedia(
    tempDir: string,
    mediaMap: Record<string, string>,
    userId: string,
    importId: string,
    onProgress?: MediaProgressCallback,
): Promise<MediaExtractionResult> {
    const entries = Object.entries(mediaMap);

    if (entries.length === 0) {
        return { extracted: 0, skipped: 0, warnings: [], mediaRecords: [] };
    }

    const mediaDir = path.join(app.getPath('userData'), 'media');
    await mkdir(mediaDir, { recursive: true });

    let extracted = 0;
    let skipped = 0;
    let processed = 0;
    const warnings: string[] = [];
    const mediaRecords = [];

    // Report progress every N files (more frequently for small batches)
    const reportInterval = entries.length < 50 ? 1 : 10;

    // Process files in batches of 5 for parallel I/O
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);

        // Phase 1: Read + hash files in parallel
        const readResults = await Promise.all(
            batch.map(async ([numericKey, originalFilename]) => {
                const sourcePath = path.join(tempDir, numericKey);

                if (!existsSync(sourcePath)) {
                    return { numericKey, originalFilename, missing: true as const };
                }

                const { buffer, sha1 } = await readAndHash(sourcePath);
                return { numericKey, originalFilename, missing: false as const, buffer, sha1 };
            }),
        );

        // Phase 2: DB writes + file copies (sequential — SQLite is single-writer)
        for (const item of readResults) {
            if (item.missing) {
                warnings.push(
                    `[media] File missing from archive: key "${item.numericKey}" → "${item.originalFilename}"`,
                );
                processed++;
                continue;
            }

            const existing = fetchMediaByHash(userId, item.sha1);
            if (existing) {
                mediaRecords.push(existing);
                skipped++;
                processed++;
                continue;
            }

            const ext = path.extname(item.originalFilename);
            const destPath = path.join(mediaDir, item.sha1 + ext);

            await copyFile(
                path.join(tempDir, item.numericKey),
                destPath,
            );

            const record = createMedia({
                user_id: userId,
                filename: item.originalFilename,
                file_path: destPath,
                file_hash: item.sha1,
                file_size: item.buffer.length,
                mime_type: getMimeType(item.originalFilename),
                import_id: importId,
            });

            mediaRecords.push(record);
            extracted++;
            processed++;
        }

        // Report progress at configured interval
        if (processed % reportInterval === 0 || processed === entries.length) {
            onProgress?.(processed, entries.length);
        }
    }

    return { extracted, skipped, warnings, mediaRecords };
}
