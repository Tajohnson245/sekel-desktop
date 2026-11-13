/**
 * Import handler for .spkg package files.
 *
 * Reads a .spkg ZIP archive and inserts all data into the local database.
 * Supports conflict resolution: skip, overwrite, or merge.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { getDb } from '../db/index';
import { createBackup } from '../backup/service';
import {
    SpkgValidationError,
    validateCollection,
    validateDecks,
    validateNoteTypes,
    validateNotes,
    validateCards,
    validateReviews,
    validateSessions,
    validateMediaMeta,
} from './spkgSchema';
import type {
    SpkgCollection,
    SpkgDeck,
    SpkgNoteType,
    SpkgNote,
    SpkgCard,
    SpkgReview,
    SpkgSession,
    SpkgMediaRecord,
} from './spkgSchema';
import {
    assertArchiveSize,
    ImportSizeLimitError,
    MAX_DECOMPRESSED_BYTES,
    MAX_ENTRY_COUNT,
    MAX_JSON_BYTES,
    MAX_SINGLE_FILE_BYTES,
} from './limits';
import { sanitizeNoteFields, sanitizeCardTemplates } from './sanitizeFields';
import { validateMediaBuffer } from './mediaValidation';

const SUPPORTED_FORMAT_VERSION = 1;
const MEDIA_DIR_PREFIX = 'media/';

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
    /** Non-fatal problems (e.g. media files that were skipped). */
    warnings: string[];
}

// ── Archive reading with decompression-bomb guards ──────────────────────────

/**
 * Declared (central-directory) uncompressed size of an entry, or null if unknown.
 * JSZip 3.x keeps it on the private `_data` CompressedObject for entries read
 * by loadAsync (see the commented-out CompressedObject interface in its d.ts).
 */
function declaredSize(entry: JSZip.JSZipObject): number | null {
    const data = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data;
    const size = data?.uncompressedSize;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
}

function fileEntries(zip: JSZip): JSZip.JSZipObject[] {
    return Object.values(zip.files).filter((e) => !e.dir);
}

function mediaEntries(zip: JSZip): JSZip.JSZipObject[] {
    return fileEntries(zip).filter((e) => e.name.startsWith(MEDIA_DIR_PREFIX));
}

function toMB(bytes: number): number {
    return Math.round(bytes / (1024 * 1024));
}

/**
 * Rejects an archive from header metadata alone — before anything is inflated —
 * if it has too many entries or its entries declare more than
 * MAX_DECOMPRESSED_BYTES in total.
 */
function assertDeclaredSizes(zip: JSZip): void {
    const entryCount = Object.keys(zip.files).length;
    if (entryCount > MAX_ENTRY_COUNT) {
        throw new ImportSizeLimitError(`Archive has ${entryCount} entries, max allowed is ${MAX_ENTRY_COUNT}.`);
    }
    let total = 0;
    for (const entry of fileEntries(zip)) {
        total += declaredSize(entry) ?? 0;
        if (total > MAX_DECOMPRESSED_BYTES) {
            throw new ImportSizeLimitError(
                `Archive would decompress to more than ${toMB(MAX_DECOMPRESSED_BYTES)} MB.`,
            );
        }
    }
}

/**
 * Inflates one entry, refusing to produce more than `maxBytes`: the declared
 * size is checked before inflating, and the actual output is counted while
 * streaming (headers can lie), stopping as soon as the cap is crossed.
 */
function inflateCapped(entry: JSZip.JSZipObject, maxBytes: number, label: string): Promise<Buffer> {
    const tooLarge = () => new ImportSizeLimitError(
        `"${label}" decompresses to more than ${toMB(maxBytes)} MB.`,
    );
    const declared = declaredSize(entry);
    if (declared !== null && declared > maxBytes) {
        return Promise.reject(tooLarge());
    }

    return new Promise<Buffer>((resolve, reject) => {
        const stream = entry.nodeStream('nodebuffer') as Readable;
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;

        stream.on('data', (chunk: Buffer) => {
            if (settled) return;
            total += chunk.length;
            if (total > maxBytes) {
                settled = true;
                stream.destroy();
                reject(tooLarge());
                return;
            }
            chunks.push(chunk);
        });
        stream.on('error', (err: Error) => {
            if (settled) return;
            settled = true;
            reject(err);
        });
        stream.on('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks, total));
        });
    });
}

