import { app, ipcMain } from 'electron';
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
} from './validation';

export function setupDatabaseHandlers(): void {
    // ── Decks ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchDecks', (_e, userId: string) =>
        dbService.fetchDecks(userId));

    ipcMain.handle('db:fetchDeck', (_e, id: string) =>
        dbService.fetchDeck(id));

    ipcMain.handle('db:createDeck', (_e, deck) => {
        validate('db:createDeck', deck, createDeckRules);
        return dbService.createDeck(deck);
    });

    ipcMain.handle('db:updateDeck', (_e, id: string, updates) =>
        dbService.updateDeck(id, updates));

    ipcMain.handle('db:deleteDeck', (_e, id: string) =>
        dbService.deleteDeck(id));

    ipcMain.handle('db:deleteDecks', (_e, ids: string[]) =>
        dbService.deleteDecks(ids));

    ipcMain.handle('db:fetchDeckStats', (_e, deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchDeckStats(deckId, userId, dailyNewLimit, dailyReviewLimit));

    ipcMain.handle('db:fetchAllDueCardsCount', (_e, userId: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchAllDueCardsCount(userId, dailyNewLimit, dailyReviewLimit));

    ipcMain.handle('db:fetchGlobalRetention', (_e, userId: string, days?: number) =>
        dbService.fetchGlobalRetention(userId, days));

    // ── Statistics ───────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchTodaySummary', (_e, userId: string) =>
        dbService.fetchTodaySummary(userId));

    ipcMain.handle('db:fetchCardCountsByMaturity', (_e, userId: string, deckId?: string) =>
        dbService.fetchCardCountsByMaturity(userId, deckId));

    ipcMain.handle('db:fetchRetentionByMaturity', (_e, userId: string, days?: number) =>
        dbService.fetchRetentionByMaturity(userId, days));

    // ── Cards ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchDueCards', (_e, deckId: string, userId?: string, dailyNewLimit?: number, dailyReviewLimit?: number) =>
        dbService.fetchDueCards(deckId, userId, dailyNewLimit, dailyReviewLimit));

    ipcMain.handle('db:fetchAllCardsForStudy', (_e, deckId: string, limit?: number) =>
        dbService.fetchAllCardsForStudy(deckId, limit));

    ipcMain.handle('db:fetchAllCardsForDeck', (_e, deckId: string) =>
        dbService.fetchAllCardsForDeck(deckId));

    ipcMain.handle('db:updateCardAfterReview', (_e, cardId: string, updates) => {
        if (typeof cardId !== 'string' || cardId.length === 0) {
            throw new Error('IPC validation failed (db:updateCardAfterReview): cardId must be a non-empty string');
        }
        validate('db:updateCardAfterReview', updates, updateCardAfterReviewRules);
        return dbService.updateCardAfterReview(cardId, updates);
    });

    ipcMain.handle('db:createCard', (_e, card) =>
        dbService.createCard(card));

    ipcMain.handle('db:fetchCardsByNote', (_e, noteId: string) =>
        dbService.fetchCardsByNote(noteId));

    // ── Notes ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchNotesByDeck', (_e, deckId: string) =>
        dbService.fetchNotesByDeck(deckId));

    ipcMain.handle('db:createNote', (_e, note) => {
        validate('db:createNote', note, createNoteRules);
        return dbService.createNote(note);
    });

    ipcMain.handle('db:updateNote', (_e, id: string, updates) =>
        dbService.updateNote(id, updates));

    ipcMain.handle('db:deleteNote', (_e, id: string) =>
        dbService.deleteNote(id));

    ipcMain.handle('db:createNoteWithCards', (_e, note, templateCount?: number) =>
        dbService.createNoteWithCards(note, templateCount));

    // ── Note Types ─────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchNoteTypes', (_e, userId: string) =>
        dbService.fetchNoteTypes(userId));

    ipcMain.handle('db:createNoteType', (_e, noteType) =>
        dbService.createNoteType(noteType));

    // ── Reviews ────────────────────────────────────────────────────────────────
    ipcMain.handle('db:insertReview', (_e, params) => {
        validate('db:insertReview', params, insertReviewRules);
        return dbService.insertReview(params);
    });

    ipcMain.handle('db:fetchUserReviewHistory', (_e, userId: string, days?: number) =>
        dbService.fetchUserReviewHistory(userId, days));

    // ── Deck Sessions ──────────────────────────────────────────────────────────
    ipcMain.handle('db:createDeckSession', (_e, userId: string, deckId: string) =>
        dbService.createDeckSession(userId, deckId));

    ipcMain.handle('db:completeDeckSession', (_e, sessionId: string) =>
        dbService.completeDeckSession(sessionId));

    ipcMain.handle('db:fetchSessionAnalytics', (_e, sessionId: string) =>
        dbService.fetchSessionAnalytics(sessionId));

    // ── Drafts ─────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchDrafts', (_e, userId: string) =>
        dbService.fetchDrafts(userId));

    ipcMain.handle('db:saveDraft', (_e, userId: string, draft) =>
        dbService.saveDraft(userId, draft));

    ipcMain.handle('db:updateDraft', (_e, id: string, updates) =>
        dbService.updateDraft(id, updates));

    ipcMain.handle('db:deleteDraft', (_e, id: string) =>
        dbService.deleteDraft(id));

    ipcMain.handle('db:clearDrafts', (_e, userId: string) =>
        dbService.clearDrafts(userId));

    // ── Export ─────────────────────────────────────────────────────────────────
    ipcMain.handle('db:exportDeck', (_e, deckId: string, userId: string) =>
        exportDeckAsApkg(deckId, userId));

    ipcMain.handle('db:getExportableCardCount', (_e, deckId: string) =>
        getExportableCardCount(deckId));

    ipcMain.handle('db:exportSekel', (_e, userId: string, deckId: string | null, includeMedia: boolean) =>
        exportAsSekel(userId, deckId, includeMedia));

    ipcMain.handle('db:getSekelImportSummary', (_e, filePath: string) =>
        getSekelImportSummary(filePath));

    ipcMain.handle('db:importSekel', (_e, filePath: string, userId: string) =>
        importSekelFile(filePath, userId));

    // ── Media ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:saveMediaFile', async (_e, params: {
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
    ipcMain.handle('db:timeTravelPreview', (_e, daysBack: number) =>
        timeTravel.timeTravelPreview(daysBack));

    ipcMain.handle('db:timeTravelExecute', (_e, daysBack: number) =>
        timeTravel.timeTravelExecute(daysBack));

    // ── Deletion Log ──────────────────────────────────────────────────────
    ipcMain.handle('db:getDeletedItems', () =>
        readDeletedItems());

    // ── Integrity ────────────────────────────────────────────────────────
    ipcMain.handle('db:checkIntegrity', () => {
        const db = getDb();
        const result = db.pragma('integrity_check') as { integrity_check: string }[];
        const fkResult = db.pragma('foreign_key_check') as unknown[];
        if (fkResult.length > 0) {
            return `Foreign key violations: ${fkResult.length}`;
        }
        return result[0]?.integrity_check ?? 'unknown';
    });
}
