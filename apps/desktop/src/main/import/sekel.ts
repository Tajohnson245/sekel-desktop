/**
 * Import handler for .spkg package files.
 *
 * Reads a .spkg ZIP archive and inserts all data into the local database.
 * Supports conflict resolution: skip, overwrite, or merge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { getDb } from '../db/index';
import { createBackup } from '../backup/service';
import {
    validateCollection,
    validateDecks,
    validateNoteTypes,
    validateNotes,
    validateCards,
    validateReviews,
    validateSessions,
    validateMediaMeta,
} from './spkgSchema';
import type { SpkgDeck, SpkgNoteType, SpkgNote, SpkgCard, SpkgReview, SpkgSession, SpkgMediaRecord } from './spkgSchema';
import {
    assertArchiveSize,
    assertJsonSize,
    assertMediaFileSize,
    MAX_DECOMPRESSED_BYTES,
    MAX_ENTRY_COUNT,
} from './limits';
import { sanitizeNoteFields, sanitizeCardTemplates } from './sanitizeFields';
import { validateMediaBuffer } from './mediaValidation';

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
 * Reads a .spkg file and returns a summary without importing anything.
 */
export async function getSekelImportSummary(filePath: string): Promise<SekelImportSummary> {
    // Size check before loading into memory
    const stat = fs.statSync(filePath);
    assertArchiveSize(stat.size, path.basename(filePath));

    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    // Validate entry count
    const entryCount = Object.keys(zip.files).length;
    if (entryCount > MAX_ENTRY_COUNT) {
        throw new Error(`Archive has ${entryCount} entries, max allowed is ${MAX_ENTRY_COUNT}.`);
    }

    const metaRaw = await zip.file('collection.json')?.async('string');
    if (!metaRaw) throw new Error('Invalid .spkg file: missing collection.json');

    const meta = validateCollection(JSON.parse(metaRaw));
    if (meta.formatVersion > SUPPORTED_FORMAT_VERSION) {
        throw new Error(`Unsupported .spkg format version ${meta.formatVersion}. Please update Sekel.`);
    }

    const decksRaw = await zip.file('decks.json')?.async('string') ?? '[]';
    assertJsonSize(decksRaw, 'decks.json');
    const decks = validateDecks(JSON.parse(decksRaw));

    const noteTypesRaw = await zip.file('note_types.json')?.async('string') ?? '[]';
    assertJsonSize(noteTypesRaw, 'note_types.json');
    const noteTypes = validateNoteTypes(JSON.parse(noteTypesRaw));

    const notesRaw = await zip.file('notes.json')?.async('string') ?? '[]';
    assertJsonSize(notesRaw, 'notes.json');
    const notes = validateNotes(JSON.parse(notesRaw));

    const cardsRaw = await zip.file('cards.json')?.async('string') ?? '[]';
    assertJsonSize(cardsRaw, 'cards.json');
    const cards = validateCards(JSON.parse(cardsRaw));

    const reviewsRaw = await zip.file('reviews.json')?.async('string') ?? '[]';
    assertJsonSize(reviewsRaw, 'reviews.json');
    const reviews = validateReviews(JSON.parse(reviewsRaw));

    const sessionsRaw = await zip.file('sessions.json')?.async('string') ?? '[]';
    assertJsonSize(sessionsRaw, 'sessions.json');
    const sessions = validateSessions(JSON.parse(sessionsRaw));

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
        deckNames: decks.map((d) => d.name),
    };
}

