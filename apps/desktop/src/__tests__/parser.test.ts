import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { parseAnkiDatabase } from '../main/import/parser';
import { InvalidApkgError } from '../main/import/types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

interface ColDbOptions {
    models?: Record<string, unknown>;
    decks?: Record<string, unknown>;
    dconf?: Record<string, unknown>;
    notes?: Array<{
        id: number;
        guid: string;
        mid: number;
        flds: string;
        tags: string;
        mod: number;
    }>;
    cards?: Array<{
        id: number;
        nid: number;
        did: number;
        ord: number;
        type: number;
        queue: number;
        due: number;
        ivl: number;
        factor: number;
        reps: number;
        lapses: number;
        mod: number;
    }>;
    revlog?: Array<{
        id: number;
        cid: number;
        ease: number;
        ivl: number;
        lastIvl: number;
        factor: number;
        time: number;
        type: number;
    }>;
}

const DEFAULT_MODEL = {
    id: 1001,
    name: 'Basic',
    flds: [
        { ord: 0, name: 'Front', sticky: false, font: 'Arial', size: 20 },
        { ord: 1, name: 'Back', sticky: false, font: 'Arial', size: 20 },
    ],
    tmpls: [
        { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' },
    ],
    css: '.card { font-family: Arial; }',
    type: 0,
    mod: 1700000000,
};

const DEFAULT_DECK = {
    id: 2001,
    name: 'Science::Biology',
    conf: 1,
    mod: 1700000000,
    collapsed: false,
};

const DEFAULT_DCONF = {
    id: 1,
    name: 'Default',
    new: { perDay: 20, delays: [1, 10], order: 1 },
    rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500 },
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
};

const DEFAULT_NOTE = {
    id: 3001,
    guid: 'abc123',
    mid: 1001,
    flds: 'Hello\x1fWorld',
    tags: ' tag1 tag2 ',
    mod: 1700000000,
};

const DEFAULT_CARD = {
    id: 4001,
    nid: 3001,
    did: 2001,
    ord: 0,
    type: 0,
    queue: 0,
    due: 1,
    ivl: 0,
    factor: 0,
    reps: 0,
    lapses: 0,
    mod: 1700000000,
};

const DEFAULT_REVLOG = {
    id: 5001,
    cid: 4001,
    ease: 3,
    ivl: 7,
    lastIvl: 1,
    factor: 2500,
    time: 5000,
    type: 1,
};

