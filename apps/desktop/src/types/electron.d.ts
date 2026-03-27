import type {
    Deck, DeckInsert, DeckUpdate, DeckStats,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    Card, CardInsert, CardWithNote,
    Review,
    DeckSession, SessionAnalytics,
    DraftCard, DraftCardInsert,
    InsertReviewParams, ReviewDayCount,
    TodaySummary, CardCountsByMaturity, RetentionByMaturity,
} from '@sekel/db';
import type { TimeTravelPreview, TimeTravelResult } from '../main/db/timeTravel';

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
    // Statistics
    fetchTodaySummary:         (userId: string) => Promise<TodaySummary>;
    fetchCardCountsByMaturity: (userId: string, deckId?: string) => Promise<CardCountsByMaturity>;
    fetchRetentionByMaturity:  (userId: string, days?: number) => Promise<RetentionByMaturity>;
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
    // Export
    exportDeck:            (deckId: string, userId: string) => Promise<string | null>;
    getExportableCardCount: (deckId: string) => Promise<{ ankiCards: number; sekelCards: number }>;
    exportSekel:           (userId: string, deckId: string | null, includeMedia: boolean) => Promise<string | null>;
    getSekelImportSummary: (filePath: string) => Promise<SekelImportSummary>;
    importSekel:           (filePath: string, userId: string) => Promise<SekelImportResult>;
    // Media
    saveMediaFile:         (params: { buffer: ArrayBuffer; filename: string; userId: string; mimeType: string }) => Promise<string>;
    // Time Travel
    timeTravelPreview:     (daysBack: number) => Promise<TimeTravelPreview>;
    timeTravelExecute:     (daysBack: number) => Promise<TimeTravelResult>;
    // Deletion Log
    getDeletedItems:       () => Promise<DeletedItem[]>;
    // Integrity
    checkIntegrity:        () => Promise<string>;
}

export interface ThresholdShiftResult {
    shifted: boolean;
    multiplier: number;
    daysUntilExam: number | null;
}

interface ElectronNotify {
    configure: (config: { userId: string; enabled: boolean; reminderTimes: string[] }) => Promise<void>;
    streak: (userId: string) => Promise<number>;
    thresholdShift: (userId: string) => Promise<ThresholdShiftResult>;
}

export interface DeletedItem {
    type: 'deck' | 'note';
    id: string;
    timestamp: string;
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

export interface SekelImportSummary {
    formatVersion: number;
    exportDate: string;
    deckCount: number;
    noteTypeCount: number;
    noteCount: number;
    cardCount: number;
    reviewCount: number;
    sessionCount: number;
    hasMedia: boolean;
    deckNames: string[];
}

export interface SekelImportResult {
    decksCreated: number;
    notesInserted: number;
    cardsInserted: number;
    reviewsInserted: number;
    sessionsInserted: number;
    mediaExtracted: number;
}

export interface BackupInfo {
    filename: string;
    filePath: string;
    timestamp: string;
    sizeBytes: number;
}

export interface BackupSettings {
    intervalMinutes: number;
    dailyRetention: number;
    weeklyRetention: number;
    monthlyRetention: number;
}

export interface RestoreResult {
    success: boolean;
    safetyBackup?: BackupInfo;
    error?: string;
}

interface ElectronBackup {
    list:           () => Promise<BackupInfo[]>;
    create:         () => Promise<BackupInfo | null>;
    restore:        (filePath: string) => Promise<RestoreResult>;
    delete:         (filename: string) => Promise<boolean>;
    getSettings:    () => Promise<BackupSettings>;
    updateSettings: (settings: Partial<BackupSettings>) => Promise<BackupSettings>;
    getTotalSize:   () => Promise<number>;
    onCreated:      (cb: (info: BackupInfo) => void) => () => void;
    onOpenRestore:  (cb: () => void) => () => void;
}

export interface YieldScoreRow {
    cardId: string;
    yieldScore: number | null;
    yieldLevel: 'high' | 'medium' | 'low' | 'unclassified';
    systemKey: string | null;
    topicKey: string | null;
}

export interface SessionQueueCard extends CardWithNote {
    yield_score: number | null;
    yield_level: 'high' | 'medium' | 'low' | 'unclassified';
    prioritization_score: number;
    system_key: string | null;
    topic_key: string | null;
    time_multiplier: number;
    days_until_exam: number | null;
}

interface ElectronYield {
    classifyCard:      (cardId: string, examKey: string) => Promise<ClassificationResult>;
    classifyBatch:     (cardIds: string[], examKey: string, force?: boolean) => Promise<BatchClassifyResult>;
    getScores:         (examKey: string, cardIds?: string[]) => Promise<YieldScoreRow[]>;
    getExplanation:    (cardId: string, examKey: string) => Promise<string>;
    buildSessionQueue: (userId: string, examKey: string, limit?: number) => Promise<SessionQueueCard[]>;
}

export interface ClassificationResult {
    exam_key: string;
    system_key: string;
    topic_key: string;
    confidence: number;
    reasoning: string;
    multi_system?: true;
    classifications?: Array<{
        system_key: string;
        topic_key: string;
        confidence: number;
        split_weight: number;
        reasoning: string;
    }>;
}

export interface BatchClassifyResult {
    classified: number;
    skipped: number;
    errors: number;
}

export interface BlueprintExam {
    id: number;
    exam_key: string;
    label: string;
}

export interface UserExamProfile {
    id: number;
    user_id: string;
    exam_id: number;
    exam_date: string;
    is_primary: number;
    session_mode: 'auto' | 'mixed' | 'triage';
    created_at: string;
    updated_at: string;
    exam_key: string;
    exam_label: string;
}

interface ElectronExam {
    listExams:       () => Promise<BlueprintExam[]>;
    getProfile:      (userId: string) => Promise<UserExamProfile | null>;
    upsertProfile:   (userId: string, examId: number, examDate: string | null, sessionMode?: string) => Promise<UserExamProfile>;
    updateProfile:   (userId: string, updates: { exam_date?: string; session_mode?: string }) => Promise<UserExamProfile | null>;
    fetchAllCardIds: (userId: string) => Promise<string[]>;
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
    yield: ElectronYield;
    backup: ElectronBackup;
    exam: ElectronExam;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
