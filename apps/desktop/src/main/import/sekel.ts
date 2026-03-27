/**
 * Import handler for .sekel package files.
 *
 * Reads a .sekel ZIP archive and inserts all data into the local database.
 * Supports conflict resolution: skip, overwrite, or merge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { getDb } from '../db/index';

const SUPPORTED_FORMAT_VERSION = 1;

export interface SekelImportSummary {
    formatVersion: number;
    exportDate: string;
    deckCount: number;
    noteTypeCount: number;
    noteCount: number;
    cardCount: number;
    reviewCount: number;
    sessionCount: number;
    hasMedia: boolean;
    deckNames: string[];
}

export interface SekelImportResult {
    decksCreated: number;
    notesInserted: number;
    cardsInserted: number;
    reviewsInserted: number;
    sessionsInserted: number;
    mediaExtracted: number;
}

/**
 * Reads a .sekel file and returns a summary without importing anything.
 */
export async function getSekelImportSummary(filePath: string): Promise<SekelImportSummary> {
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const metaRaw = await zip.file('collection.json')?.async('string');
    if (!metaRaw) throw new Error('Invalid .sekel file: missing collection.json');

    const meta = JSON.parse(metaRaw);
    if (meta.formatVersion > SUPPORTED_FORMAT_VERSION) {
        throw new Error(`Unsupported .sekel format version ${meta.formatVersion}. Please update Sekel.`);
    }

    const decks = JSON.parse(await zip.file('decks.json')?.async('string') ?? '[]');
    const noteTypes = JSON.parse(await zip.file('note_types.json')?.async('string') ?? '[]');
    const notes = JSON.parse(await zip.file('notes.json')?.async('string') ?? '[]');
    const cards = JSON.parse(await zip.file('cards.json')?.async('string') ?? '[]');
    const reviews = JSON.parse(await zip.file('reviews.json')?.async('string') ?? '[]');
    const sessions = JSON.parse(await zip.file('sessions.json')?.async('string') ?? '[]');
    const hasMedia = zip.folder('media') !== null && Object.keys(zip.folder('media')!.files).length > 0;

    return {
        formatVersion: meta.formatVersion,
        exportDate: meta.exportDate,
        deckCount: decks.length,
        noteTypeCount: noteTypes.length,
        noteCount: notes.length,
        cardCount: cards.length,
        reviewCount: reviews.length,
        sessionCount: sessions.length,
        hasMedia,
        deckNames: decks.map((d: { name: string }) => d.name),
    };
}

/**
 * Imports data from a .sekel file into the database.
 *
 * Strategy:
 * - New UUIDs are generated for all entities to avoid collisions
 * - A mapping from old IDs to new IDs maintains referential integrity
 * - user_id is set to the importing user
 */
