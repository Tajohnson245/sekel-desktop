import type {
    Deck, DeckInsert, DeckUpdate, DeckStats,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    Card, CardInsert, CardWithNote,
    Review,
    DeckSession, SessionAnalytics,
    DraftCard, DraftCardInsert,
    InsertReviewParams, ReviewDayCount,
} from '@sekel/db';

export type AnkiFormat = 'legacy2' | 'legacy1';

// ── Import Options (renderer-visible copies of main/import/types.ts) ──────────

export interface ImportSummaryDeck {
    ankiDeckId: number;
    name: string;
    nameComponents: string[];
    cardCount: number;
    hasConflict: boolean;
    existingDeckId?: string;
}

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

export interface ImportOptionsPayload {
    decks: ImportOptionsDeck[];
    hierarchyMode: 'subdecks' | 'individual';
    mediaMap: Record<string, string>;
    mediaFilePaths: string[];
    tempDir: string;
    userId: string;
}

export interface ImportResult {
    decksCreated: number;
    decksSkipped: number;
    notesInserted: number;
    cardsInserted: number;
    reviewsInserted: number;
    mediaExtracted: number;
    mediaSkipped: number;
    mediaWarnings: string[];
}

export interface ApkgImportResult {
    format: AnkiFormat;
    dbFilePath: string;
    mediaMap: Record<string, string>;
    mediaFilePaths: string[];
    warnings: string[];
    tempDir: string;
}

export type ImportStage =
    | 'extracting-media'
    | 'inserting-decks'
    | 'inserting-note-types'
    | 'inserting-notes'
    | 'inserting-cards'
    | 'inserting-reviews'
    | 'cleaning-up'
    | 'complete';

export interface ImportProgress {
    stage: ImportStage;
    /** Optional detail line, e.g. "Extracting 12 media files" */
    detail?: string;
    /** 0–100 estimate */
    percent: number;
}

export interface ElectronImport {
    selectFile: () => Promise<string | null>;
    processApkg: (filePath: string) => Promise<ApkgImportResult>;
    getSummary: (args: {
        dbFilePath: string;
        mediaMap: Record<string, string>;
        mediaFilePaths: string[];
        userId: string;
        tempDir: string;
    }) => Promise<ImportSummary>;
    confirmImport: (payload: ImportOptionsPayload) => Promise<ImportResult>;
    cancel: (tempDir: string) => void;
    onImportProgress: (cb: (progress: ImportProgress) => void) => () => void;
}

export interface DocumentOverview {
    summary: string;
    topics: string[];
    estimatedCardCount: number;
}

export interface GeneratedCard {
    front: string;
    back: string;
}

export interface AIGenerationOptions {
    cardFormat: 'basic' | 'cloze' | 'reversed';
    difficulty: 'essential' | 'detailed';
    customInstructions?: string;
}

interface ElectronDB {
    // Decks
    fetchDecks:            (userId: string) => Promise<Deck[]>;
    fetchDeck:             (id: string) => Promise<Deck | null>;
    createDeck:            (deck: DeckInsert) => Promise<Deck>;
    updateDeck:            (id: string, updates: DeckUpdate) => Promise<Deck>;
    deleteDeck:            (id: string) => Promise<void>;
    deleteDecks:           (ids: string[]) => Promise<void>;
    fetchDeckStats:        (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => Promise<DeckStats>;
    fetchAllDueCardsCount: (userId: string, dailyNewLimit?: number, dailyReviewLimit?: number) => Promise<number>;
    fetchGlobalRetention:  (userId: string, days?: number) => Promise<number | null>;
    // Cards
    fetchDueCards:         (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => Promise<CardWithNote[]>;
    fetchAllCardsForStudy: (deckId: string, limit?: number) => Promise<CardWithNote[]>;
    fetchAllCardsForDeck:  (deckId: string) => Promise<CardWithNote[]>;
    updateCardAfterReview: (cardId: string, updates: Partial<Card>) => Promise<Card>;
    createCard:            (card: CardInsert) => Promise<Card>;
    fetchCardsByNote:      (noteId: string) => Promise<Card[]>;
    // Notes
    fetchNotesByDeck:      (deckId: string) => Promise<Note[]>;
    createNote:            (note: NoteInsert) => Promise<Note>;
    updateNote:            (id: string, updates: NoteUpdate) => Promise<Note>;
    deleteNote:            (id: string) => Promise<void>;
    createNoteWithCards:   (note: NoteInsert, templateCount?: number) => Promise<{ note: Note; cards: Card[] }>;
    // Note Types
    fetchNoteTypes:        (userId: string) => Promise<NoteType[]>;
    createNoteType:        (noteType: NoteTypeInsert) => Promise<NoteType>;
    // Reviews
    insertReview:          (params: InsertReviewParams) => Promise<Review>;
    fetchUserReviewHistory: (userId: string, days?: number) => Promise<ReviewDayCount[]>;
    // Sessions
    createDeckSession:     (userId: string, deckId: string) => Promise<DeckSession>;
    completeDeckSession:   (sessionId: string) => Promise<DeckSession>;
    fetchSessionAnalytics: (sessionId: string) => Promise<SessionAnalytics | null>;
    // Drafts
    fetchDrafts:           (userId: string) => Promise<DraftCard[]>;
    saveDraft:             (userId: string, draft: DraftCardInsert) => Promise<DraftCard>;
    updateDraft:           (id: string, updates: Partial<Pick<DraftCard, 'front' | 'back'>>) => Promise<DraftCard>;
    deleteDraft:           (id: string) => Promise<void>;
    clearDrafts:           (userId: string) => Promise<void>;
    // Media
    saveMediaFile:         (params: { buffer: ArrayBuffer; filename: string; userId: string; mimeType: string }) => Promise<string>;
}

interface ElectronNotify {
    configure: (config: { userId: string; enabled: boolean; reminderTimes: string[] }) => Promise<void>;
    streak: (userId: string) => Promise<number>;
}

interface ElectronAPI {
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    parseDocument: (file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => Promise<{ filename: string, content: string }>;
    generateSummary: (documents: Record<string, string>, language?: string) => Promise<DocumentOverview>;
    getSupabaseConfig: () => Promise<{ url: string; anonKey: string }>;
    notify: ElectronNotify;
    import: ElectronImport;
    db: ElectronDB;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
