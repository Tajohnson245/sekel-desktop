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

/** Thrown when the user cancels an in-progress import. */
export class CancelledError extends Error {
    constructor() {
        super('Import cancelled by user.');
        this.name = 'CancelledError';
    }
}

// ── Anki Parsed Data Types ────────────────────────────────────────────────────
// These represent Anki's raw data model as read from the SQLite database.
// They are NOT SEKEL database types — Phase 4 maps these into SEKEL's schema.

export interface AnkiFieldDef {
    ord: number;
    name: string;
    sticky: boolean;
    font: string;
    size: number;
}

export interface AnkiTemplate {
    ord: number;
    name: string;
    qfmt: string;
    afmt: string;
    bqfmt?: string;
    bafmt?: string;
}

export interface AnkiModel {
    id: number;
    name: string;
    flds: AnkiFieldDef[];
    tmpls: AnkiTemplate[];
    css: string;
    /** 0 = standard, 1 = cloze */
    type: number;
    mod: number;
}

export interface AnkiDeck {
    id: number;
    name: string;
    /** "A::B::C" split on "::" — preserves parent-child hierarchy for Phase 4. */
    nameComponents: string[];
    /** References an AnkiDeckConfig id. */
    conf: number;
    mod: number;
    collapsed: boolean;
}

export interface AnkiDeckConfig {
    id: number;
    name: string;
    new: { perDay: number; delays: number[]; order: number };
    rev: { perDay: number; ease4: number; ivlFct: number; maxIvl: number };
    lapse: { delays: number[]; leechAction: number; leechFails: number; minInt: number; mult: number };
}

export interface AnkiNote {
    id: number;
    guid: string;
    /** Model (note type) id — maps to AnkiModel.id. */
    mid: number;
    /** Field name → value, zipped from the model's flds definitions. */
    fields: Record<string, string>;
    /** Original \x1f-delimited string from the database. */
    rawFlds: string;
    tags: string[];
    mod: number;
}

export interface AnkiCard {
    id: number;
    /** Note id — maps to AnkiNote.id. */
    nid: number;
    /** Deck id — maps to AnkiDeck.id. */
    did: number;
    /** Template ordinal — maps to AnkiModel.tmpls[ord]. */
    ord: number;
    /** 0=new, 1=learning, 2=review, 3=relearning */
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    mod: number;
}

export interface AnkiReviewLog {
    /** Unix milliseconds — also serves as the primary key in Anki. */
    id: number;
    /** Card id — maps to AnkiCard.id. */
    cid: number;
    ease: number;
    ivl: number;
    lastIvl: number;
    factor: number;
    /** Time taken for the review in milliseconds. */
    time: number;
    /** 0=learn, 1=review, 2=relearn, 3=filtered */
    type: number;
}

export interface AnkiCollection {
    models: Map<number, AnkiModel>;
    decks: Map<number, AnkiDeck>;
    deckConfigs: Map<number, AnkiDeckConfig>;
    notes: Map<number, AnkiNote>;
    cards: AnkiCard[];
    revlog: AnkiReviewLog[];
    /** Non-fatal warnings, e.g. orphaned cards or notes with unknown model ids. */
    warnings: string[];
}

// ── Import Options Types ──────────────────────────────────────────────────────
// These are used for Phase 4 (user prompts) and consumed by Phase 6 (insertion).

export interface ImportSummaryDeck {
    ankiDeckId: number;
    name: string;
    nameComponents: string[];
    /** Number of Anki cards that belong directly to this deck. */
    cardCount: number;
    hasConflict: boolean;
    /** SEKEL deck UUID if a conflict was found. */
    existingDeckId?: string;
}

/** Renderer-facing summary sent via IPC. Fully JSON-serializable (no Maps). */
export interface ImportSummary {
    deckCount: number;
    noteTypeCount: number;
    noteCount: number;
    cardCount: number;
    reviewLogCount: number;
    mediaImageCount: number;
    mediaAudioCount: number;
    decks: ImportSummaryDeck[];
    noteTypeNames: string[];
    warnings: string[];
}

export interface ImportOptionsDeck {
    ankiDeckId: number;
    deckName: string;
    selected: boolean;
    scheduling: 'keep' | 'fresh';
    algorithm: 'fsrs' | 'sm2';
    conflict: 'skip' | 'overwrite' | 'merge' | null;
}

/** Sent renderer → main via import:confirm. Never includes AnkiCollection (not serializable). */
export interface ImportOptionsPayload {
    decks: ImportOptionsDeck[];
    /** How to handle the Anki deck hierarchy during import. */
    hierarchyMode: 'subdecks' | 'individual';
    mediaMap: Record<string, string>;
    mediaFilePaths: string[];
    /** tempDir from ApkgImportResult — used as cache key for AnkiCollection lookup. */
    tempDir: string;
    /** Sekel user id — needed by Phase 6 to write to the correct user's rows. */
    userId: string;
}

/** Full options object used by Phase 6 after main process enriches ImportOptionsPayload. */
export interface ImportOptions extends ImportOptionsPayload {
    parsedData: AnkiCollection;
}

// ── Phase 5: Media Extraction ─────────────────────────────────────────────────

import type { Media } from '@sekel/db';

export interface MediaExtractionResult {
    /** Files newly copied to permanent storage and inserted into the media table. */
    extracted: number;
    /** Files skipped because the same user already has a record with the same hash. */
    skipped: number;
    /** Non-fatal issues (e.g. numbered file missing from archive). */
    warnings: string[];
    /** All media records (both new and deduplicated) touched during this extraction. */
    mediaRecords: Media[];
}