async function makeAnkiColDb(opts: ColDbOptions = {}): Promise<string> {
    const dbPath = path.join(os.tmpdir(), `parser-test-${randomUUID()}.db`);
    const db = new Database(dbPath);

    db.exec(`
        CREATE TABLE col (
            id INTEGER PRIMARY KEY,
            crt INTEGER NOT NULL,
            mod INTEGER NOT NULL,
            scm INTEGER NOT NULL,
            ver INTEGER NOT NULL,
            dty INTEGER NOT NULL,
            usn INTEGER NOT NULL,
            ls INTEGER NOT NULL,
            conf TEXT NOT NULL,
            models TEXT NOT NULL,
            decks TEXT NOT NULL,
            dconf TEXT NOT NULL,
            tags TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY,
            guid TEXT NOT NULL,
            mid INTEGER NOT NULL,
            mod INTEGER NOT NULL,
            usn INTEGER NOT NULL,
            tags TEXT NOT NULL,
            flds TEXT NOT NULL,
            sfld INTEGER NOT NULL,
            csum INTEGER NOT NULL,
            flags INTEGER NOT NULL,
            data TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE cards (
            id INTEGER PRIMARY KEY,
            nid INTEGER NOT NULL,
            did INTEGER NOT NULL,
            ord INTEGER NOT NULL,
            mod INTEGER NOT NULL,
            usn INTEGER NOT NULL,
            type INTEGER NOT NULL,
            queue INTEGER NOT NULL,
            due INTEGER NOT NULL,
            ivl INTEGER NOT NULL,
            factor INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            lapses INTEGER NOT NULL,
            left INTEGER NOT NULL,
            odue INTEGER NOT NULL,
            odid INTEGER NOT NULL,
            flags INTEGER NOT NULL,
            data TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE revlog (
            id INTEGER PRIMARY KEY,
            cid INTEGER NOT NULL,
            usn INTEGER NOT NULL,
            ease INTEGER NOT NULL,
            ivl INTEGER NOT NULL,
            lastIvl INTEGER NOT NULL,
            factor INTEGER NOT NULL,
            time INTEGER NOT NULL,
            type INTEGER NOT NULL
        )
    `);

    const models = opts.models ?? { '1001': DEFAULT_MODEL };
    const decks = opts.decks ?? { '2001': DEFAULT_DECK };
    const dconf = opts.dconf ?? { '1': DEFAULT_DCONF };

    db.prepare(`
        INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
        VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', ?, ?, ?, '{}')
    `).run(JSON.stringify(models), JSON.stringify(decks), JSON.stringify(dconf));

    const notes = opts.notes ?? [DEFAULT_NOTE];
    const insertNote = db.prepare(
        "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, 0, ?, ?, 0, 0, 0, '')",
    );
    for (const n of notes) {
        insertNote.run(n.id, n.guid, n.mid, n.mod, n.tags, n.flds);
    }

    const cards = opts.cards ?? [DEFAULT_CARD];
    const insertCard = db.prepare(
        "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '')",
    );
    for (const c of cards) {
        insertCard.run(c.id, c.nid, c.did, c.ord, c.mod, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses);
    }

    const revlog = opts.revlog ?? [DEFAULT_REVLOG];
    const insertRevlog = db.prepare(
        'INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of revlog) {
        insertRevlog.run(r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type);
    }

    db.close();
    return dbPath;
}

const dbsToClean: string[] = [];

afterEach(async () => {
    for (const p of dbsToClean.splice(0)) {
        await fsPromises.unlink(p).catch(() => { /* already deleted */ });
    }
});

// ── col parsing ───────────────────────────────────────────────────────────────

describe('col parsing', () => {
    it('parses models with field defs and templates', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.models.size).toBe(1);
        const model = col.models.get(1001)!;
        expect(model.name).toBe('Basic');
        expect(model.flds).toHaveLength(2);
        expect(model.flds[0].name).toBe('Front');
        expect(model.flds[1].name).toBe('Back');
        expect(model.tmpls).toHaveLength(1);
        expect(model.tmpls[0].qfmt).toBe('{{Front}}');
    });

    it('parses deck hierarchy nameComponents from "::" separator', async () => {
        const dbPath = await makeAnkiColDb({
            decks: {
                '2001': { ...DEFAULT_DECK, name: 'Science::Biology' },
            },
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        const deck = col.decks.get(2001)!;
        expect(deck.nameComponents).toEqual(['Science', 'Biology']);
    });

    it('parses a flat deck name (no "::") into a single-element array', async () => {
        const dbPath = await makeAnkiColDb({
            decks: {
                '2001': { ...DEFAULT_DECK, name: 'Default' },
            },
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        const deck = col.decks.get(2001)!;
        expect(deck.nameComponents).toEqual(['Default']);
    });

    it('parses deck configs with new/rev/lapse sub-objects', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.deckConfigs.size).toBeGreaterThanOrEqual(1);
        const config = col.deckConfigs.get(1)!;
        expect(config.new.perDay).toBe(20);
        expect(config.rev.maxIvl).toBe(36500);
        expect(typeof config.lapse.leechFails).toBe('number');
    });

    it('throws InvalidApkgError when col table is empty', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        // Delete the col row to simulate an empty col table
        const db = new Database(dbPath);
        db.exec('DELETE FROM col');
        db.close();

        await expect(parseAnkiDatabase(dbPath)).rejects.toThrowError(InvalidApkgError);
        await expect(parseAnkiDatabase(dbPath)).rejects.toThrowError(/col table is empty/i);
    });

    it('throws InvalidApkgError when col.models contains invalid JSON', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const db = new Database(dbPath);
        db.exec("UPDATE col SET models = 'not-json'");
        db.close();

        await expect(parseAnkiDatabase(dbPath)).rejects.toThrowError(InvalidApkgError);
        await expect(parseAnkiDatabase(dbPath)).rejects.toThrowError(/col\.models/i);
    });
});

