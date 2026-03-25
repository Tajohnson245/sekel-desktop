/**
 * Builds an Anki-compatible SQLite database (collection.anki21)
 * from Sekel deck data. Only exports cards/notes that have anki_id.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { getDb } from '../db/index';

// Anki stores review-card due dates as "days since 2006-01-01 UTC"
const ANKI_EPOCH_MS = 1136073600000;
const MS_PER_DAY = 86400000;

interface AnkiMeta {
    css?: string;
    type?: number;
    mod?: number;
    queue?: number;
    conf?: number;
    collapsed?: boolean;
    dconf?: Record<string, unknown> | null;
    fields?: Array<{ name: string; sticky: boolean; font: string; size: number }>;
    templates?: Array<{ name: string; bqfmt?: string; bafmt?: string }>;
}

function parseAnkiMeta(raw: string | null): AnkiMeta {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Builds an Anki collection.anki21 SQLite database from a Sekel deck.
 * Only includes entities with anki_id (Anki-imported data).
 * Returns the path to the temporary SQLite file.
 */
export function buildAnkiDatabase(deckId: string, userId: string): string {
    const sekelDb = getDb();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sekel-export-'));
    const dbPath = path.join(tmpDir, 'collection.anki21');
    const ankiDb = new Database(dbPath);

    try {
        ankiDb.pragma('journal_mode = DELETE'); // Anki uses DELETE journal mode

        createAnkiSchema(ankiDb);

        // Fetch deck (must have anki_id)
        const deck = sekelDb.prepare(
            'SELECT * FROM decks WHERE id = ? AND user_id = ?'
        ).get(deckId, userId) as Record<string, unknown> | undefined;

        if (!deck || !deck.anki_id) {
            throw new Error('Deck not found or has no Anki ID');
        }

        // Also fetch child decks (subdecks)
        const allDecks = [deck, ...sekelDb.prepare(
            'SELECT * FROM decks WHERE parent_id = ? AND user_id = ? AND anki_id IS NOT NULL'
        ).all(deckId, userId) as Record<string, unknown>[]];

        const deckIds = allDecks.map(d => d.id as string);

        // Fetch exportable notes (with anki_id) from all deck ids
        const placeholders = deckIds.map(() => '?').join(',');
        const notes = sekelDb.prepare(
            `SELECT * FROM notes WHERE deck_id IN (${placeholders}) AND anki_id IS NOT NULL`
        ).all(...deckIds) as Record<string, unknown>[];

        if (notes.length === 0) {
            ankiDb.close();
            return dbPath;
        }

        const noteIds = notes.map(n => n.id as string);
        const notePlaceholders = noteIds.map(() => '?').join(',');

        // Fetch exportable cards (with anki_id) for those notes
        const cards = sekelDb.prepare(
            `SELECT * FROM cards WHERE note_id IN (${notePlaceholders}) AND anki_id IS NOT NULL`
        ).all(...noteIds) as Record<string, unknown>[];

        // Fetch reviews for exported cards
        const cardSekelIds = cards.map(c => c.id as string);
        let reviews: Record<string, unknown>[] = [];
        if (cardSekelIds.length > 0) {
            const cardPlaceholders = cardSekelIds.map(() => '?').join(',');
            reviews = sekelDb.prepare(
                `SELECT * FROM reviews WHERE card_id IN (${cardPlaceholders})`
            ).all(...cardSekelIds) as Record<string, unknown>[];
        }

        // Collect note type IDs used by these notes
        const noteTypeIds = [...new Set(notes.map(n => n.note_type_id as string))];
        const ntPlaceholders = noteTypeIds.map(() => '?').join(',');
        const noteTypes = sekelDb.prepare(
            `SELECT * FROM note_types WHERE id IN (${ntPlaceholders})`
        ).all(...noteTypeIds) as Record<string, unknown>[];

        // Build lookup maps
        const noteById = new Map(notes.map(n => [n.id as string, n]));
        const noteTypeById = new Map(noteTypes.map(nt => [nt.id as string, nt]));

        // Build col table
        const models = buildModelsJson(noteTypes);
        const decksJson = buildDecksJson(allDecks);
        const dconfJson = buildDconfJson(allDecks);

        ankiDb.prepare(`
            INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            1,                                          // id
            Math.floor(Date.now() / 1000),             // crt (creation time)
            Math.floor(Date.now() / 1000),             // mod
            Math.floor(Date.now()),                     // scm (schema mod)
            11,                                         // ver (schema version)
            0,                                          // dty (dirty flag)
            -1,                                         // usn
            0,                                          // ls (last sync)
            '{}',                                       // conf
            JSON.stringify(models),                     // models
            JSON.stringify(decksJson),                  // decks
            JSON.stringify(dconfJson),                  // dconf
            '{}',                                       // tags
        );

        // Insert notes
        const insertNote = ankiDb.prepare(`
            INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const note of notes) {
            const noteType = noteTypeById.get(note.note_type_id as string);
            if (!noteType || !noteType.anki_id) continue;

            const meta = parseAnkiMeta(note.anki_meta as string | null);
            const fields: Record<string, string> = typeof note.fields === 'string'
                ? JSON.parse(note.fields as string) : note.fields as Record<string, string>;
            const tags: string[] = typeof note.tags === 'string'
                ? JSON.parse(note.tags as string) : note.tags as string[];

            // Get field order from note type
            const ntFields: Array<{ name: string }> = typeof noteType.fields === 'string'
                ? JSON.parse(noteType.fields as string) : noteType.fields as Array<{ name: string }>;

            const flds = ntFields.map(f => fields[f.name] ?? '').join('\x1f');
            const sfld = ntFields.length > 0 ? (fields[ntFields[0].name] ?? '') : '';
            const mod = meta.mod ?? Math.floor(Date.parse(note.updated_at as string) / 1000);

            insertNote.run(
                note.anki_id,                           // id
                note.anki_guid ?? randomUUID().slice(0, 10), // guid
                noteType.anki_id,                       // mid
                mod,                                    // mod
                -1,                                     // usn
                tags.join(' '),                         // tags
                flds,                                   // flds
                sfld.replace(/<[^>]*>/g, '').slice(0, 100), // sfld (sort field, strip HTML)
                fieldChecksum(sfld),                    // csum
                0,                                      // flags
                '',                                     // data
            );
        }

        // Insert cards
        const insertCard = ankiDb.prepare(`
            INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Build note anki_id lookup (sekel note id → anki note id)
        const noteAnkiIdMap = new Map(notes.map(n => [n.id as string, n.anki_id as number]));
        // Build card sekel_id → anki_id lookup
        const cardSekelToAnkiId = new Map(cards.map(c => [c.id as string, c.anki_id as number]));

        for (const card of cards) {
            const noteAnkiId = noteAnkiIdMap.get(card.note_id as string);
            if (!noteAnkiId) continue;

            const note = noteById.get(card.note_id as string);
            if (!note) continue;

            // Find the deck anki_id for this card's note
            const cardDeck = allDecks.find(d => d.id === note.deck_id);
            const deckAnkiId = cardDeck?.anki_id as number ?? deck.anki_id as number;

            const meta = parseAnkiMeta(card.anki_meta as string | null);
            const state = card.state as string;
            const type = mapStateToAnkiType(state);
            const queue = meta.queue ?? mapStateToAnkiQueue(state);
            const due = computeAnkiDue(card.due as string, state);
            const mod = meta.mod ?? Math.floor(Date.parse(card.updated_at as string) / 1000);
            const factor = card.ease_factor
                ? Math.round((card.ease_factor as number) * 1000)
                : deriveFactor(card.difficulty as number);

            insertCard.run(
                card.anki_id,                           // id
                noteAnkiId,                             // nid
                deckAnkiId,                             // did
                card.template_index ?? 0,               // ord
                mod,                                    // mod
                -1,                                     // usn
                type,                                   // type
                queue,                                  // queue
                due,                                    // due
                card.scheduled_days ?? 0,               // ivl
                factor,                                 // factor
                card.reps ?? 0,                         // reps
                card.lapses ?? 0,                       // lapses
                0,                                      // left
                0,                                      // odue
                0,                                      // odid
                0,                                      // flags
                '',                                     // data
            );
        }

        // Insert review logs
        const insertRevlog = ankiDb.prepare(`
            INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const review of reviews) {
            const cardAnkiId = cardSekelToAnkiId.get(review.card_id as string);
            if (!cardAnkiId) continue;

            const reviewTime = Date.parse(review.review_time as string);
            const ease = mapRatingToAnkiEase(review.rating as string);
            const ivl = (review.scheduled_days as number) ?? 0;
            const lastIvl = (review.interval_before as number) ?? 0;
            const factor = review.ease_factor_after
                ? Math.round((review.ease_factor_after as number) * 1000)
                : 0;
            const time = (review.review_duration_ms as number) ?? 0;
            const type = (review.review_type as number) ?? mapStateToRevlogType(review.state_before as string);

            insertRevlog.run(
                reviewTime,                             // id (unix ms)
                cardAnkiId,                             // cid
                -1,                                     // usn
                ease,                                   // ease
                ivl,                                    // ivl
                lastIvl,                                // lastIvl
                factor,                                 // factor
                time,                                   // time
                type,                                   // type
            );
        }

        return dbPath;
    } finally {
        ankiDb.close();
    }
}