/**
 * Imports data from a .spkg file into the database.
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
    // Size check before loading into memory
    const stat = fs.statSync(filePath);
    assertArchiveSize(stat.size, path.basename(filePath));

    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    // Validate entry count
    const entryCount = Object.keys(zip.files).length;
    if (entryCount > MAX_ENTRY_COUNT) {
        throw new Error(`Archive has ${entryCount} entries, max allowed is ${MAX_ENTRY_COUNT}.`);
    }

    const metaRaw = await zip.file('collection.json')?.async('string');
    if (!metaRaw) throw new Error('Invalid .spkg file: missing collection.json');

    const meta = validateCollection(JSON.parse(metaRaw));
    if (meta.formatVersion > SUPPORTED_FORMAT_VERSION) {
        throw new Error(`Unsupported .spkg format version ${meta.formatVersion}`);
    }

    const decksRaw = await zip.file('decks.json')?.async('string') ?? '[]';
    assertJsonSize(decksRaw, 'decks.json');
    const decks: SpkgDeck[] = validateDecks(JSON.parse(decksRaw));

    const noteTypesRaw = await zip.file('note_types.json')?.async('string') ?? '[]';
    assertJsonSize(noteTypesRaw, 'note_types.json');
    const noteTypes: SpkgNoteType[] = validateNoteTypes(JSON.parse(noteTypesRaw));

    const notesRaw = await zip.file('notes.json')?.async('string') ?? '[]';
    assertJsonSize(notesRaw, 'notes.json');
    const notes: SpkgNote[] = validateNotes(JSON.parse(notesRaw));

    const cardsRaw = await zip.file('cards.json')?.async('string') ?? '[]';
    assertJsonSize(cardsRaw, 'cards.json');
    const cards: SpkgCard[] = validateCards(JSON.parse(cardsRaw));

    const reviewsRaw = await zip.file('reviews.json')?.async('string') ?? '[]';
    assertJsonSize(reviewsRaw, 'reviews.json');
    const reviews: SpkgReview[] = validateReviews(JSON.parse(reviewsRaw));

    const sessionsRaw = await zip.file('sessions.json')?.async('string') ?? '[]';
    assertJsonSize(sessionsRaw, 'sessions.json');
    const sessions: SpkgSession[] = validateSessions(JSON.parse(sessionsRaw));

    // Safety backup before any writes — gives the user a restore point if the
    // import produces unexpected results (e.g. duplicate cards, wrong scheduling).
    await createBackup();

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
            const newId = mapId(nt.id);
            insertNoteType.run(
                newId, userId, nt.name,
                typeof nt.fields === 'string' ? nt.fields : JSON.stringify(nt.fields),
                sanitizeCardTemplates(nt.card_templates),
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
            const newId = mapId(d.id);
            const parentId = d.parent_id ? mapId(d.parent_id) : null;
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
            const newId = mapId(n.id);
            const deckId = mapId(n.deck_id);
            const noteTypeId = mapId(n.note_type_id);
            insertNote.run(
                newId, userId, deckId, noteTypeId,
                sanitizeNoteFields(n.fields),
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
            const newId = mapId(c.id);
            const noteId = mapId(c.note_id);
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
            const newId = mapId(r.id);
            const cardId = mapId(r.card_id);
            const sessionId = r.session_id ? mapId(r.session_id) : null;
            const deckId = r.deck_id ? mapId(r.deck_id) : null;
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
            const newId = mapId(s.id);
            const deckId = mapId(s.deck_id);
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
        let mediaRecords: SpkgMediaRecord[] = [];
        if (mediaMetaRaw) {
            assertJsonSize(mediaMetaRaw, 'media.json');
            mediaRecords = validateMediaMeta(JSON.parse(mediaMetaRaw));
        }

        let decompressedBytes = 0;

        for (const entry of Object.values(mediaFolder.files)) {
            if (entry.dir) continue;
            const filename = path.basename(entry.name);
            const buf = Buffer.from(await entry.async('nodebuffer'));

            // Per-file and cumulative size checks
            assertMediaFileSize(buf.length, filename);
            decompressedBytes += buf.length;
            if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
                throw new Error('Cumulative decompressed media size exceeds the 2 GB limit.');
            }

            // Validate file type via magic bytes
            const validation = await validateMediaBuffer(buf, filename);
            if (!validation.valid) {
                // Skip invalid media files silently
                continue;
            }

            // For SVG files, use the sanitized content
            const writeBuf = validation.sanitizedBuffer ?? buf;
            const hash = createHash('sha1').update(writeBuf).digest('hex');
            const ext = path.extname(filename);
            const destPath = path.join(mediaDir, hash + ext);

            if (!fs.existsSync(destPath)) {
                fs.writeFileSync(destPath, writeBuf);
            }

            // Find matching metadata record
            const metaRecord = mediaRecords.find((m) => path.basename(m.file_path) === filename);

            // Insert media record (skip duplicates by hash)
            const existing = db.prepare('SELECT id FROM media WHERE user_id = ? AND file_hash = ?').get(userId, hash);
            if (!existing) {
                db.prepare(`
                    INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, import_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    randomUUID(), userId,
                    metaRecord?.filename ?? filename,
                    destPath, hash, writeBuf.length,
                    validation.detectedMime ?? metaRecord?.mime_type ?? null,
                    null, new Date().toISOString(),
                );
            }
            result.mediaExtracted++;
        }
    }

    return result;
}
