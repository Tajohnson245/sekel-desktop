/**
 * Native Sekel export/import format (.sekel)
 *
 * A .sekel file is a ZIP archive containing:
 *   collection.json  — metadata (format version, export date, app version)
 *   decks.json       — all decks
 *   note_types.json  — all note types
 *   notes.json       — all notes
 *   cards.json       — all cards with FSRS state
 *   reviews.json     — all review history
 *   sessions.json    — all deck sessions
 *   media/           — media files (optional)
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import JSZip from 'jszip';
import { getDb } from '../db/index';

const SEKEL_FORMAT_VERSION = 1;

interface SekelCollectionMeta {
    formatVersion: number;
    exportDate: string;
    appVersion: string;
    deckId?: string;
}

/**
 * Exports a user's collection (or a single deck) as a .sekel file.
 *
 * @param userId  - The user whose data to export
 * @param deckId  - Optional: export only this deck (null = entire collection)
 * @param includeMedia - Whether to include media files in the archive
 * @returns The saved file path, or null if cancelled
 */
export async function exportAsSekel(
    userId: string,
    deckId: string | null,
    includeMedia: boolean,
): Promise<string | null> {
    const db = getDb();

    // Build default filename
    let defaultName = 'sekel-collection';
    if (deckId) {
        const deck = db.prepare('SELECT name FROM decks WHERE id = ?').get(deckId) as { name: string } | undefined;
        if (deck) defaultName = deck.name.replace(/[<>:"/\\|?*]/g, '_');
    }
    defaultName += '.sekel';

    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
        title: 'Export as Sekel Package',
        defaultPath: defaultName,
        filters: [{ name: 'Sekel Package', extensions: ['sekel'] }],
    });

    if (result.canceled || !result.filePath) return null;

    const zip = new JSZip();

    // Collection metadata
    const meta: SekelCollectionMeta = {
        formatVersion: SEKEL_FORMAT_VERSION,
        exportDate: new Date().toISOString(),
        appVersion: app.getVersion(),
        deckId: deckId ?? undefined,
    };
    zip.file('collection.json', JSON.stringify(meta, null, 2));

    // Query data — scope to user, optionally filtered to one deck
    const deckFilter = deckId ? ' AND id = ?' : '';
    const deckParams = deckId ? [userId, deckId] : [userId];
    const decks = db.prepare(`SELECT * FROM decks WHERE user_id = ?${deckFilter}`).all(...deckParams);
    zip.file('decks.json', JSON.stringify(decks, null, 2));

    const deckIds = (decks as { id: string }[]).map((d) => d.id);

    // Note types — export all for the user (notes may reference any of them)
    const noteTypes = db.prepare('SELECT * FROM note_types WHERE user_id = ?').all(userId);
    zip.file('note_types.json', JSON.stringify(noteTypes, null, 2));

    // Notes scoped to exported decks
    let notes: unknown[] = [];
    if (deckIds.length > 0) {
        const placeholders = deckIds.map(() => '?').join(', ');
        notes = db.prepare(`SELECT * FROM notes WHERE deck_id IN (${placeholders})`).all(...deckIds);
    }
    zip.file('notes.json', JSON.stringify(notes, null, 2));

    // Cards scoped to exported notes
    const noteIds = (notes as { id: string }[]).map((n) => n.id);
    const cards: unknown[] = [];
    if (noteIds.length > 0) {
        const batch = 500;
        for (let i = 0; i < noteIds.length; i += batch) {
            const chunk = noteIds.slice(i, i + batch);
            const placeholders = chunk.map(() => '?').join(', ');
            const rows = db.prepare(`SELECT * FROM cards WHERE note_id IN (${placeholders})`).all(...chunk);
            cards.push(...rows);
        }
    }
    zip.file('cards.json', JSON.stringify(cards, null, 2));

    // Reviews scoped to exported cards
    const cardIds = (cards as { id: string }[]).map((c) => c.id);
    const reviews: unknown[] = [];
    if (cardIds.length > 0) {
        const batch = 500;
        for (let i = 0; i < cardIds.length; i += batch) {
            const chunk = cardIds.slice(i, i + batch);
            const placeholders = chunk.map(() => '?').join(', ');
            const rows = db.prepare(`SELECT * FROM reviews WHERE card_id IN (${placeholders})`).all(...chunk);
            reviews.push(...rows);
        }
    }
    zip.file('reviews.json', JSON.stringify(reviews, null, 2));

    // Sessions scoped to exported decks
    let sessions: unknown[] = [];
    if (deckIds.length > 0) {
        const placeholders = deckIds.map(() => '?').join(', ');
        sessions = db.prepare(`SELECT * FROM deck_sessions WHERE deck_id IN (${placeholders})`).all(...deckIds);
    }
    zip.file('sessions.json', JSON.stringify(sessions, null, 2));

    // Media (optional)
    if (includeMedia) {
        const mediaRecords = db.prepare('SELECT * FROM media WHERE user_id = ?').all(userId) as { file_path: string; filename: string }[];
        const mediaFolder = zip.folder('media')!;

        for (const rec of mediaRecords) {
            if (fs.existsSync(rec.file_path)) {
                const buf = fs.readFileSync(rec.file_path);
                mediaFolder.file(path.basename(rec.file_path), buf);
            }
        }

        // Also include the media table metadata for re-import
        zip.file('media.json', JSON.stringify(mediaRecords, null, 2));
    }

    // Write ZIP to disk
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(result.filePath, buffer);

    return result.filePath;
}