/**
 * Returns counts of Anki-imported vs Sekel-native cards in a deck.
 */
export function getExportableCardCount(deckId: string): { ankiCards: number; sekelCards: number } {
    const db = getDb();

    // Include child decks
    const childDeckIds = (db.prepare(
        'SELECT id FROM decks WHERE parent_id = ?'
    ).all(deckId) as Array<{ id: string }>).map(r => r.id);

    const allDeckIds = [deckId, ...childDeckIds];
    const placeholders = allDeckIds.map(() => '?').join(',');

    const noteIds = (db.prepare(
        `SELECT id FROM notes WHERE deck_id IN (${placeholders})`
    ).all(...allDeckIds) as Array<{ id: string }>).map(r => r.id);

    if (noteIds.length === 0) return { ankiCards: 0, sekelCards: 0 };

    const notePlaceholders = noteIds.map(() => '?').join(',');
    const result = db.prepare(`
        SELECT
            SUM(CASE WHEN anki_id IS NOT NULL THEN 1 ELSE 0 END) as anki,
            SUM(CASE WHEN anki_id IS NULL THEN 1 ELSE 0 END) as sekel
        FROM cards WHERE note_id IN (${notePlaceholders})
    `).get(...noteIds) as { anki: number; sekel: number };

    return { ankiCards: result.anki ?? 0, sekelCards: result.sekel ?? 0 };
}

