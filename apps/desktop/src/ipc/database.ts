import { app, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as dbService from '../main/db/service';

export function setupDatabaseHandlers(): void {
    // ── Decks ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchDecks', (_e, userId: string) =>
        dbService.fetchDecks(userId));

    ipcMain.handle('db:fetchDeck', (_e, id: string) =>
        dbService.fetchDeck(id));

    ipcMain.handle('db:createDeck', (_e, deck) =>
        dbService.createDeck(deck));

    ipcMain.handle('db:updateDeck', (_e, id: string, updates) =>
        dbService.updateDeck(id, updates));

    ipcMain.handle('db:deleteDeck', (_e, id: string) =>
        dbService.deleteDeck(id));

    ipcMain.handle('db:deleteDecks', (_e, ids: string[]) =>
        dbService.deleteDecks(ids));

    ipcMain.handle('db:fetchDeckStats', (_e, deckId: string) =>
        dbService.fetchDeckStats(deckId));

    ipcMain.handle('db:fetchAllDueCardsCount', (_e, userId: string) =>
        dbService.fetchAllDueCardsCount(userId));

    ipcMain.handle('db:fetchGlobalRetention', (_e, userId: string, days?: number) =>
        dbService.fetchGlobalRetention(userId, days));

    // ── Cards ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchDueCards', (_e, deckId: string, limit?: number) =>
        dbService.fetchDueCards(deckId, limit));

    ipcMain.handle('db:fetchAllCardsForStudy', (_e, deckId: string, limit?: number) =>
        dbService.fetchAllCardsForStudy(deckId, limit));

    ipcMain.handle('db:fetchAllCardsForDeck', (_e, deckId: string) =>
        dbService.fetchAllCardsForDeck(deckId));

    ipcMain.handle('db:updateCardAfterReview', (_e, cardId: string, updates) =>
        dbService.updateCardAfterReview(cardId, updates));

    ipcMain.handle('db:createCard', (_e, card) =>
        dbService.createCard(card));

    ipcMain.handle('db:fetchCardsByNote', (_e, noteId: string) =>
        dbService.fetchCardsByNote(noteId));

    // ── Notes ──────────────────────────────────────────────────────────────────
    ipcMain.handle('db:fetchNotesByDeck', (_e, deckId: string) =>
        dbService.fetchNotesByDeck(deckId));

    ipcMain.handle('db:createNote', (_e, note) =>
        dbService.createNote(note));

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
    ipcMain.handle('db:insertReview', (_e, params) =>
        dbService.insertReview(params));

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
}
