import { app } from 'electron';
import { instrumentedHandle } from '@sekel/observability';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as dbService from '../main/db/service';
import * as timeTravel from '../main/db/timeTravel';
import { getDb } from '../main/db/index';
import { readDeletedItems } from '../main/backup/deletionLog';
import { exportDeckAsApkg, getExportableCardCount } from '../main/export/index';
import { exportAsSekel } from '../main/export/sekel';
import { getSekelImportSummary, importSekelFile } from '../main/import/sekel';
import {
    validate,
    createDeckRules,
    createNoteRules,
    updateCardAfterReviewRules,
    insertReviewRules,
    createDeckFromMissedCardsRules,
} from './validation';

export function setupDatabaseHandlers(): void {
    // ── Decks ──────────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchDecks', (_e, userId: string) =>
        dbService.fetchDecks(userId));

    instrumentedHandle('db:fetchDeck', (_e, id: string) =>
        dbService.fetchDeck(id));

    instrumentedHandle('db:createDeck', (_e, deck) => {
        validate('db:createDeck', deck, createDeckRules);
        return dbService.createDeck(deck);
    });

    instrumentedHandle('db:updateDeck', (_e, id: string, updates) =>
        dbService.updateDeck(id, updates));

    instrumentedHandle('db:deleteDeck', (_e, id: string) =>
        dbService.deleteDeck(id));

    instrumentedHandle('db:deleteDecks', (_e, ids: string[]) =>
        dbService.deleteDecks(ids));

    instrumentedHandle('db:fetchDeckStats', (_e, deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchDeckStats(deckId, userId, dailyNewLimit, dailyReviewLimit));

    instrumentedHandle('db:fetchAllDueCardsCount', (_e, userId: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchAllDueCardsCount(userId, dailyNewLimit, dailyReviewLimit));

    instrumentedHandle('db:fetchGlobalRetention', (_e, userId: string, days?: number) =>
        dbService.fetchGlobalRetention(userId, days));

    // ── Statistics ───────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchTodaySummary', (_e, userId: string) =>
        dbService.fetchTodaySummary(userId));

    instrumentedHandle('db:fetchCardCountsByMaturity', (_e, userId: string, deckId?: string) =>
        dbService.fetchCardCountsByMaturity(userId, deckId));

    instrumentedHandle('db:fetchRetentionByMaturity', (_e, userId: string, days?: number) =>
        dbService.fetchRetentionByMaturity(userId, days));

    // ── Cards ──────────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchDueCards', (_e, deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchDueCards(deckId, userId, dailyNewLimit, dailyReviewLimit));

    instrumentedHandle('db:fetchAllCardsForStudy', (_e, deckId: string, limit?: number) =>
        dbService.fetchAllCardsForStudy(deckId, limit));

    instrumentedHandle('db:fetchAllCardsForDeck', (_e, deckId: string) =>
        dbService.fetchAllCardsForDeck(deckId));

    instrumentedHandle('db:updateCardAfterReview', (_e, cardId: string, updates) => {
        if (typeof cardId !== 'string' || cardId.length === 0) {
            throw new Error('IPC validation failed (db:updateCardAfterReview): cardId must be a non-empty string');
        }
        validate('db:updateCardAfterReview', updates, updateCardAfterReviewRules);
        return dbService.updateCardAfterReview(cardId, updates);
    });

    instrumentedHandle('db:createCard', (_e, card) =>
        dbService.createCard(card));

    instrumentedHandle('db:fetchCardsByNote', (_e, noteId: string) =>
        dbService.fetchCardsByNote(noteId));

    // ── Notes ──────────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchNotesByDeck', (_e, deckId: string) =>
        dbService.fetchNotesByDeck(deckId));

    instrumentedHandle('db:createNote', (_e, note) => {
        validate('db:createNote', note, createNoteRules);
        return dbService.createNote(note);
    });

    instrumentedHandle('db:updateNote', (_e, id: string, updates) =>
        dbService.updateNote(id, updates));

    instrumentedHandle('db:deleteNote', (_e, id: string) =>
        dbService.deleteNote(id));

    instrumentedHandle('db:createNoteWithCards', (_e, note, templateCount?: number) =>
        dbService.createNoteWithCards(note, templateCount));

    // ── Note Types ─────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchNoteTypes', (_e, userId: string) =>
        dbService.fetchNoteTypes(userId));

    instrumentedHandle('db:createNoteType', (_e, noteType) =>
        dbService.createNoteType(noteType));

    // ── Reviews ────────────────────────────────────────────────────────────────
    instrumentedHandle('db:insertReview', (_e, params) => {
        validate('db:insertReview', params, insertReviewRules);
        return dbService.insertReview(params);
    });

    instrumentedHandle('db:fetchUserReviewHistory', (_e, userId: string, days?: number) =>
        dbService.fetchUserReviewHistory(userId, days));

    // ── Deck Sessions ──────────────────────────────────────────────────────────
    instrumentedHandle('db:createDeckSession', (_e, userId: string, deckId: string) =>
        dbService.createDeckSession(userId, deckId));

    instrumentedHandle('db:completeDeckSession', (_e, sessionId: string) =>
        dbService.completeDeckSession(sessionId));

    instrumentedHandle('db:fetchSessionAnalytics', (_e, sessionId: string) =>
        dbService.fetchSessionAnalytics(sessionId));

    instrumentedHandle('db:createDeckFromMissedCards', (_e, params) => {
        validate('db:createDeckFromMissedCards', params, createDeckFromMissedCardsRules);
        const { userId, deckName, cardIds } = params as { userId: string; deckName: string; cardIds: string[] };
        return dbService.createDeckFromMissedCards(userId, deckName, cardIds);
    });

    // ── Drafts ─────────────────────────────────────────────────────────────────
    instrumentedHandle('db:fetchDrafts', (_e, userId: string) =>
        dbService.fetchDrafts(userId));

    instrumentedHandle('db:saveDraft', (_e, userId: string, draft) =>
        dbService.saveDraft(userId, draft));

    instrumentedHandle('db:updateDraft', (_e, id: string, updates) =>
        dbService.updateDraft(id, updates));

    instrumentedHandle('db:deleteDraft', (_e, id: string) =>
        dbService.deleteDraft(id));

    instrumentedHandle('db:clearDrafts', (_e, userId: string) =>
        dbService.clearDrafts(userId));

    // ── Export ─────────────────────────────────────────────────────────────────
    instrumentedHandle('db:exportDeck', (_e, deckId: string, userId: string) =>
        exportDeckAsApkg(deckId, userId));

    instrumentedHandle('db:getExportableCardCount', (_e, deckId: string) =>
        getExportableCardCount(deckId));

    instrumentedHandle('db:exportSekel', (_e, userId: string, deckId: string | null, includeMedia: boolean) =>
        exportAsSekel(userId, deckId, includeMedia));

    instrumentedHandle('db:getSekelImportSummary', (_e, filePath: string) =>
        getSekelImportSummary(filePath));

    instrumentedHandle('db:importSekel', (_e, filePath: string, userId: string) =>
        importSekelFile(filePath, userId));

    // ── Media ──────────────────────────────────────────────────────────────────
    instrumentedHandle('db:saveMediaFile', async (_e, params: {
        buffer: ArrayBuffer;
        filename: string;
        userId: string;
        mimeType: string;
    }) => {
        const { buffer, filename, userId, mimeType } = params;
        const buf = Buffer.from(buffer);
        const sha1 = createHash('sha1').update(buf).digest('hex');

        const existing = dbService.fetchMediaByHash(userId, sha1);
        if (existing) {
            return `sekel-media://${encodeURIComponent(userId)}/${encodeURIComponent(existing.filename)}`;
        }

        const mediaDir = path.join(app.getPath('userData'), 'media');
        await mkdir(mediaDir, { recursive: true });

        const ext = path.extname(filename);
        const destPath = path.join(mediaDir, sha1 + ext);
        await writeFile(destPath, buf);

        dbService.createMedia({
            user_id: userId,
            filename,
            file_path: destPath,
            file_hash: sha1,
            file_size: buf.length,
            mime_type: mimeType,
        });

        return `sekel-media://${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`;
    });

    // ── Time Travel ─────────────────────────────────────────────────────────
    instrumentedHandle('db:timeTravelPreview', (_e, daysBack: number) =>
        timeTravel.timeTravelPreview(daysBack));

    instrumentedHandle('db:timeTravelExecute', (_e, daysBack: number) =>
        timeTravel.timeTravelExecute(daysBack));

    // ── Deletion Log ──────────────────────────────────────────────────────
    instrumentedHandle('db:getDeletedItems', () =>
        readDeletedItems());

    // ── Integrity ────────────────────────────────────────────────────────
    instrumentedHandle('db:checkIntegrity', () => {
        const db = getDb();
        const result = db.pragma('integrity_check') as { integrity_check: string }[];
        const fkResult = db.pragma('foreign_key_check') as unknown[];
        if (fkResult.length > 0) {
            return `Foreign key violations: ${fkResult.length}`;
        }
        return result[0]?.integrity_check ?? 'unknown';
    });
}
