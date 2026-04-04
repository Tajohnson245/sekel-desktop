/**
 * Deletion log — captures full entity data before hard deletes.
 *
 * Stores deleted items as JSONL (one JSON object per line) in
 * {userData}/deleted_items.jsonl. Entries older than 90 days are pruned
 * on each write.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDb } from '../db/index';

export interface DeletedItem {
    type: 'deck' | 'note';
    id: string;
    timestamp: string;
    data: Record<string, unknown>;
    /** For decks: includes child notes/cards counts */
    meta?: Record<string, unknown>;
}

const RETENTION_DAYS = 90;

function getLogPath(): string {
    return path.join(app.getPath('userData'), 'deleted_items.jsonl');
}

/** Appends a deleted item entry to the log. */
function appendEntry(entry: DeletedItem): void {
    const logPath = getLogPath();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logPath, line, 'utf-8');
}

/** Reads all entries from the log. */
export function readDeletedItems(): DeletedItem[] {
    const logPath = getLogPath();
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, 'utf-8');
    const items: DeletedItem[] = [];

    for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
            items.push(JSON.parse(line));
        } catch {
            // Skip malformed lines
        }
    }

    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Prunes entries older than RETENTION_DAYS. */
export function pruneDeletedItems(): void {
    const items = readDeletedItems();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffISO = cutoff.toISOString();

    const kept = items.filter((item) => item.timestamp >= cutoffISO);
    if (kept.length === items.length) return;

    const logPath = getLogPath();
    const content = kept.map((item) => JSON.stringify(item)).join('\n') + (kept.length > 0 ? '\n' : '');
    fs.writeFileSync(logPath, content, 'utf-8');
    console.log(`[DeletionLog] Pruned ${items.length - kept.length} old entries`);
}

/**
 * Logs a deck before it is deleted.
 * Captures the full deck row plus child note/card counts.
 */
export function logDeckDeletion(deckId: string): void {
    const db = getDb();
    const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(deckId) as Record<string, unknown> | undefined;
    if (!deck) return;

    const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE deck_id = ?').get(deckId) as { c: number }).c;
    const cardCount = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE note_id IN (SELECT id FROM notes WHERE deck_id = ?)').get(deckId) as { c: number }).c;
    const classifiedCardCount = (db.prepare(`
        SELECT COUNT(DISTINCT cc.card_id) as c
        FROM card_classifications cc
        JOIN cards ca ON ca.id = cc.card_id
        JOIN notes n ON n.id = ca.note_id
        WHERE n.deck_id = ?
    `).get(deckId) as { c: number }).c;

    appendEntry({
        type: 'deck',
        id: deckId,
        timestamp: new Date().toISOString(),
        data: deck,
        meta: { noteCount, cardCount, classifiedCardCount },
    });

    pruneDeletedItems();
}

/**
 * Logs a note (and its cards) before it is deleted.
 * Captures the full note row plus all associated cards.
 */
export function logNoteDeletion(noteId: string): void {
    const db = getDb();
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as Record<string, unknown> | undefined;
    if (!note) return;

    const cards = db.prepare('SELECT * FROM cards WHERE note_id = ?').all(noteId) as Record<string, unknown>[];

    appendEntry({
        type: 'note',
        id: noteId,
        timestamp: new Date().toISOString(),
        data: note,
        meta: { cards },
    });

    pruneDeletedItems();
}
