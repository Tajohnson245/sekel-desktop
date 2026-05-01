/**
 * Deletion log — captures full entity data before hard deletes.
 *
 * Stores deleted items as JSONL (one JSON object per line) in
 * {userData}/deleted_items.jsonl. Entries older than 90 days are pruned
 * once at app startup (see main.ts) — not on each write — to keep the
 * delete hot path O(1) instead of O(file size).
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
}

/**
 * Logs a batch of decks before they are deleted.
 * 4 grouped queries (decks + 3 count breakdowns) and one batched file append,
 * regardless of how many decks are being deleted.
 */
export function logAllDecksDeletion(deckIds: string[]): void {
    if (deckIds.length === 0) return;
    const db = getDb();
    const placeholders = deckIds.map(() => '?').join(',');

    const decks = db.prepare(`SELECT * FROM decks WHERE id IN (${placeholders})`).all(...deckIds) as Record<string, unknown>[];
    if (decks.length === 0) return;

    const noteCounts = db.prepare(`
        SELECT deck_id, COUNT(*) as c
        FROM notes
        WHERE deck_id IN (${placeholders})
        GROUP BY deck_id
    `).all(...deckIds) as { deck_id: string; c: number }[];

    const cardCounts = db.prepare(`
        SELECT n.deck_id, COUNT(c.id) as c
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        WHERE n.deck_id IN (${placeholders})
        GROUP BY n.deck_id
    `).all(...deckIds) as { deck_id: string; c: number }[];

    const classifiedCounts = db.prepare(`
        SELECT n.deck_id, COUNT(DISTINCT cc.card_id) as c
        FROM card_classifications cc
        JOIN cards ca ON ca.id = cc.card_id
        JOIN notes n ON n.id = ca.note_id
        WHERE n.deck_id IN (${placeholders})
        GROUP BY n.deck_id
    `).all(...deckIds) as { deck_id: string; c: number }[];

    const noteMap = new Map(noteCounts.map((r) => [r.deck_id, r.c]));
    const cardMap = new Map(cardCounts.map((r) => [r.deck_id, r.c]));
    const classifiedMap = new Map(classifiedCounts.map((r) => [r.deck_id, r.c]));

    const ts = new Date().toISOString();
    const lines = decks
        .map((deck) => {
            const id = deck.id as string;
            return JSON.stringify({
                type: 'deck',
                id,
                timestamp: ts,
                data: deck,
                meta: {
                    noteCount: noteMap.get(id) ?? 0,
                    cardCount: cardMap.get(id) ?? 0,
                    classifiedCardCount: classifiedMap.get(id) ?? 0,
                },
            });
        })
        .join('\n') + '\n';

    fs.appendFileSync(getLogPath(), lines, 'utf-8');
}

/**
 * Logs every note in a deck (with their cards) before bulk deletion.
 * Reads notes + cards in two queries, writes one append, prunes once.
 */
export function logAllNotesInDeckDeletion(deckId: string): void {
    const db = getDb();
    const notes = db.prepare('SELECT * FROM notes WHERE deck_id = ?').all(deckId) as Record<string, unknown>[];
    if (notes.length === 0) return;

    const noteIds = notes.map((n) => n.id as string);
    const placeholders = noteIds.map(() => '?').join(',');
    const allCards = db.prepare(`SELECT * FROM cards WHERE note_id IN (${placeholders})`).all(...noteIds) as Record<string, unknown>[];

    const cardsByNote = new Map<string, Record<string, unknown>[]>();
    for (const card of allCards) {
        const noteId = card.note_id as string;
        const arr = cardsByNote.get(noteId) ?? [];
        arr.push(card);
        cardsByNote.set(noteId, arr);
    }

    const ts = new Date().toISOString();
    const lines = notes
        .map((note) =>
            JSON.stringify({
                type: 'note',
                id: note.id,
                timestamp: ts,
                data: note,
                meta: { cards: cardsByNote.get(note.id as string) ?? [] },
            }),
        )
        .join('\n') + '\n';

    fs.appendFileSync(getLogPath(), lines, 'utf-8');
}
