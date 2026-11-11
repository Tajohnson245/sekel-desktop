import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import Database from 'better-sqlite3';
import {
    type AnkiFormat,
    type ApkgImportResult,
    CorruptedZipError,
    InvalidApkgError,
    UnsupportedFormatError,
    ValidationError,
} from './types';
import { makeTempDirPath, removeTempDir } from './tempCleanup';
import {
    assertArchiveSize,
    ImportSizeLimitError,
    MAX_DECOMPRESSED_BYTES,
    MAX_ENTRY_COUNT,
} from './limits';

const ANKI_DB_FILES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'] as const;
type AnkiDbFilename = typeof ANKI_DB_FILES[number];

const REQUIRED_TABLES = ['col', 'notes', 'cards', 'revlog'] as const;

/**
 * Top-level entry point called by the IPC handler.
 * Creates a temp dir, extracts the .apkg, detects format, validates the DB,
 * parses the media map, and returns the result with tempDir preserved for Phase 3.
 * On any error the temp dir is cleaned up before rethrowing.
 */
export async function processApkgFile(apkgPath: string): Promise<ApkgImportResult> {
    // Size check before extraction
    const stat = fs.statSync(apkgPath);
    assertArchiveSize(stat.size, path.basename(apkgPath));

    const tempDir = makeTempDirPath();
    await fsPromises.mkdir(tempDir, { recursive: true });

    try {
        const extractedFiles = await extractApkg(apkgPath, tempDir);
        const { format, dbFilename } = detectFormat(extractedFiles);
        const dbFilePath = path.join(tempDir, dbFilename);
        validateAnkiDb(dbFilePath);
        const { mediaMap, mediaFilePaths, warnings } = await parseMediaFile(tempDir, extractedFiles);

        return { format, dbFilePath, mediaMap, mediaFilePaths, warnings, tempDir };
    } catch (err) {
        await removeTempDir(tempDir);
        throw err;
    }
}

/**
 * Extracts all entries from the .apkg ZIP into destDir using yauzl (streaming).
 * Returns the set of filenames that were written to disk.
 */
async function extractApkg(apkgPath: string, destDir: string): Promise<Set<string>> {
    const extractedFiles = new Set<string>();

    await new Promise<void>((resolve, reject) => {
        yauzl.open(apkgPath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) {
                return reject(new CorruptedZipError(err?.message));
            }

            let entryCount = 0;
            let decompressedBytes = 0;

            zipfile.readEntry();

            zipfile.on('entry', (entry: yauzl.Entry) => {
                // Skip directory entries
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                // Enforce entry count limit
                entryCount++;
                if (entryCount > MAX_ENTRY_COUNT) {
                    zipfile.close();
                    return reject(new ImportSizeLimitError(
                        `Archive has more than ${MAX_ENTRY_COUNT} entries.`,
                    ));
                }

                // Track cumulative decompressed size
                decompressedBytes += entry.uncompressedSize;
                if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
                    zipfile.close();
                    return reject(new ImportSizeLimitError(
                        'Cumulative decompressed size exceeds the 2 GB limit.',
                    ));
                }

                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr || !readStream) {
                        return reject(streamErr ?? new Error('Failed to open read stream'));
                    }

                    const destPath = path.join(destDir, path.basename(entry.fileName));
                    const writeStream = fs.createWriteStream(destPath);

                    readStream.pipe(writeStream);

                    writeStream.on('finish', () => {
                        extractedFiles.add(entry.fileName);
                        zipfile.readEntry();
                    });

                    writeStream.on('error', reject);
                    readStream.on('error', reject);
                });
            });

            zipfile.on('end', resolve);
            zipfile.on('error', (zipErr) => reject(new CorruptedZipError(zipErr.message)));
        });
    });

    return extractedFiles;
}

/**
 * Inspects the set of extracted filenames and determines the Anki format.
 * Throws UnsupportedFormatError for anki21b.
 * Throws InvalidApkgError if no recognised DB file is present.
 */
export function detectFormat(extractedFiles: Set<string>): { format: AnkiFormat; dbFilename: AnkiDbFilename } {
    for (const filename of ANKI_DB_FILES) {
        if (extractedFiles.has(filename)) {
            if (filename === 'collection.anki21b') {
                throw new UnsupportedFormatError();
            }
            const format: AnkiFormat = filename === 'collection.anki21' ? 'legacy2' : 'legacy1';
            return { format, dbFilename: filename };
        }
    }
    throw new InvalidApkgError('No collection.anki21 or collection.anki2 database found.');
}

/**
 * Opens the extracted Anki SQLite file read-only with better-sqlite3,
 * checks for the four required tables, and closes the handle before returning.
 * Throws ValidationError listing any missing tables.
 */
export function validateAnkiDb(dbPath: string): void {
    const db = new Database(dbPath, { readonly: true });
    try {
        const rows = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as { name: string }[];
        const existingTables = new Set(rows.map(r => r.name));
        const missing = REQUIRED_TABLES.filter(t => !existingTables.has(t));
        if (missing.length > 0) {
            throw new ValidationError(missing);
        }
    } finally {
        db.close();
    }
}

/** Anki names extracted media entries by a plain decimal index ("0", "1", ...). */
const MEDIA_KEY_RE = /^\d+$/;

/**
 * True when `key` is a safe extracted-media entry name. Keys are joined onto the
 * temp dir to locate the source file, so anything but digits could escape it
 * (e.g. "..\\..\\Pictures\\id.jpg").
 */
export function isSafeMediaKey(key: string): boolean {
    return MEDIA_KEY_RE.test(key);
}

/**
 * True when `filename` is a plain file name with no path components. The
 * original filename only ever names the media file inside the card; it must
 * never carry separators, parent-dir segments, drive/stream colons, or NULs.
 */
export function isSafeMediaFilename(filename: unknown): filename is string {
    return typeof filename === 'string'
        && filename.length > 0
        && !/[/\\:\0]/.test(filename)
        && !filename.includes('..');
}

/**
 * Reads and parses the "media" JSON file from destDir.
 * Returns an empty map with a warning if the file is absent — does not fail.
 * Entries with an unsafe key or filename are dropped with a warning.
 */
export async function parseMediaFile(
    destDir: string,
    extractedFiles: Set<string>,
): Promise<{ mediaMap: Record<string, string>; mediaFilePaths: string[]; warnings: string[] }> {
    const warnings: string[] = [];

    if (!extractedFiles.has('media')) {
        warnings.push('No media file found in .apkg; this deck may have no media.');
        return { mediaMap: {}, mediaFilePaths: [], warnings };
    }

    let parsed: unknown;
    try {
        const raw = await fsPromises.readFile(path.join(destDir, 'media'), 'utf-8');
        parsed = JSON.parse(raw);
    } catch {
        parsed = undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        warnings.push('The media file in this .apkg could not be parsed; media will be skipped.');
        return { mediaMap: {}, mediaFilePaths: [], warnings };
    }

    const mediaMap: Record<string, string> = {};
    let rejected = 0;
    for (const [key, filename] of Object.entries(parsed as Record<string, unknown>)) {
        if (isSafeMediaKey(key) && isSafeMediaFilename(filename)) {
            mediaMap[key] = filename;
        } else {
            rejected++;
        }
    }
    if (rejected > 0) {
        warnings.push(
            `${rejected} media entr${rejected === 1 ? 'y' : 'ies'} in this .apkg had an invalid name and will be skipped.`,
        );
    }

    const mediaFilePaths = Object.keys(mediaMap).map(key => path.join(destDir, key));

    return { mediaMap, mediaFilePaths, warnings };
}
