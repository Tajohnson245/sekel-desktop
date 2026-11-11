/**
 * Packages an Anki SQLite DB + media files into a .apkg ZIP archive.
 */

import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { getDb } from '../db/index';

/**
 * Scans note field HTML for media references.
 * Returns a Set of filenames (e.g. "image.jpg", "audio.mp3").
 */
function extractMediaReferences(fields: string): Set<string> {
    const refs = new Set<string>();

    // Match <img src="filename"> patterns
    const imgRegex = /src\s*=\s*["']([^"']+?)["']/gi;
    let match;
    while ((match = imgRegex.exec(fields)) !== null) {
        const filename = path.basename(match[1]);
        refs.add(filename);
    }

    // Match [sound:filename] patterns
    const soundRegex = /\[sound:([^\]]+)\]/gi;
    while ((match = soundRegex.exec(fields)) !== null) {
        refs.add(match[1].trim());
    }

    return refs;
}

/**
 * Returns the HTML of each field in a note's `fields` column (a JSON object of
 * field name → HTML). Scanning the raw JSON text would miss `src="…"`
 * references because JSON escapes the quotes (`src=\"…\"`).
 */
function fieldHtmlValues(fields: unknown): string[] {
    let parsed: unknown = fields;
    if (typeof fields === 'string') {
        try { parsed = JSON.parse(fields); } catch { return [fields]; }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.values(parsed).filter((v): v is string => typeof v === 'string');
    }
    return typeof fields === 'string' ? [fields] : [];
}

/**
 * Packages the Anki SQLite DB and associated media into a .apkg file.
 *
 * @param sqliteDbPath - Path to the collection.anki21 file
 * @param deckId - Sekel deck ID to find media for
 * @param outputPath - Where to write the .apkg file
 * @returns The output path on success
 */
export async function packageApkg(
    sqliteDbPath: string,
    deckId: string,
    outputPath: string,
): Promise<string> {
    const sekelDb = getDb();
    const zip = new JSZip();

    // Add the SQLite database
    const dbBuffer = fs.readFileSync(sqliteDbPath);
    zip.file('collection.anki21', dbBuffer);

    // Everything below is scoped to the deck's owner: the media table holds every
    // local account's files, and filenames (e.g. "image.png") aren't unique.
    const owner = sekelDb.prepare(
        'SELECT user_id FROM decks WHERE id = ?'
    ).get(deckId) as { user_id: string } | undefined;
    if (!owner) throw new Error('Deck not found');
    const userId = owner.user_id;

    // Collect media references from exported notes
    const allMediaRefs = new Set<string>();

    // Include child decks
    const childDeckIds = (sekelDb.prepare(
        'SELECT id FROM decks WHERE parent_id = ? AND user_id = ?'
    ).all(deckId, userId) as Array<{ id: string }>).map(r => r.id);

    const allDeckIds = [deckId, ...childDeckIds];
    const placeholders = allDeckIds.map(() => '?').join(',');

    const notes = sekelDb.prepare(
        `SELECT fields FROM notes WHERE deck_id IN (${placeholders}) AND user_id = ? AND anki_id IS NOT NULL`
    ).all(...allDeckIds, userId) as Array<{ fields: unknown }>;

    for (const note of notes) {
        for (const html of fieldHtmlValues(note.fields)) {
            for (const ref of extractMediaReferences(html)) {
                allMediaRefs.add(ref);
            }
        }
    }

    // Look up media files in the media table
    const mediaMap: Record<string, string> = {};
    let mediaIndex = 0;
    // A user can hold several media rows with the same filename (different
    // content from different imports); Anki's media map is keyed by filename,
    // so pack each name once — the newest copy that still exists on disk.
    const packedFilenames = new Set<string>();

    if (allMediaRefs.size > 0) {
        const mediaFilenames = [...allMediaRefs];
        // Query in batches to avoid SQLite placeholder limits
        const batchSize = 500;
        for (let i = 0; i < mediaFilenames.length; i += batchSize) {
            const batch = mediaFilenames.slice(i, i + batchSize);
            const ph = batch.map(() => '?').join(',');
            const mediaRows = sekelDb.prepare(
                `SELECT filename, file_path FROM media
                 WHERE user_id = ? AND filename IN (${ph})
                 ORDER BY created_at DESC`
            ).all(userId, ...batch) as Array<{ filename: string; file_path: string }>;

            for (const row of mediaRows) {
                if (packedFilenames.has(row.filename)) continue;
                if (fs.existsSync(row.file_path)) {
                    packedFilenames.add(row.filename);
                    const key = String(mediaIndex);
                    mediaMap[key] = row.filename;
                    zip.file(key, fs.readFileSync(row.file_path));
                    mediaIndex++;
                }
            }
        }
    }

    // Add media map JSON
    zip.file('media', JSON.stringify(mediaMap));

    // Write the ZIP to disk
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}
