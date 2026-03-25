/**
 * Export orchestrator — coordinates building the Anki SQLite DB
 * and packaging it into a .apkg file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import { buildAnkiDatabase } from './builder';
import { packageApkg } from './packager';
import { getDb } from '../db/index';

export { getExportableCardCount } from './builder';

/**
 * Exports a Sekel deck as an Anki .apkg file.
 * Shows a save dialog, builds the Anki DB, packages with media, and writes to disk.
 *
 * @returns The saved file path, or null if cancelled.
 */
export async function exportDeckAsApkg(deckId: string, userId: string): Promise<string | null> {
    // Get deck name for the default filename
    const deck = getDb().prepare(
        'SELECT name FROM decks WHERE id = ?'
    ).get(deckId) as { name: string } | undefined;

    const defaultName = deck ? `${deck.name.replace(/[<>:"/\\|?*]/g, '_')}.apkg` : 'export.apkg';

    // Show save dialog
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
        title: 'Export Deck as .apkg',
        defaultPath: defaultName,
        filters: [{ name: 'Anki Package', extensions: ['apkg'] }],
    });

    if (result.canceled || !result.filePath) return null;

    let tmpDbPath: string | null = null;

    try {
        // Build Anki SQLite database
        tmpDbPath = buildAnkiDatabase(deckId, userId);

        // Package into .apkg with media
        await packageApkg(tmpDbPath, deckId, result.filePath);

        return result.filePath;
    } finally {
        // Clean up temp files
        if (tmpDbPath) {
            const tmpDir = path.dirname(tmpDbPath);
            try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore cleanup errors */ }
        }
    }
}