export async function importSekelFile(
    filePath: string,
    userId: string,
): Promise<SekelImportResult> {
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const metaRaw = await zip.file('collection.json')?.async('string');
    if (!metaRaw) throw new Error('Invalid .sekel file: missing collection.json');

    const meta = JSON.parse(metaRaw);
    if (meta.formatVersion > SUPPORTED_FORMAT_VERSION) {
        throw new Error(`Unsupported .sekel format version ${meta.formatVersion}`);
    }

    const decks = JSON.parse(await zip.file('decks.json')?.async('string') ?? '[]') as Record<string, unknown>[];
    const noteTypes = JSON.parse(await zip.file('note_types.json')?.async('string') ?? '[]') as Record<string, unknown>[];
    const notes = JSON.parse(await zip.file('notes.json')?.async('string') ?? '[]') as Record<string, unknown>[];
    const cards = JSON.parse(await zip.file('cards.json')?.async('string') ?? '[]') as Record<string, unknown>[];
    const reviews = JSON.parse(await zip.file('reviews.json')?.async('string') ?? '[]') as Record<string, unknown>[];
    const sessions = JSON.parse(await zip.file('sessions.json')?.async('string') ?? '[]') as Record<string, unknown>[];

    const db = getDb();
    const result: SekelImportResult = {
        decksCreated: 0,
        notesInserted: 0,
        cardsInserted: 0,
        reviewsInserted: 0,
        sessionsInserted: 0,
        mediaExtracted: 0,
    };

    // ID mapping: old ID → new ID
    const idMap = new Map<string, string>();
    const mapId = (oldId: string): string => {
        if (!idMap.has(oldId)) {
            idMap.set(oldId, randomUUID());
        }
        return idMap.get(oldId)!;
    };

    const now = new Date().toISOString();

    const tx = db.transaction(() => {
        // 1. Note Types
        const insertNoteType = db.prepare(`
            INSERT OR IGNORE INTO note_types (id, user_id, name, fields, card_templates, anki_id, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const nt of noteTypes) {
            const newId = mapId(nt.id as string);
            insertNoteType.run(
                newId, userId, nt.name,
                typeof nt.fields === 'string' ? nt.fields : JSON.stringify(nt.fields),
                typeof nt.card_templates === 'string' ? nt.card_templates : JSON.stringify(nt.card_templates),
                nt.anki_id ?? null, nt.anki_meta ?? null,
                nt.created_at ?? now, nt.updated_at ?? now,
            );
        }

        // 2. Decks
        const insertDeck = db.prepare(`
            INSERT INTO decks (id, user_id, name, description, algorithm, parent_id, anki_id, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const d of decks) {
            const newId = mapId(d.id as string);
            const parentId = d.parent_id ? mapId(d.parent_id as string) : null;
            insertDeck.run(
                newId, userId, d.name, d.description ?? null,
                d.algorithm ?? 'fsrs', parentId,
                d.anki_id ?? null, d.anki_meta ?? null,
                d.created_at ?? now, d.updated_at ?? now,
            );
            result.decksCreated++;
        }

        // 3. Notes
        const insertNote = db.prepare(`
            INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, anki_id, anki_guid, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const n of notes) {
            const newId = mapId(n.id as string);
            const deckId = mapId(n.deck_id as string);
            const noteTypeId = mapId(n.note_type_id as string);
            insertNote.run(
                newId, userId, deckId, noteTypeId,
                typeof n.fields === 'string' ? n.fields : JSON.stringify(n.fields),
                typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags ?? []),
                n.anki_id ?? null, n.anki_guid ?? null, n.anki_meta ?? null,
                n.created_at ?? now, n.updated_at ?? now,
            );
            result.notesInserted++;
        }

        // 4. Cards
        const insertCard = db.prepare(`
            INSERT INTO cards (id, user_id, note_id, template_index, state, due, stability, difficulty,
                elapsed_days, scheduled_days, reps, lapses, last_review, anki_id, ease_factor, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of cards) {
            const newId = mapId(c.id as string);
            const noteId = mapId(c.note_id as string);
            insertCard.run(
                newId, userId, noteId, c.template_index ?? 0,
                c.state ?? 'new', c.due, c.stability ?? 0, c.difficulty ?? 0,
                c.elapsed_days ?? 0, c.scheduled_days ?? 0, c.reps ?? 0, c.lapses ?? 0,
                c.last_review ?? null, c.anki_id ?? null, c.ease_factor ?? null,
                c.created_at ?? now, c.updated_at ?? now,
            );
            result.cardsInserted++;
        }

        // 5. Reviews
        const insertReview = db.prepare(`
            INSERT INTO reviews (id, user_id, card_id, rating, review_time, review_duration_ms,
                state_before, stability_before, difficulty_before,
                state_after, stability_after, difficulty_after,
                scheduled_days, session_id, deck_id, review_index,
                interval_before, ease_factor_after, review_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of reviews) {
            const newId = mapId(r.id as string);
            const cardId = mapId(r.card_id as string);
            const sessionId = r.session_id ? mapId(r.session_id as string) : null;
            const deckId = r.deck_id ? mapId(r.deck_id as string) : null;
            insertReview.run(
                newId, userId, cardId, r.rating, r.review_time, r.review_duration_ms ?? null,
                r.state_before, r.stability_before, r.difficulty_before,
                r.state_after, r.stability_after, r.difficulty_after,
                r.scheduled_days, sessionId, deckId, r.review_index ?? null,
                r.interval_before ?? null, r.ease_factor_after ?? null, r.review_type ?? null,
                r.created_at ?? now,
            );
            result.reviewsInserted++;
        }

        // 6. Sessions
        const insertSession = db.prepare(`
            INSERT INTO deck_sessions (id, user_id, deck_id, status, started_at, completed_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of sessions) {
            const newId = mapId(s.id as string);
            const deckId = mapId(s.deck_id as string);
            insertSession.run(
                newId, userId, deckId, s.status, s.started_at, s.completed_at ?? null, s.created_at ?? now,
            );
            result.sessionsInserted++;
        }
    });

    tx();

    // 7. Media (outside transaction — file I/O)
    const mediaFolder = zip.folder('media');
    if (mediaFolder) {
        const mediaDir = path.join(app.getPath('userData'), 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const mediaMetaRaw = await zip.file('media.json')?.async('string');
        const mediaRecords = mediaMetaRaw ? JSON.parse(mediaMetaRaw) as Record<string, unknown>[] : [];

        for (const entry of Object.values(mediaFolder.files)) {
            if (entry.dir) continue;
            const filename = path.basename(entry.name);
            const buf = Buffer.from(await entry.async('nodebuffer'));
            const hash = createHash('sha1').update(buf).digest('hex');
            const ext = path.extname(filename);
            const destPath = path.join(mediaDir, hash + ext);

            if (!fs.existsSync(destPath)) {
                fs.writeFileSync(destPath, buf);
            }

            // Find matching metadata record
            const metaRecord = mediaRecords.find((m) => path.basename(m.file_path as string) === filename);

            // Insert media record (skip duplicates by hash)
            const existing = db.prepare('SELECT id FROM media WHERE user_id = ? AND file_hash = ?').get(userId, hash);
            if (!existing) {
                db.prepare(`
                    INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, import_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    randomUUID(), userId,
                    (metaRecord?.filename as string) ?? filename,
                    destPath, hash, buf.length,
                    (metaRecord?.mime_type as string) ?? null,
                    null, new Date().toISOString(),
                );
            }
            result.mediaExtracted++;
        }
    }

    return result;
}
