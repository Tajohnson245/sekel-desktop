/**
 * Native Sekel export/import format (.spkg)
 *
 * A .spkg file is a ZIP archive containing:
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

interface DeckRow {
    id: string;
    parent_id: string | null;
    [column: string]: unknown;
}

interface MediaRow {
    filename: string;
    file_path: string;
    mime_type: string | null;
}

interface ExportedMediaRecord {
    filename: string;
    /** Archive entry name inside media/ (not a local path). */
    file_path: string;
    mime_type: string | null;
}

/**
 * Decks to export: every deck of the user, or `deckId` plus all of its
 * descendants. The exported root's parent is cleared (it isn't in the
 * package), and parents are ordered before their children.
 */
export function selectExportDecks(userId: string, deckId: string | null): DeckRow[] {
    const db = getDb();
    let decks: DeckRow[];
    if (deckId) {
        decks = db.prepare(`
            WITH RECURSIVE subtree(id) AS (
                SELECT id FROM decks WHERE id = ? AND user_id = ?
                UNION
                SELECT d.id FROM decks d JOIN subtree s ON d.parent_id = s.id WHERE d.user_id = ?
            )
            SELECT * FROM decks WHERE id IN (SELECT id FROM subtree)
        `).all(deckId, userId, userId) as DeckRow[];
        decks = decks.map((d) => (d.id === deckId ? { ...d, parent_id: null } : d));
    } else {
        decks = db.prepare('SELECT * FROM decks WHERE user_id = ?').all(userId) as DeckRow[];
    }

    // Parents first, so importers that check foreign keys per row accept it.
    const byId = new Map(decks.map((d) => [d.id, d]));
    const depth = (d: DeckRow): number => {
        let n = 0;
        const visited = new Set<string>();
        for (let p = d.parent_id; p && byId.has(p) && !visited.has(p); p = byId.get(p)!.parent_id) {
            visited.add(p);
            n++;
        }
        return n;
    };
    return decks
        .map((d) => ({ d, depth: depth(d) }))
        .sort((a, b) => a.depth - b.depth)
        .map(({ d }) => d);
}

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;
const SEKEL_MEDIA_URL = /^sekel-media:\/\/[^/]*\/(.+)$/i;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SOUND_TAG = /\[sound:([^\]]+)\]/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;

function addMediaReference(raw: string, out: Set<string>): void {
    let ref = raw.trim();
    if (!ref) return;
    const sekelUrl = SEKEL_MEDIA_URL.exec(ref);
    if (sekelUrl) {
        ref = sekelUrl[1];
    } else if (HAS_SCHEME.test(ref)) {
        return; // http(s):, data:, etc. — not a local media file
    }
    out.add(ref);
    out.add(ref.replace(/&amp;/g, '&'));
    try {
        out.add(decodeURIComponent(ref));
    } catch {
        // not URI-encoded
    }
}

function scanForMedia(text: string, out: Set<string>): void {
    for (const re of [SRC_ATTR, SOUND_TAG, CSS_URL]) {
        re.lastIndex = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) {
            const value = m[1] ?? m[2] ?? m[3];
            if (value) addMediaReference(value, out);
        }
    }
}

/** Recursively scans every string in a row (JSON columns are parsed first). */
function scanValue(value: unknown, out: Set<string>): void {
    if (typeof value === 'string') {
        const trimmed = value.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                scanValue(JSON.parse(value), out);
                return;
            } catch {
                // not JSON — scan as text
            }
        }
        scanForMedia(value, out);
    } else if (Array.isArray(value)) {
        for (const v of value) scanValue(v, out);
    } else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) scanValue(v, out);
    }
}

/**
 * Media filenames referenced by notes / note types: <img src="…">, [sound:…],
 * CSS url(…), and sekel-media://user/… URLs.
 */
export function collectMediaReferences(rows: unknown[]): Set<string> {
    const out = new Set<string>();
    for (const row of rows) scanValue(row, out);
    return out;
}

/**
 * Exports a user's collection (or a single deck) as a .spkg file.
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
    let defaultName = 'sekel-export';
    if (deckId) {
        const deck = db.prepare('SELECT name FROM decks WHERE id = ?').get(deckId) as { name: string } | undefined;
        if (deck) defaultName = deck.name.replace(/[<>:"/\\|?*]/g, '_');
    }
    defaultName += '.spkg';

    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
        title: 'Export as Sekel Package',
        defaultPath: defaultName,
        filters: [{ name: 'Sekel Package', extensions: ['spkg'] }],
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

    // Decks — the whole collection, or the chosen deck plus all of its subdecks
    const decks = selectExportDecks(userId, deckId);
    zip.file('decks.json', JSON.stringify(decks, null, 2));

    const deckIds = decks.map((d) => d.id);

    // Notes scoped to exported decks
    let notes: unknown[] = [];
    if (deckIds.length > 0) {
        const placeholders = deckIds.map(() => '?').join(', ');
        notes = db.prepare(`SELECT * FROM notes WHERE deck_id IN (${placeholders})`).all(...deckIds);
    }

    // Note types — the whole collection exports all of them; a single deck
    // exports only the ones its notes use.
    let noteTypes = db.prepare('SELECT * FROM note_types WHERE user_id = ?').all(userId) as { id: string }[];
    if (deckId) {
        const used = new Set((notes as { note_type_id: string }[]).map((n) => n.note_type_id));
        noteTypes = noteTypes.filter((nt) => used.has(nt.id));
    }
    zip.file('note_types.json', JSON.stringify(noteTypes, null, 2));
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

    // Media (optional) — a single-deck export only carries files its notes or
    // note types reference; a full export carries all of the user's media.
    if (includeMedia) {
        const mediaRows = db.prepare('SELECT filename, file_path, mime_type FROM media WHERE user_id = ?')
            .all(userId) as MediaRow[];
        const wanted = deckId ? collectMediaReferences([...notes, ...noteTypes]) : null;
        const mediaFolder = zip.folder('media')!;
        const exported: ExportedMediaRecord[] = [];
        const seen = new Set<string>();

        for (const rec of mediaRows) {
            if (wanted && !wanted.has(rec.filename)) continue;
            const entryName = path.basename(rec.file_path);
            if (seen.has(entryName) || !fs.existsSync(rec.file_path)) continue;
            seen.add(entryName);
            mediaFolder.file(entryName, fs.readFileSync(rec.file_path));
            // file_path is the archive entry name only — never the absolute
            // local path. The importer computes its own destination.
            exported.push({ filename: rec.filename, file_path: entryName, mime_type: rec.mime_type });
        }

        // Also include the media table metadata for re-import
        zip.file('media.json', JSON.stringify(exported, null, 2));
    }

    // Write ZIP to disk
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(result.filePath, buffer);

    return result.filePath;
}