// ── Schema ──────────────────────────────────────────────────────────────────

function createAnkiSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE col (
            id      INTEGER PRIMARY KEY,
            crt     INTEGER NOT NULL,
            mod     INTEGER NOT NULL,
            scm     INTEGER NOT NULL,
            ver     INTEGER NOT NULL,
            dty     INTEGER NOT NULL,
            usn     INTEGER NOT NULL,
            ls      INTEGER NOT NULL,
            conf    TEXT NOT NULL,
            models  TEXT NOT NULL,
            decks   TEXT NOT NULL,
            dconf   TEXT NOT NULL,
            tags    TEXT NOT NULL
        );
        CREATE TABLE notes (
            id      INTEGER PRIMARY KEY,
            guid    TEXT NOT NULL,
            mid     INTEGER NOT NULL,
            mod     INTEGER NOT NULL,
            usn     INTEGER NOT NULL,
            tags    TEXT NOT NULL,
            flds    TEXT NOT NULL,
            sfld    TEXT NOT NULL,
            csum    INTEGER NOT NULL,
            flags   INTEGER NOT NULL,
            data    TEXT NOT NULL
        );
        CREATE TABLE cards (
            id      INTEGER PRIMARY KEY,
            nid     INTEGER NOT NULL,
            did     INTEGER NOT NULL,
            ord     INTEGER NOT NULL,
            mod     INTEGER NOT NULL,
            usn     INTEGER NOT NULL,
            type    INTEGER NOT NULL,
            queue   INTEGER NOT NULL,
            due     INTEGER NOT NULL,
            ivl     INTEGER NOT NULL,
            factor  INTEGER NOT NULL,
            reps    INTEGER NOT NULL,
            lapses  INTEGER NOT NULL,
            left    INTEGER NOT NULL,
            odue    INTEGER NOT NULL,
            odid    INTEGER NOT NULL,
            flags   INTEGER NOT NULL,
            data    TEXT NOT NULL
        );
        CREATE TABLE revlog (
            id      INTEGER PRIMARY KEY,
            cid     INTEGER NOT NULL,
            usn     INTEGER NOT NULL,
            ease    INTEGER NOT NULL,
            ivl     INTEGER NOT NULL,
            lastIvl INTEGER NOT NULL,
            factor  INTEGER NOT NULL,
            time    INTEGER NOT NULL,
            type    INTEGER NOT NULL
        );
        CREATE TABLE graves (
            usn     INTEGER NOT NULL,
            oid     INTEGER NOT NULL,
            type    INTEGER NOT NULL
        );
    `);
}

// ── Col JSON builders ───────────────────────────────────────────────────────

function buildModelsJson(noteTypes: Record<string, unknown>[]): Record<string, unknown> {
    const models: Record<string, unknown> = {};
    for (const nt of noteTypes) {
        if (!nt.anki_id) continue;
        const meta = parseAnkiMeta(nt.anki_meta as string | null);
        const fields: Array<{ name: string }> = typeof nt.fields === 'string'
            ? JSON.parse(nt.fields as string) : nt.fields as Array<{ name: string }>;
        const templates: Array<{ name: string; front_template: string; back_template: string }> =
            typeof nt.card_templates === 'string'
                ? JSON.parse(nt.card_templates as string)
                : nt.card_templates as Array<{ name: string; front_template: string; back_template: string }>;

        const ankiId = String(nt.anki_id);

        models[ankiId] = {
            id: nt.anki_id,
            name: nt.name,
            type: meta.type ?? 0,
            mod: meta.mod ?? Math.floor(Date.now() / 1000),
            usn: -1,
            sortf: 0,
            did: 1,
            tmpls: templates.map((t, i) => {
                const metaTmpl = meta.templates?.[i];
                return {
                    name: t.name,
                    ord: i,
                    qfmt: t.front_template,
                    afmt: t.back_template,
                    bqfmt: metaTmpl?.bqfmt ?? '',
                    bafmt: metaTmpl?.bafmt ?? '',
                    did: null,
                };
            }),
            flds: fields.map((f, i) => {
                const metaField = meta.fields?.find(mf => mf.name === f.name);
                return {
                    name: f.name,
                    ord: i,
                    sticky: metaField?.sticky ?? false,
                    rtl: false,
                    font: metaField?.font ?? 'Arial',
                    size: metaField?.size ?? 20,
                    media: [],
                };
            }),
            css: meta.css ?? '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
            latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
            latexPost: '\\end{document}',
            latexsvg: false,
            req: [],
            tags: [],
            vers: [],
        };
    }
    return models;
}

function buildDecksJson(decks: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {
        // Always include the default deck
        '1': {
            id: 1, name: 'Default', mod: Math.floor(Date.now() / 1000),
            usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
            timeToday: [0, 0], collapsed: false, desc: '', dyn: 0, conf: 1,
            extendNew: 10, extendRev: 50,
        },
    };

    for (const deck of decks) {
        if (!deck.anki_id) continue;
        const meta = parseAnkiMeta(deck.anki_meta as string | null);
        const ankiId = String(deck.anki_id);

        result[ankiId] = {
            id: deck.anki_id,
            name: deck.name,
            mod: meta.mod ?? Math.floor(Date.now() / 1000),
            usn: -1,
            lrnToday: [0, 0],
            revToday: [0, 0],
            newToday: [0, 0],
            timeToday: [0, 0],
            collapsed: meta.collapsed ?? false,
            desc: (deck.description as string) ?? '',
            dyn: 0,
            conf: meta.conf ?? 1,
            extendNew: 10,
            extendRev: 50,
        };
    }

    return result;
}

function buildDconfJson(decks: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {
        // Always include default config
        '1': {
            id: 1, name: 'Default', mod: 0, usn: -1, maxTaken: 60, autoplay: true,
            timer: 0, replayq: true,
            new: { delays: [1, 10], order: 1, perDay: 20, ints: [1, 4, 0], initialFactor: 2500, bury: false },
            rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
            lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
        },
    };

    // Collect unique deck configs from anki_meta
    for (const deck of decks) {
        const meta = parseAnkiMeta(deck.anki_meta as string | null);
        if (meta.dconf && meta.conf) {
            const confId = String(meta.conf);
            if (!result[confId]) {
                result[confId] = meta.dconf;
            }
        }
    }

    return result;
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

function mapStateToAnkiType(state: string): number {
    switch (state) {
        case 'new': return 0;
        case 'learning': return 1;
        case 'review': return 2;
        case 'relearning': return 3;
        default: return 0;
    }
}

function mapStateToAnkiQueue(state: string): number {
    switch (state) {
        case 'new': return 0;
        case 'learning': return 1;
        case 'review': return 2;
        case 'relearning': return 1;
        default: return 0;
    }
}

function computeAnkiDue(dueIso: string, state: string): number {
    if (state === 'new') return 0;

    if (state === 'review') {
        // Review: days since Anki epoch
        const dueMs = Date.parse(dueIso);
        return Math.round((dueMs - ANKI_EPOCH_MS) / MS_PER_DAY);
    }

    // Learning/relearning: Unix timestamp in seconds
    return Math.round(Date.parse(dueIso) / 1000);
}

function deriveFactor(difficulty: number): number {
    // Reverse of import formula: difficulty = (3500 - factor) / 200
    // factor = 3500 - difficulty * 200
    const factor = Math.round(3500 - difficulty * 200);
    return Math.max(1300, Math.min(factor, 5000));
}

function mapRatingToAnkiEase(rating: string): number {
    switch (rating) {
        case 'again': return 1;
        case 'hard': return 2;
        case 'good': return 3;
        case 'easy': return 4;
        default: return 3;
    }
}

function mapStateToRevlogType(stateBefore: string): number {
    switch (stateBefore) {
        case 'new': return 0;         // learn
        case 'learning': return 0;    // learn
        case 'review': return 1;      // review
        case 'relearning': return 2;  // relearn
        default: return 1;
    }
}

/**
 * Computes the Anki-style checksum for the sort field.
 * First 8 hex digits of SHA1 → unsigned 32-bit int.
 */
function fieldChecksum(sortField: string): number {
    // Simple hash — Anki uses first 4 bytes of SHA1 as unsigned int
    // We approximate with a simple string hash for compatibility
    const stripped = sortField.replace(/<[^>]*>/g, '');
    let hash = 0;
    for (let i = 0; i < stripped.length; i++) {
        hash = ((hash << 5) - hash + stripped.charCodeAt(i)) | 0;
    }
    return hash >>> 0; // unsigned 32-bit
}
