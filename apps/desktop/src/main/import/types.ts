export type AnkiFormat = 'legacy2' | 'legacy1';

export interface ApkgImportResult {
    /** Resolved format version of the package. */
    format: AnkiFormat;
    /** Absolute path to the extracted Anki SQLite database file. */
    dbFilePath: string;
    /** Parsed contents of the media JSON: numeric string key → original filename. */
    mediaMap: Record<string, string>;
    /** Absolute disk paths of every extracted media file (parallel to mediaMap keys). */
    mediaFilePaths: string[];
    /** Non-fatal warnings (e.g. missing media file). */
    warnings: string[];
    /**
     * Absolute path to the temp extraction directory.
     * Phase 3 must clean this up via fs.rm(tempDir, { recursive: true }) when done.
     */
    tempDir: string;
}

/** Thrown when the ZIP contains collection.anki21b (requires Anki's proprietary backend). */
export class UnsupportedFormatError extends Error {
    constructor() {
        super(
            "This deck uses a newer Anki format. Please re-export from Anki with " +
            "'Support older Anki versions' checked and try again."
        );
        this.name = 'UnsupportedFormatError';
    }
}

/** Thrown when the ZIP contains none of the recognised Anki database filenames. */
export class InvalidApkgError extends Error {
    constructor(detail?: string) {
        super(
            "This doesn't appear to be a valid Anki deck file." +
            (detail ? ' ' + detail : '')
        );
        this.name = 'InvalidApkgError';
    }
}

/** Thrown when yauzl cannot open or read the ZIP archive. */
export class CorruptedZipError extends Error {
    constructor(cause?: string) {
        super(
            'The .apkg file appears to be corrupted and could not be opened.' +
            (cause ? ' ' + cause : '')
        );
        this.name = 'CorruptedZipError';
    }
}

/** Thrown when the extracted SQLite database is missing one or more required tables. */
export class ValidationError extends Error {
    constructor(missingTables: string[]) {
        super(`The Anki database is missing required tables: ${missingTables.join(', ')}.`);
        this.name = 'ValidationError';
    }
}
