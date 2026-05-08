import * as Sentry from '@sentry/electron/renderer';
import { contextBridge, ipcRenderer } from 'electron';
import type { AIGenerationOptions } from './types/electron';

Sentry.init({
    dsn: 'https://cacb0014cc3c9ce493a71a738929f415@o4511351709171712.ingest.us.sentry.io/4511351710285824',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    release: __APP_VERSION__,
});

contextBridge.exposeInMainWorld('electronAPI', {
    // ── Static system info ───────────────────────────────────────────────
    // Resolved once at preload load. process.platform is one of the few
    // primitives available in sandboxed preload contexts. Renderer maps
    // this to a friendly label at use time.
    platform: process.platform,

    // ── Deep linking (sekel:// URLs from email-confirmation, password reset, etc.) ──
    deepLink: {
        // Returns the URL the app was launched with, if any. Cleared on read.
        getInitial: () => ipcRenderer.invoke('deep-link:get-initial') as Promise<string | null>,
        // Subscribe to deep links delivered while the app is already running.
        on: (cb: (url: string) => void) => {
            const listener = (_event: unknown, url: string) => cb(url);
            ipcRenderer.on('deep-link', listener);
            return () => ipcRenderer.removeListener('deep-link', listener);
        },
    },
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => ipcRenderer.invoke('generate-cards', text, count, language, options),
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions, chunks?: Array<{ id: number; text: string }>) => ipcRenderer.invoke('generate-cards-from-context', { summary, content, count, language, options, chunks }),
    onAIProgress: (cb: (progress: { phase: 'chunking' | 'generating' | 'refining' | 'done'; current: number; total: number }) => void) => {
        const listener = (_event: unknown, progress: { phase: 'chunking' | 'generating' | 'refining' | 'done'; current: number; total: number }) => cb(progress);
        ipcRenderer.on('ai-progress', listener);
        return () => ipcRenderer.removeListener('ai-progress', listener);
    },
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
        cleanup:       (tempDir: string) => ipcRenderer.invoke('import:cleanup', tempDir),
        onImportProgress: (cb: (progress: unknown) => void) => {
            const listener = (_event: unknown, progress: unknown) => cb(progress);
            ipcRenderer.on('import:progress', listener);
            return () => ipcRenderer.removeListener('import:progress', listener);
        },
    },

    notify: {
        configure: (config: { userId: string; enabled: boolean; reminderTimes: string[] }) =>
            ipcRenderer.invoke('notify:configure', config),
        streak: (userId: string) => ipcRenderer.invoke('notify:streak', userId),
        thresholdShift: (userId: string) => ipcRenderer.invoke('notify:threshold-shift', userId),
    },

    db: {
        // Decks
        fetchDecks:            (userId: string) => ipcRenderer.invoke('db:fetchDecks', userId),
        fetchDeck:             (id: string) => ipcRenderer.invoke('db:fetchDeck', id),
        createDeck:            (deck: unknown) => ipcRenderer.invoke('db:createDeck', deck),
        updateDeck:            (id: string, updates: unknown) => ipcRenderer.invoke('db:updateDeck', id, updates),
        deleteDeck:            (id: string) => ipcRenderer.invoke('db:deleteDeck', id),
        deleteDecks:           (ids: string[]) => ipcRenderer.invoke('db:deleteDecks', ids),
        fetchDeckStats:        (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => ipcRenderer.invoke('db:fetchDeckStats', deckId, userId, dailyNewLimit, dailyReviewLimit),
        fetchAllDueCardsCount: (userId: string, dailyNewLimit?: number, dailyReviewLimit?: number) => ipcRenderer.invoke('db:fetchAllDueCardsCount', userId, dailyNewLimit, dailyReviewLimit),
        fetchGlobalRetention:  (userId: string, days?: number) => ipcRenderer.invoke('db:fetchGlobalRetention', userId, days),
        // Statistics
        fetchTodaySummary:         (userId: string) => ipcRenderer.invoke('db:fetchTodaySummary', userId),
        fetchCardCountsByMaturity: (userId: string, deckId?: string) => ipcRenderer.invoke('db:fetchCardCountsByMaturity', userId, deckId),
        fetchRetentionByMaturity:  (userId: string, days?: number) => ipcRenderer.invoke('db:fetchRetentionByMaturity', userId, days),
        fetchSessionClassificationBreakdown: (sessionId: string) => ipcRenderer.invoke('db:fetchSessionClassificationBreakdown', sessionId),
        fetchMissedCardStats:      (userId: string, examKey: string, days: number | null) => ipcRenderer.invoke('db:fetchMissedCardStats', userId, examKey, days),
        fetchMissRateTrend:        (userId: string, days: number | null) => ipcRenderer.invoke('db:fetchMissRateTrend', userId, days),
        getIntelligenceSummary:    (userId: string) => ipcRenderer.invoke('db:get-intelligence-summary', userId),
        // Cards
        fetchDueCards:         (deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => ipcRenderer.invoke('db:fetchDueCards', deckId, userId, dailyNewLimit, dailyReviewLimit),
        fetchDueCardsFocused:  (deckId: string, systemKeys: string[], examKey: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) => ipcRenderer.invoke('db:fetchDueCardsFocused', deckId, systemKeys, examKey, userId, dailyNewLimit, dailyReviewLimit),
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
        deleteAllCardsInDeck:  (deckId: string) => ipcRenderer.invoke('db:deleteAllCardsInDeck', deckId),
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
        abandonOpenSessions:         (userId: string) => ipcRenderer.invoke('db:abandonOpenSessions', userId),
        fetchBulkClassifiedCardCount: (deckIds: string[]) => ipcRenderer.invoke('db:fetchBulkClassifiedCardCount', deckIds),
        fetchSessionAnalytics: (sessionId: string) => ipcRenderer.invoke('db:fetchSessionAnalytics', sessionId),
        createDeckFromMissedCards: (userId: string, deckName: string, cardIds: string[]) =>
            ipcRenderer.invoke('db:createDeckFromMissedCards', { userId, deckName, cardIds }),
        // Drafts
        fetchDrafts:           (userId: string) => ipcRenderer.invoke('db:fetchDrafts', userId),
        saveDraft:             (userId: string, draft: unknown) => ipcRenderer.invoke('db:saveDraft', userId, draft),
        updateDraft:           (id: string, updates: unknown) => ipcRenderer.invoke('db:updateDraft', id, updates),
        deleteDraft:           (id: string) => ipcRenderer.invoke('db:deleteDraft', id),
        clearDrafts:           (userId: string) => ipcRenderer.invoke('db:clearDrafts', userId),
        // Export
        exportDeck:            (deckId: string, userId: string) => ipcRenderer.invoke('db:exportDeck', deckId, userId),
        getExportableCardCount: (deckId: string) => ipcRenderer.invoke('db:getExportableCardCount', deckId),
        exportSekel:           (userId: string, deckId: string | null, includeMedia: boolean) => ipcRenderer.invoke('db:exportSekel', userId, deckId, includeMedia),
        getSekelImportSummary: (filePath: string) => ipcRenderer.invoke('db:getSekelImportSummary', filePath),
        importSekel:           (filePath: string, userId: string) => ipcRenderer.invoke('db:importSekel', filePath, userId),
        // Media
        saveMediaFile:         (params: { buffer: ArrayBuffer; filename: string; userId: string; mimeType: string }) =>
                                   ipcRenderer.invoke('db:saveMediaFile', params),
        // Time Travel
        timeTravelPreview:     (daysBack: number) => ipcRenderer.invoke('db:timeTravelPreview', daysBack),
        timeTravelExecute:     (daysBack: number) => ipcRenderer.invoke('db:timeTravelExecute', daysBack),
        // Deletion Log
        getDeletedItems:       () => ipcRenderer.invoke('db:getDeletedItems'),
        // Integrity
        checkIntegrity:        () => ipcRenderer.invoke('db:checkIntegrity'),
    },

    yield: {
        classifyCard:  (cardId: string, examKey: string) =>
            ipcRenderer.invoke('yield:classify-card', cardId, examKey),
        classifyBatch: (cardIds: string[], examKey: string, force?: boolean) =>
            ipcRenderer.invoke('yield:classify-batch', cardIds, examKey, force),
        getScores:     (examKey: string, cardIds?: string[]) =>
            ipcRenderer.invoke('yield:get-scores', examKey, cardIds),
        getExplanation: (cardId: string, examKey: string) =>
            ipcRenderer.invoke('yield:get-explanation', cardId, examKey),
        buildSessionQueue: (userId: string, examKey: string, limit?: number) =>
            ipcRenderer.invoke('yield:build-session-queue', userId, examKey, limit),
        getDeckClassificationCount: (deckId: string, examKey: string) =>
            ipcRenderer.invoke('yield:getDeckClassificationCount', deckId, examKey),
    },

    backup: {
        list:           () => ipcRenderer.invoke('backup:list'),
        create:         () => ipcRenderer.invoke('backup:create'),
        restore:        (filePath: string) => ipcRenderer.invoke('backup:restore', filePath),
        delete:         (filename: string) => ipcRenderer.invoke('backup:delete', filename),
        getTotalSize:   () => ipcRenderer.invoke('backup:getTotalSize'),
        onCreated: (cb: (info: unknown) => void) => {
            const listener = (_event: unknown, info: unknown) => cb(info);
            ipcRenderer.on('backup:created', listener);
            return () => ipcRenderer.removeListener('backup:created', listener);
        },
        onOpenRestore: (cb: () => void) => {
            const listener = () => cb();
            ipcRenderer.on('backup:open-restore', listener);
            return () => ipcRenderer.removeListener('backup:open-restore', listener);
        },
    },

    obs: {
        getMetrics: () => ipcRenderer.invoke('obs:getMetrics'),
        isAdmin:    (email: string) => ipcRenderer.invoke('obs:isAdmin', email),
    },

    admin: {
        getOverview:   (email: string) => ipcRenderer.invoke('admin:getOverview', email),
        getUsers:      (email: string) => ipcRenderer.invoke('admin:getUsers', email),
        getUserDetail: (email: string, userId: string) => ipcRenderer.invoke('admin:getUserDetail', email, userId),
        getFeedback:   (email: string) => ipcRenderer.invoke('admin:getFeedback', email),
    },

    exam: {
        listExams:       () => ipcRenderer.invoke('exam:list-exams'),
        getProfile:      (userId: string) => ipcRenderer.invoke('exam:get-profile', userId),
        upsertProfile:   (userId: string, examId: number, examDate: string | null, sessionMode?: string) =>
                             ipcRenderer.invoke('exam:upsert-profile', userId, examId, examDate, sessionMode),
        updateProfile:   (userId: string, updates: { exam_date?: string; session_mode?: string }) =>
                             ipcRenderer.invoke('exam:update-profile', userId, updates),
        deleteProfile:   (userId: string) => ipcRenderer.invoke('exam:delete-profile', userId),
        fetchAllCardIds: (userId: string) => ipcRenderer.invoke('exam:fetch-all-card-ids', userId),
    },

    update: {
        onDownloaded: (cb: (data: { version: string; notes: string | null }) => void) => {
            const listener = (_event: unknown, data: { version: string; notes: string | null }) => cb(data);
            ipcRenderer.on('update:downloaded', listener);
            return () => ipcRenderer.removeListener('update:downloaded', listener);
        },
        install: () => ipcRenderer.invoke('update:install'),
    },

    tour: {
        onReplay: (cb: () => void) => {
            const listener = () => cb();
            ipcRenderer.on('tour:replay', listener);
            return () => ipcRenderer.removeListener('tour:replay', listener);
        },
    },

    plan: {
        compute:      (userId: string, examKey: string, deckIds?: string[]) =>
                          ipcRenderer.invoke('plan:compute', userId, examKey, deckIds),
        getDeckUnseenCounts: (userId: string) =>
                          ipcRenderer.invoke('plan:getDeckUnseenCounts', userId),
        create:       (userId: string, examKey: string, cardsPerDay: number, name: string, snapshot: unknown) =>
                          ipcRenderer.invoke('plan:create', userId, examKey, cardsPerDay, name, snapshot),
        getActive:    (userId: string, examKey?: string) =>
                          ipcRenderer.invoke('plan:getActive', userId, examKey),
        list:         (userId: string) =>
                          ipcRenderer.invoke('plan:list', userId),
        archive:      (userId: string, planId: string) =>
                          ipcRenderer.invoke('plan:archive', userId, planId),
        delete:       (userId: string, planId: string) =>
                          ipcRenderer.invoke('plan:delete', userId, planId),
        reactivate:   (userId: string, planId: string) =>
                          ipcRenderer.invoke('plan:reactivate', userId, planId),
        rebalance:    (userId: string, examKey: string) =>
                          ipcRenderer.invoke('plan:rebalance', userId, examKey),
        getProgress:  (userId: string, activatedAt: string, deckFilter: string[] | null) =>
                          ipcRenderer.invoke('plan:getProgress', userId, activatedAt, deckFilter),
        setOverride:  (userId: string, newPerDayOverride: number) =>
                          ipcRenderer.invoke('plan:setOverride', userId, newPerDayOverride),
        clearOverride: (userId: string) =>
                          ipcRenderer.invoke('plan:clearOverride', userId),
        fetchPlansReferencingDecks: (userId: string, deckIds: string[]) =>
                          ipcRenderer.invoke('plan:fetchPlansReferencingDecks', userId, deckIds),
    },
});