/** Reads and JSON-parses an archive entry (capped at MAX_JSON_BYTES). Missing → `fallback`. */
async function readJsonEntry(zip: JSZip, name: string, fallback: unknown = []): Promise<unknown> {
    const entry = zip.file(name);
    if (!entry) return fallback;
    const buf = await inflateCapped(entry, MAX_JSON_BYTES, name);
    return JSON.parse(buf.toString('utf8'));
}

interface SpkgContents {
    zip: JSZip;
    meta: SpkgCollection;
    decks: SpkgDeck[];
    noteTypes: SpkgNoteType[];
    notes: SpkgNote[];
    cards: SpkgCard[];
    reviews: SpkgReview[];
    sessions: SpkgSession[];
}

/** Opens a .spkg file and reads + validates all of its JSON parts. */
async function readSpkg(filePath: string): Promise<SpkgContents> {
    // Size check before loading into memory
    const stat = fs.statSync(filePath);
    assertArchiveSize(stat.size, path.basename(filePath));

    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    assertDeclaredSizes(zip);

    if (!zip.file('collection.json')) throw new Error('Invalid .spkg file: missing collection.json');
    const meta = validateCollection(await readJsonEntry(zip, 'collection.json'));
    if (meta.formatVersion > SUPPORTED_FORMAT_VERSION) {
        throw new Error(`Unsupported .spkg format version ${meta.formatVersion}. Please update Sekel.`);
    }

    return {
        zip,
        meta,
        decks: validateDecks(await readJsonEntry(zip, 'decks.json')),
        noteTypes: validateNoteTypes(await readJsonEntry(zip, 'note_types.json')),
        notes: validateNotes(await readJsonEntry(zip, 'notes.json')),
        cards: validateCards(await readJsonEntry(zip, 'cards.json')),
        reviews: validateReviews(await readJsonEntry(zip, 'reviews.json')),
        sessions: validateSessions(await readJsonEntry(zip, 'sessions.json')),
    };
}

/**
 * Reads a .spkg file and returns a summary without importing anything.
 */
