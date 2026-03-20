import { contextBridge, ipcRenderer } from 'electron';
import type { AIGenerationOptions } from './types/electron';

contextBridge.exposeInMainWorld('electronAPI', {
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => ipcRenderer.invoke('generate-cards', text, count, language, options),
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions) => ipcRenderer.invoke('generate-cards-from-context', { summary, content, count, language, options }),
    parseDocument: (file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => ipcRenderer.invoke('parse-document', file),
    generateSummary: (documents: Record<string, string>, language?: string) => ipcRenderer.invoke('generate-summary', documents, language),
    getSupabaseConfig: () => ipcRenderer.invoke('get-supabase-config'),

    import: {
        selectFile:    () => ipcRenderer.invoke('import:select-file'),
        processApkg:   (filePath: string) => ipcRenderer.invoke('import:process-apkg', filePath),
        getSummary:    (args: { dbFilePath: string; mediaMap: Record<string, string>; mediaFilePaths: string[]; userId: string; tempDir: string }) =>
                           ipcRenderer.invoke('import:get-summary', args),
        confirmImport: (payload: unknown) => ipcRenderer.invoke('import:confirm', payload),
        cancel:        (tempDir: string) => ipcRenderer.invoke('import:cancel', tempDir),
        onImportProgress: (cb: (progress: unknown) => void) => {
            const listener = (_event: unknown, progress: unknown) => cb(progress);
            ipcRenderer.on('import:progress', listener);
            return () => ipcRenderer.removeListener('import:progress', listener);
        },
    },

    db: {
        // Decks
        fetchDecks:            (userId: string) => ipcRenderer.invoke('db:fetchDecks', userId),
        fetchDeck:             (id: string) => ipcRenderer.invoke('db:fetchDeck', id),
        createDeck:            (deck: unknown) => ipcRenderer.invoke('db:createDeck', deck),
        updateDeck:            (id: string, updates: unknown) => ipcRenderer.invoke('db:updateDeck', id, updates),
        deleteDeck:            (id: string) => ipcRenderer.invoke('db:deleteDeck', id),
        deleteDecks:           (ids: string[]) => ipcRenderer.invoke('db:deleteDecks', ids),
        fetchDeckStats:        (deckId: string) => ipcRenderer.invoke('db:fetchDeckStats', deckId),
        fetchAllDueCardsCount: (userId: string) => ipcRenderer.invoke('db:fetchAllDueCardsCount', userId),
        fetchGlobalRetention:  (userId: string, days?: number) => ipcRenderer.invoke('db:fetchGlobalRetention', userId, days),
        // Cards
        fetchDueCards:         (deckId: string, limit?: number) => ipcRenderer.invoke('db:fetchDueCards', deckId, limit),
        fetchAllCardsForStudy: (deckId: string, limit?: number) => ipcRenderer.invoke('db:fetchAllCardsForStudy', deckId, limit),
        fetchAllCardsForDeck:  (deckId: string) => ipcRenderer.invoke('db:fetchAllCardsForDeck', deckId),
        updateCardAfterReview: (cardId: string, updates: unknown) => ipcRenderer.invoke('db:updateCardAfterReview', cardId, updates),
        createCard:            (card: unknown) => ipcRenderer.invoke('db:createCard', card),
        fetchCardsByNote:      (noteId: string) => ipcRenderer.invoke('db:fetchCardsByNote', noteId),
        // Notes
        fetchNotesByDeck:      (deckId: string) => ipcRenderer.invoke('db:fetchNotesByDeck', deckId),
        createNote:            (note: unknown) => ipcRenderer.invoke('db:createNote', note),
        updateNote:            (id: string, updates: unknown) => ipcRenderer.invoke('db:updateNote', id, updates),
        deleteNote:            (id: string) => ipcRenderer.invoke('db:deleteNote', id),
        createNoteWithCards:   (note: unknown, templateCount?: number) => ipcRenderer.invoke('db:createNoteWithCards', note, templateCount),
        // Note Types
        fetchNoteTypes:        (userId: string) => ipcRenderer.invoke('db:fetchNoteTypes', userId),
        createNoteType:        (noteType: unknown) => ipcRenderer.invoke('db:createNoteType', noteType),
        // Reviews
        insertReview:          (params: unknown) => ipcRenderer.invoke('db:insertReview', params),
        fetchUserReviewHistory: (userId: string, days?: number) => ipcRenderer.invoke('db:fetchUserReviewHistory', userId, days),
        // Sessions
        createDeckSession:     (userId: string, deckId: string) => ipcRenderer.invoke('db:createDeckSession', userId, deckId),
        completeDeckSession:   (sessionId: string) => ipcRenderer.invoke('db:completeDeckSession', sessionId),
        fetchSessionAnalytics: (sessionId: string) => ipcRenderer.invoke('db:fetchSessionAnalytics', sessionId),
        // Drafts
        fetchDrafts:           (userId: string) => ipcRenderer.invoke('db:fetchDrafts', userId),
        saveDraft:             (userId: string, draft: unknown) => ipcRenderer.invoke('db:saveDraft', userId, draft),
        updateDraft:           (id: string, updates: unknown) => ipcRenderer.invoke('db:updateDraft', id, updates),
        deleteDraft:           (id: string) => ipcRenderer.invoke('db:deleteDraft', id),
        clearDrafts:           (userId: string) => ipcRenderer.invoke('db:clearDrafts', userId),
        // Media
        saveMediaFile:         (params: { buffer: ArrayBuffer; filename: string; userId: string; mimeType: string }) =>
                                   ipcRenderer.invoke('db:saveMediaFile', params),
    },
});