// ── notes parsing ─────────────────────────────────────────────────────────────

describe('notes parsing', () => {
    it('splits flds by \\x1f and maps values to field names from the model', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        const note = col.notes.get(3001)!;
        expect(note.fields).toEqual({ Front: 'Hello', Back: 'World' });
        expect(note.rawFlds).toBe('Hello\x1fWorld');
    });

    it('parses tags as a trimmed array of strings', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        const note = col.notes.get(3001)!;
        expect(note.tags).toEqual(['tag1', 'tag2']);
    });

    it('returns empty tags array for a note with no tags', async () => {
        const dbPath = await makeAnkiColDb({
            notes: [{ ...DEFAULT_NOTE, tags: ' ' }],
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.notes.get(3001)!.tags).toEqual([]);
    });

    it('emits a warning and uses fallback keys for a note with unknown mid', async () => {
        const dbPath = await makeAnkiColDb({
            notes: [{ ...DEFAULT_NOTE, mid: 9999 }],
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.warnings.some(w => /unknown model/i.test(w))).toBe(true);
        // Note is still present
        expect(col.notes.has(3001)).toBe(true);
        // Fields use positional fallback keys
        const note = col.notes.get(3001)!;
        expect(note.fields['field_0']).toBe('Hello');
        expect(note.fields['field_1']).toBe('World');
    });

    it('pads missing field values with empty strings when note has fewer values than model fields', async () => {
        const dbPath = await makeAnkiColDb({
            // flds has only 1 value but model has 2 fields
            notes: [{ ...DEFAULT_NOTE, flds: 'OnlyFront' }],
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        const note = col.notes.get(3001)!;
        expect(note.fields['Front']).toBe('OnlyFront');
        expect(note.fields['Back']).toBe('');
    });
});

// ── cards and revlog ──────────────────────────────────────────────────────────

describe('cards and revlog', () => {
    it('parses a card with correct nid and did linkage', async () => {
        const dbPath = await makeAnkiColDb();
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.cards).toHaveLength(1);
        const card = col.cards[0];
        expect(card.id).toBe(4001);
        expect(card.nid).toBe(3001);
        expect(card.did).toBe(2001);
    });

    it('emits a warning and still includes a card with an unknown nid', async () => {
        const dbPath = await makeAnkiColDb({
            cards: [{ ...DEFAULT_CARD, nid: 9999 }],
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.warnings.some(w => /unknown note/i.test(w))).toBe(true);
        // Card is still included
        expect(col.cards).toHaveLength(1);
        expect(col.cards[0].nid).toBe(9999);
    });

    it('parses revlog entries with correct numeric fields', async () => {
        const dbPath = await makeAnkiColDb({
            revlog: [
                DEFAULT_REVLOG,
                { id: 5002, cid: 4001, ease: 2, ivl: 3, lastIvl: 1, factor: 2350, time: 8000, type: 1 },
            ],
        });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.revlog).toHaveLength(2);
        const entry = col.revlog[0];
        expect(entry.id).toBe(5001);
        expect(entry.ease).toBe(3);
        expect(entry.ivl).toBe(7);
        expect(typeof entry.factor).toBe('number');
    });

    it('returns empty revlog array when no review history exists', async () => {
        const dbPath = await makeAnkiColDb({ revlog: [] });
        dbsToClean.push(dbPath);

        const col = await parseAnkiDatabase(dbPath);

        expect(col.revlog).toEqual([]);
        expect(col.warnings).not.toContain(expect.stringMatching(/revlog/i));
    });
});
