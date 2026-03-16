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
): Promise<MediaExtractionResult> {
    const entries = Object.entries(mediaMap);

    if (entries.length === 0) {
        return { extracted: 0, skipped: 0, warnings: [], mediaRecords: [] };
    }

    const mediaDir = path.join(app.getPath('userData'), 'media');
    await mkdir(mediaDir, { recursive: true });

    let extracted = 0;
    let skipped = 0;
    const warnings: string[] = [];
    const mediaRecords = [];

    for (const [numericKey, originalFilename] of entries) {
        const sourcePath = path.join(tempDir, numericKey);

        if (!existsSync(sourcePath)) {
            warnings.push(
                `[media] File missing from archive: key "${numericKey}" → "${originalFilename}"`,
            );
            continue;
        }

        const buffer = await readFile(sourcePath);
        const sha1 = createHash('sha1').update(buffer).digest('hex');

        const existing = fetchMediaByHash(userId, sha1);
        if (existing) {
            mediaRecords.push(existing);
            skipped++;
            console.log(`[media] Deduplicated: "${originalFilename}" (hash ${sha1.slice(0, 8)}…)`);
            continue;
        }

        const ext = path.extname(originalFilename);
        const destPath = path.join(mediaDir, sha1 + ext);

        await copyFile(sourcePath, destPath);

        const record = createMedia({
            user_id: userId,
            filename: originalFilename,
            file_path: destPath,
            file_hash: sha1,
            file_size: buffer.length,
            mime_type: getMimeType(originalFilename),
            import_id: importId,
        });

        mediaRecords.push(record);
        extracted++;
    }

    return { extracted, skipped, warnings, mediaRecords };
}