export async function getSekelImportSummary(filePath: string): Promise<SekelImportSummary> {
    const { zip, meta, decks, noteTypes, notes, cards, reviews, sessions } = await readSpkg(filePath);
    const hasMedia = mediaEntries(zip).length > 0;

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
 * Checks the references every inserted row depends on (NOT NULL foreign keys)
 * resolve inside the package, so a malformed package fails with a clear
 * message before anything is written. Optional references (deck parent,
 * review session/deck) are handled at insert time by dropping them instead.
 */
function assertPackageReferences(c: SpkgContents): void {
    const deckIds = new Set(c.decks.map((d) => d.id));
    const noteTypeIds = new Set(c.noteTypes.map((nt) => nt.id));
    const noteIds = new Set(c.notes.map((n) => n.id));
    const cardIds = new Set(c.cards.map((card) => card.id));

    const check = (ok: boolean, file: string, detail: string) => {
        if (!ok) throw new SpkgValidationError(file, detail);
    };
    c.notes.forEach((n, i) => {
        check(deckIds.has(n.deck_id), 'notes.json', `notes[${i}].deck_id is not in decks.json`);
        check(noteTypeIds.has(n.note_type_id), 'notes.json', `notes[${i}].note_type_id is not in note_types.json`);
    });
    c.cards.forEach((card, i) =>
        check(noteIds.has(card.note_id), 'cards.json', `cards[${i}].note_id is not in notes.json`));
    c.reviews.forEach((r, i) =>
        check(cardIds.has(r.card_id), 'reviews.json', `reviews[${i}].card_id is not in cards.json`));
    c.sessions.forEach((s, i) =>
        check(deckIds.has(s.deck_id), 'sessions.json', `sessions[${i}].deck_id is not in decks.json`));
}

/** Last path segment of a Windows or POSIX path. */
function baseName(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

interface StagedMedia {
    filename: string;
    destPath: string;
    hash: string;
    size: number;
    mimeType: string | null;
}

/**
 * Inflates, validates and writes the package's media files to userData/media
 * (content-addressed, so re-running is harmless). Runs before the database
 * transaction: a problem with one file becomes a warning, and the only fatal
 * error (exceeding the cumulative size limit) happens before any row is written.
 */
async function stageMedia(zip: JSZip, warnings: string[]): Promise<StagedMedia[]> {
    const entries = mediaEntries(zip);
    if (entries.length === 0) return [];

    let mediaRecords: SpkgMediaRecord[] = [];
    if (zip.file('media.json')) {
        mediaRecords = validateMediaMeta(await readJsonEntry(zip, 'media.json'));
    }
    // media.json file_path is the archive entry name (older exports stored an
    // absolute path), so match on its last segment.
    const metaByEntry = new Map(mediaRecords.map((m) => [baseName(m.file_path), m]));

    const mediaDir = path.join(app.getPath('userData'), 'media');
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }

    const staged: StagedMedia[] = [];
    let inflatedBytes = 0;

    for (const entry of entries) {
        const entryName = baseName(entry.name);
        const metaRecord = metaByEntry.get(entryName);
        const displayName = metaRecord?.filename ?? entryName;

        let buf: Buffer;
        try {
            buf = await inflateCapped(entry, MAX_SINGLE_FILE_BYTES, entryName);
        } catch (err) {
            warnings.push(`[media] Skipped "${displayName}": ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        inflatedBytes += buf.length;
        if (inflatedBytes > MAX_DECOMPRESSED_BYTES) {
            throw new ImportSizeLimitError('Cumulative decompressed media size exceeds the 2 GB limit.');
        }

        // Validate file type via magic bytes
        const validation = await validateMediaBuffer(buf, entryName);
        if (!validation.valid) {
            warnings.push(`[media] Rejected "${displayName}": ${validation.warning ?? 'unsupported file'}`);
            continue;
        }

        // For SVG files, use the sanitized content
        const writeBuf = validation.sanitizedBuffer ?? buf;
        const hash = createHash('sha1').update(writeBuf).digest('hex');
        const destPath = path.join(mediaDir, hash + path.extname(entryName));
        try {
            if (!fs.existsSync(destPath)) {
                fs.writeFileSync(destPath, writeBuf);
            }
        } catch (err) {
            warnings.push(`[media] Could not save "${displayName}": ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        staged.push({
            filename: displayName,
            destPath,
            hash,
            size: writeBuf.length,
            mimeType: validation.detectedMime ?? metaRecord?.mime_type ?? null,
        });
    }
    return staged;
}

/**
 * Imports data from a .spkg file into the database.
 *
 * Strategy:
 * - New UUIDs are generated for all entities to avoid collisions
 * - Per-table maps from old IDs to new IDs maintain referential integrity
 * - Note types that already exist for this user (same anki_id) are reused
 * - Optional references to rows outside the package (a deck's parent, a
 *   review's session/deck) are dropped instead of pointing at nothing
 * - user_id is set to the importing user
 * - Media is staged before the transaction, so once rows are committed the
 *   import cannot fail (and a retry cannot duplicate decks)
 */
export async function importSekelFile(
    filePath: string,
    userId: string,
): Promise<SekelImportResult> {
    const contents = await readSpkg(filePath);
    const { zip, decks, noteTypes, notes, cards, reviews, sessions } = contents;
    assertPackageReferences(contents);

    // Safety backup before any writes — gives the user a restore point if the
    // import produces unexpected results (e.g. duplicate cards, wrong scheduling).
    await createBackup('auto');

    const db = getDb();
    const result: SekelImportResult = {
        decksCreated: 0,
        notesInserted: 0,
        cardsInserted: 0,
        reviewsInserted: 0,
        sessionsInserted: 0,
        mediaExtracted: 0,
        warnings: [],
    };

    // Media files go to disk before any row is written (see stageMedia).
    const stagedMedia = await stageMedia(zip, result.warnings);

    // ID mapping per table: old ID → new ID
    const makeMapper = () => {
        const map = new Map<string, string>();
        const mapId = (oldId: string): string => {
            let id = map.get(oldId);
            if (!id) {
                id = randomUUID();
                map.set(oldId, id);
            }
            return id;
        };
        return { map, mapId };
    };
    const noteTypeIds = makeMapper();
    const deckIds = makeMapper();
    const noteIds = makeMapper();
    const cardIds = makeMapper();
    const sessionIds = makeMapper();

    const packageDeckIds = new Set(decks.map((d) => d.id));
    const packageSessionIds = new Set(sessions.map((s) => s.id));

    const now = new Date().toISOString();

    const tx = db.transaction(() => {
        // Check foreign keys at COMMIT rather than per statement, so row order
        // inside the package (e.g. a subdeck listed before its parent) cannot
        // fail the import. Every reference is still enforced before commit.
        db.pragma('defer_foreign_keys = ON');

        // 1. Note Types — reuse the user's existing row for an Anki note type
        //    (unique on user_id + anki_id) instead of silently skipping the
        //    insert and leaving notes pointing at an id that was never written.
        const findNoteTypeByAnkiId = db.prepare('SELECT id FROM note_types WHERE user_id = ? AND anki_id = ?');
        const insertNoteType = db.prepare(`
            INSERT INTO note_types (id, user_id, name, fields, card_templates, anki_id, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const nt of noteTypes) {
            if (nt.anki_id != null) {
                const existing = findNoteTypeByAnkiId.get(userId, nt.anki_id) as { id: string } | undefined;
                if (existing) {
                    noteTypeIds.map.set(nt.id, existing.id);
                    continue;
                }
            }
            insertNoteType.run(
                noteTypeIds.mapId(nt.id), userId, nt.name,
                typeof nt.fields === 'string' ? nt.fields : JSON.stringify(nt.fields),
                sanitizeCardTemplates(nt.card_templates),
                nt.anki_id ?? null, nt.anki_meta ?? null,
                nt.created_at ?? now, nt.updated_at ?? now,
            );
        }

        // 2. Decks — a parent outside the package (e.g. the parent of a deck
        //    exported on its own) is dropped; the deck becomes top-level.
        const insertDeck = db.prepare(`
            INSERT INTO decks (id, user_id, name, description, algorithm, parent_id, anki_id, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const d of decks) {
            const newId = deckIds.mapId(d.id);
            const parentId = d.parent_id && packageDeckIds.has(d.parent_id) ? deckIds.mapId(d.parent_id) : null;
            insertDeck.run(
                newId, userId, d.name, d.description ?? null,
                d.algorithm ?? 'fsrs', parentId,
                d.anki_id ?? null, d.anki_meta ?? null,
                d.created_at ?? now, d.updated_at ?? now,
            );
            result.decksCreated++;
        }

        // 3. Notes — anki_guid is unique per user (SEKEL-145); if this account
        //    already has the note (e.g. re-importing your own export) the copy
        //    keeps its content but drops the Anki link instead of failing.
        //    Another account's copy of the same Anki note doesn't count.
        const guidTaken = db.prepare('SELECT 1 FROM notes WHERE user_id = ? AND anki_guid = ?');
        const insertNote = db.prepare(`
            INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, anki_id, anki_guid, anki_meta, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const n of notes) {
            const ankiGuid = n.anki_guid && !guidTaken.get(userId, n.anki_guid) ? n.anki_guid : null;
            insertNote.run(
                noteIds.mapId(n.id), userId, deckIds.mapId(n.deck_id), noteTypeIds.mapId(n.note_type_id),
                sanitizeNoteFields(n.fields),
                typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags ?? []),
                n.anki_id ?? null, ankiGuid, n.anki_meta ?? null,
                n.created_at ?? now, n.updated_at ?? now,
            );
            result.notesInserted++;
        }

        // 4. Cards — same for the per-user unique anki_id.
        const cardAnkiIdTaken = db.prepare('SELECT 1 FROM cards WHERE user_id = ? AND anki_id = ?');
        const insertCard = db.prepare(`
            INSERT INTO cards (id, user_id, note_id, template_index, state, due, stability, difficulty,
                elapsed_days, scheduled_days, reps, lapses, last_review, anki_id, ease_factor, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of cards) {
            const ankiId = c.anki_id != null && !cardAnkiIdTaken.get(userId, c.anki_id) ? c.anki_id : null;
            insertCard.run(
                cardIds.mapId(c.id), userId, noteIds.mapId(c.note_id), c.template_index ?? 0,
                c.state ?? 'new', c.due, c.stability ?? 0, c.difficulty ?? 0,
                c.elapsed_days ?? 0, c.scheduled_days ?? 0, c.reps ?? 0, c.lapses ?? 0,
                c.last_review ?? null, ankiId, c.ease_factor ?? null,
                c.created_at ?? now, c.updated_at ?? now,
            );
            result.cardsInserted++;
        }

        // 5. Sessions — before reviews, which reference them.
        const insertSession = db.prepare(`
            INSERT INTO deck_sessions (id, user_id, deck_id, status, started_at, completed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of sessions) {
            insertSession.run(
                sessionIds.mapId(s.id), userId, deckIds.mapId(s.deck_id),
                s.status, s.started_at, s.completed_at ?? null, s.created_at ?? now,
                s.completed_at ?? s.started_at ?? s.created_at ?? now,
            );
            result.sessionsInserted++;
        }

        // 6. Reviews — a session or deck outside the package (e.g. a cross-deck
        //    session whose representative deck wasn't exported) is dropped.
        const insertReview = db.prepare(`
            INSERT INTO reviews (id, user_id, card_id, rating, review_time, review_duration_ms,
                state_before, stability_before, difficulty_before,
                state_after, stability_after, difficulty_after,
                scheduled_days, session_id, deck_id, review_index,
                interval_before, ease_factor_after, review_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of reviews) {
            const sessionId = r.session_id && packageSessionIds.has(r.session_id) ? sessionIds.mapId(r.session_id) : null;
            const deckId = r.deck_id && packageDeckIds.has(r.deck_id) ? deckIds.mapId(r.deck_id) : null;
            insertReview.run(
                randomUUID(), userId, cardIds.mapId(r.card_id), r.rating, r.review_time, r.review_duration_ms ?? null,
                r.state_before, r.stability_before, r.difficulty_before,
                r.state_after, r.stability_after, r.difficulty_after,
                r.scheduled_days, sessionId, deckId, r.review_index ?? null,
                r.interval_before ?? null, r.ease_factor_after ?? null, r.review_type ?? null,
                r.created_at ?? now,
            );
            result.reviewsInserted++;
        }

        // 7. Media rows for the files staged above (skip duplicates by hash).
        const findMedia = db.prepare('SELECT id FROM media WHERE user_id = ? AND file_hash = ?');
        const insertMedia = db.prepare(`
            INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, import_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of stagedMedia) {
            if (!findMedia.get(userId, m.hash)) {
                insertMedia.run(
                    randomUUID(), userId, m.filename, m.destPath, m.hash, m.size, m.mimeType, null, now,
                );
            }
            result.mediaExtracted++;
        }
    });

    tx();

    if (result.warnings.length > 0) {
        console.warn('[spkg-import] completed with warnings:', result.warnings);
    }
    return result;
}
