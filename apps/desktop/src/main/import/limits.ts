/**
 * Size limits for import operations.
 *
 * Prevents denial-of-service via oversized archives, zip bombs,
 * or excessively large individual files.
 */

/** Maximum on-disk archive size before we even attempt to read it (500 MB). */
export const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

/** Maximum cumulative decompressed size across all ZIP entries (2 GB). */
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

/** Maximum size of a single media file (100 MB). */
export const MAX_SINGLE_FILE_BYTES = 100 * 1024 * 1024;

/** Maximum size of a single JSON file inside a .spkg archive (200 MB). */
export const MAX_JSON_BYTES = 200 * 1024 * 1024;

/** Maximum number of entries (files) in a ZIP archive. */
export const MAX_ENTRY_COUNT = 1_000_000;

export class ImportSizeLimitError extends Error {
    constructor(detail: string) {
        super(`Import size limit exceeded: ${detail}`);
        this.name = 'ImportSizeLimitError';
    }
}

/**
 * Checks file size on disk before reading.
 * Throws ImportSizeLimitError if the file exceeds MAX_ARCHIVE_BYTES.
 */
export function assertArchiveSize(fileSize: number, filename: string): void {
    if (fileSize > MAX_ARCHIVE_BYTES) {
        const sizeMB = Math.round(fileSize / (1024 * 1024));
        const limitMB = Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024));
        throw new ImportSizeLimitError(
            `Archive "${filename}" is ${sizeMB} MB, which exceeds the ${limitMB} MB limit.`,
        );
    }
}

/**
 * Checks a raw JSON string length before parsing.
 * Throws ImportSizeLimitError if the string exceeds MAX_JSON_BYTES.
 */
export function assertJsonSize(raw: string, jsonFile: string): void {
    if (raw.length > MAX_JSON_BYTES) {
        const sizeMB = Math.round(raw.length / (1024 * 1024));
        const limitMB = Math.round(MAX_JSON_BYTES / (1024 * 1024));
        throw new ImportSizeLimitError(
            `"${jsonFile}" is ${sizeMB} MB, which exceeds the ${limitMB} MB limit.`,
        );
    }
}

/**
 * Checks a single media file size.
 * Throws ImportSizeLimitError if it exceeds MAX_SINGLE_FILE_BYTES.
 */
export function assertMediaFileSize(size: number, filename: string): void {
    if (size > MAX_SINGLE_FILE_BYTES) {
        const sizeMB = Math.round(size / (1024 * 1024));
        const limitMB = Math.round(MAX_SINGLE_FILE_BYTES / (1024 * 1024));
        throw new ImportSizeLimitError(
            `Media file "${filename}" is ${sizeMB} MB, which exceeds the ${limitMB} MB limit.`,
        );
    }
}
