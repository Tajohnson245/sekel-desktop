import type {
    Deck, DeckInsert, DeckUpdate, DeckStats,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    Card, CardInsert, CardWithNote,
    Review,
    DeckSession, SessionAnalytics,
    DraftCard, DraftCardInsert,
    UserProfile,
    InsertReviewParams, ReviewDayCount,
} from '@sekel/db';

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
    fetchDeckStats:        (deckId: string) => Promise<DeckStats>;
    fetchAllDueCardsCount: (userId: string) => Promise<number>;
    fetchGlobalRetention:  (userId: string, days?: number) => Promise<number | null>;
    // Cards
    fetchDueCards:         (deckId: string, limit?: number) => Promise<CardWithNote[]>;
    fetchAllCardsForStudy: (deckId: string, limit?: number) => Promise<CardWithNote[]>;
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
    // Profile
    fetchProfile:          (userId: string) => Promise<UserProfile | null>;
    upsertProfile:         (userId: string, updates: Partial<UserProfile>) => Promise<UserProfile>;
    // Sync
    isFirstRun:            (userId: string) => Promise<boolean>;
    pullFromSupabase:      (url: string, anonKey: string, userId: string, accessToken: string) => Promise<void>;
    setSessionToken:       (url: string, anonKey: string, accessToken: string) => Promise<void>;
    getSyncMetadata:       (key: string) => Promise<string | null>;
    setSyncMetadata:       (key: string, value: string) => Promise<void>;
}

interface ElectronAPI {
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    parseDocument: (file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => Promise<{ filename: string, content: string }>;
    generateSummary: (documents: Record<string, string>, language?: string) => Promise<string>;
    getSupabaseConfig: () => Promise<{ url: string; anonKey: string }>;
    db: ElectronDB;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
