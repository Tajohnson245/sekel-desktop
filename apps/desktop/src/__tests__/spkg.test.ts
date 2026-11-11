import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { MIGRATIONS } from '../main/db/migrations';

// ── Environment ───────────────────────────────────────────────────────────────

let userDataDir = '';
let testDb: Database.Database;
let savePath = '';

vi.mock('electron', () => ({
    app: { getPath: () => userDataDir, getVersion: () => '9.9.9' },
    BrowserWindow: { getFocusedWindow: () => null },
    dialog: { showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: savePath })) },
}));

vi.mock('../main/db/index', () => ({ getDb: () => testDb }));

const mockCreateBackup = vi.fn().mockResolvedValue(null);
vi.mock('../main/backup/service', () => ({ createBackup: (...a: unknown[]) => mockCreateBackup(...a) }));

// Sanitisation and magic-byte detection have their own tests; keep these fast.
vi.mock('../main/import/sanitizeFields', () => ({
    sanitizeNoteFields: (f: unknown) => (typeof f === 'string' ? f : JSON.stringify(f)),
    sanitizeCardTemplates: (t: unknown) => (typeof t === 'string' ? t : JSON.stringify(t)),
}));
vi.mock('../main/import/mediaValidation', () => ({
    validateMediaBuffer: async (buf: Buffer) => (buf.subarray(0, 3).toString() === 'BAD'
        ? { valid: false, warning: 'not a real image' }
        : { valid: true, detectedMime: 'image/png' }),
}));

// Small limits so decompression-bomb cases stay cheap.
const LIMITS = { json: 256 * 1024, file: 64 * 1024, total: 1024 * 1024 };
vi.mock('../main/import/limits', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../main/import/limits')>()),
    MAX_JSON_BYTES: 256 * 1024,
    MAX_SINGLE_FILE_BYTES: 64 * 1024,
    MAX_DECOMPRESSED_BYTES: 1024 * 1024,
}));

import { exportAsSekel } from '../main/export/sekel';
import { getSekelImportSummary, importSekelFile } from '../main/import/sekel';
import { ImportSizeLimitError } from '../main/import/limits';
import { SpkgValidationError } from '../main/import/spkgSchema';

// ── Fixture: a small collection for user u1 ───────────────────────────────────
//
//   P ── C ── G        X            (decks; C is exported on its own below)
//   n1 (C): <img src="pic.png">     n3 (X): <img src="other.png">
//   n2 (G): [sound:snd.mp3]         note type nt1 template: <img src="_tmpl.png">
//   s1: session on C                s2: cross-deck session represented by X
//   r1: c1 in s1   r2: c1 in s2   r3: c3 in s2

const NOW = '2026-01-01T00:00:00.000Z';
const U1 = 'u1';

function setupDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        db.exec(MIGRATIONS[i]);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return db;
}

function addMedia(userId: string, filename: string, content: string): void {
    const buf = Buffer.from(content);
    const hash = createHash('sha1').update(buf).digest('hex');
    const dir = path.join(userDataDir, 'media');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, hash + path.extname(filename));
    fs.writeFileSync(filePath, buf);
    testDb.prepare(`INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), userId, filename, filePath, hash, buf.length, 'image/png', NOW);
}

function seedCollection(): void {
    const db = testDb;
    const nt = db.prepare(`INSERT INTO note_types (id, user_id, name, fields, card_templates, anki_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    nt.run('nt1', U1, 'Basic', '["Front","Back"]',
        JSON.stringify([{ name: 'Card 1', qfmt: '{{Front}}<img src="_tmpl.png">', afmt: '{{Back}}' }]), 111, NOW, NOW);
    nt.run('nt2', U1, 'Unused', '["Front"]', '[]', 222, NOW, NOW);

    const deck = db.prepare(`INSERT INTO decks (id, user_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
    deck.run('P', U1, 'Parent', null, NOW, NOW);
    deck.run('C', U1, 'Child', 'P', NOW, NOW);
    deck.run('G', U1, 'Grandchild', 'C', NOW, NOW);
    deck.run('X', U1, 'Other', null, NOW, NOW);

    const note = db.prepare(`INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, anki_guid, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)`);
    note.run('n1', U1, 'C', 'nt1', JSON.stringify({ Front: '<img src="pic.png">', Back: 'b' }), 'g1', NOW, NOW);
    note.run('n2', U1, 'G', 'nt1', JSON.stringify({ Front: '[sound:snd.mp3]', Back: '' }), 'g2', NOW, NOW);
    note.run('n3', U1, 'X', 'nt1', JSON.stringify({ Front: '<img src="other.png">', Back: '' }), null, NOW, NOW);

    const card = db.prepare(`INSERT INTO cards (id, user_id, note_id, due, anki_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    card.run('c1', U1, 'n1', NOW, 1001, NOW, NOW);
    card.run('c2', U1, 'n2', NOW, 1002, NOW, NOW);
    card.run('c3', U1, 'n3', NOW, null, NOW, NOW);

    const session = db.prepare(`INSERT INTO deck_sessions (id, user_id, deck_id, status, started_at, created_at, kind)
        VALUES (?, ?, ?, 'completed', ?, ?, ?)`);
    session.run('s1', U1, 'C', NOW, NOW, 'deck');
    session.run('s2', U1, 'X', NOW, NOW, 'review_all');

    const review = db.prepare(`INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before, stability_before,
        difficulty_before, state_after, stability_after, difficulty_after, scheduled_days, session_id, deck_id, created_at)
        VALUES (?, ?, ?, 'good', ?, 'new', 0, 0, 'review', 1, 5, 1, ?, ?, ?)`);
    review.run('r1', U1, 'c1', NOW, 's1', 'C', NOW);
    review.run('r2', U1, 'c1', NOW, 's2', 'C', NOW);
    review.run('r3', U1, 'c3', NOW, 's2', 'X', NOW);

    addMedia(U1, 'pic.png', 'png-pic');
    addMedia(U1, 'snd.mp3', 'mp3-snd');
    addMedia(U1, 'other.png', 'png-other');
    addMedia(U1, '_tmpl.png', 'png-tmpl');
}

async function exportZip(deckId: string | null, includeMedia = true): Promise<{ file: string; zip: JSZip }> {
    savePath = path.join(userDataDir, `export-${randomUUID()}.spkg`);
    const file = await exportAsSekel(U1, deckId, includeMedia);
    expect(file).toBe(savePath);
    return { file: savePath, zip: await JSZip.loadAsync(fs.readFileSync(savePath)) };
}

async function readJson<T>(zip: JSZip, name: string): Promise<T> {
    return JSON.parse(await zip.file(name)!.async('string')) as T;
}

async function writeZip(files: Record<string, string | Buffer>, compression: 'STORE' | 'DEFLATE' = 'DEFLATE'): Promise<string> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    const file = path.join(userDataDir, `crafted-${randomUUID()}.spkg`);
    fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression }));
    return file;
}

const count = (table: string, where = '1=1', ...params: unknown[]) =>
    (testDb.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params) as { n: number }).n;

const COLLECTION = JSON.stringify({ formatVersion: 1, exportDate: NOW });

beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sekel-spkg-test-'));
    testDb = setupDb();
    seedCollection();
    mockCreateBackup.mockClear();
});

afterEach(() => {
    testDb.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe('exportAsSekel', () => {
    it('single-deck export includes subdecks and detaches the root from its parent', async () => {
        const { zip } = await exportZip('C');
        const decks = await readJson<{ id: string; parent_id: string | null }[]>(zip, 'decks.json');
        expect(decks.map(d => d.id)).toEqual(['C', 'G']);
        expect(decks[0].parent_id).toBeNull();
        expect(decks[1].parent_id).toBe('C');

        const notes = await readJson<{ id: string }[]>(zip, 'notes.json');
        expect(notes.map(n => n.id).sort()).toEqual(['n1', 'n2']);
    });

    it('single-deck export carries only referenced media, used note types, and no local paths', async () => {
        const { zip } = await exportZip('C');

        const noteTypes = await readJson<{ id: string }[]>(zip, 'note_types.json');
        expect(noteTypes.map(nt => nt.id)).toEqual(['nt1']);

        const media = await readJson<{ filename: string; file_path: string }[]>(zip, 'media.json');
        expect(media.map(m => m.filename).sort()).toEqual(['_tmpl.png', 'pic.png', 'snd.mp3']);
        for (const m of media) {
            expect(m.file_path).not.toMatch(/[\\/:]/);
            expect(zip.file(`media/${m.file_path}`)).not.toBeNull();
            expect(Object.keys(m).sort()).toEqual(['file_path', 'filename', 'mime_type']);
        }
        const entries = Object.keys(zip.files).filter(n => n.startsWith('media/') && !zip.files[n].dir);
        expect(entries).toHaveLength(3);
        expect(JSON.stringify(media)).not.toContain(userDataDir.replace(/\\/g, '\\\\'));
    });

    it('full export keeps everything and orders parents before children', async () => {
        // X was created before its (new) parent Q, so row order alone is child-first.
        testDb.prepare(`INSERT INTO decks (id, user_id, name, created_at, updated_at) VALUES ('Q', ?, 'Q', ?, ?)`)
            .run(U1, NOW, NOW);
        testDb.prepare(`UPDATE decks SET parent_id = 'Q' WHERE id = 'X'`).run();

        const { zip } = await exportZip(null);
        const ids = (await readJson<{ id: string }[]>(zip, 'decks.json')).map(d => d.id);
        expect([...ids].sort()).toEqual(['C', 'G', 'P', 'Q', 'X']);
        expect(ids.indexOf('Q')).toBeLessThan(ids.indexOf('X'));
        expect(ids.indexOf('P')).toBeLessThan(ids.indexOf('C'));
        expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('G'));
        expect((await readJson<unknown[]>(zip, 'note_types.json'))).toHaveLength(2);
        expect((await readJson<unknown[]>(zip, 'media.json'))).toHaveLength(4);
    });
});

// ── Import ────────────────────────────────────────────────────────────────────

describe('importSekelFile', () => {
    it('round-trips a studied single-deck export into another account', async () => {
        const { file } = await exportZip('C');

        const result = await importSekelFile(file, 'u2');

        expect(result).toMatchObject({
            decksCreated: 2, notesInserted: 2, cardsInserted: 2,
            reviewsInserted: 2, sessionsInserted: 1, mediaExtracted: 3, warnings: [],
        });
        expect(mockCreateBackup).toHaveBeenCalledTimes(1);

        const decks = testDb.prepare('SELECT id, name, parent_id FROM decks WHERE user_id = ?').all('u2') as
            { id: string; name: string; parent_id: string | null }[];
        const child = decks.find(d => d.name === 'Child')!;
        const grand = decks.find(d => d.name === 'Grandchild')!;
        expect(child.parent_id).toBeNull();
        expect(grand.parent_id).toBe(child.id);

        // r1's session came along; r2's cross-deck session (represented by X) did not.
        const reviews = testDb.prepare(`SELECT r.session_id, r.deck_id, s.user_id AS s_user
            FROM reviews r LEFT JOIN deck_sessions s ON s.id = r.session_id WHERE r.user_id = ?`).all('u2') as
            { session_id: string | null; deck_id: string | null; s_user: string | null }[];
        expect(reviews.filter(r => r.session_id !== null)).toHaveLength(1);
        expect(reviews.find(r => r.session_id !== null)!.s_user).toBe('u2');
        for (const r of reviews) expect(r.deck_id).toBe(child.id);

        expect(count('media', 'user_id = ?', 'u2')).toBe(3);
        expect(testDb.pragma('foreign_key_check')).toEqual([]);
    });

    it('re-importing into the same account reuses its Anki note type instead of breaking notes', async () => {
        const { file } = await exportZip('C');
        const noteTypesBefore = count('note_types', 'user_id = ?', U1);

        const result = await importSekelFile(file, U1);

        expect(result.notesInserted).toBe(2);
        expect(count('note_types', 'user_id = ?', U1)).toBe(noteTypesBefore);
        expect(count('notes', "note_type_id = 'nt1'")).toBe(5);
        // Globally-unique Anki links stay on the originals; the copies drop them.
        expect(count('notes', "anki_guid = 'g1'")).toBe(1);
        expect(count('cards', 'user_id = ? AND anki_id = 1001', U1)).toBe(1);
        expect(testDb.pragma('foreign_key_check')).toEqual([]);
    });

    it('round-trips a full export (sessions and reviews intact)', async () => {
        const { file } = await exportZip(null);

        const result = await importSekelFile(file, 'u2');

        expect(result).toMatchObject({ decksCreated: 4, reviewsInserted: 3, sessionsInserted: 2, mediaExtracted: 4 });
        expect(count('reviews', 'user_id = ? AND session_id IS NULL', 'u2')).toBe(0);
        expect(testDb.pragma('foreign_key_check')).toEqual([]);
    });

    it('drops optional references that point outside the package and tolerates child-before-parent order', async () => {
        const file = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': JSON.stringify([
                { id: 'kid', name: 'Kid', parent_id: 'mom' },
                { id: 'mom', name: 'Mom', parent_id: 'not-exported' },
            ]),
            'note_types.json': JSON.stringify([{ id: 't', name: 'T', fields: '[]', card_templates: '[]' }]),
            'notes.json': JSON.stringify([{ id: 'n', deck_id: 'kid', note_type_id: 't', fields: '{}' }]),
            'cards.json': JSON.stringify([{ id: 'c', note_id: 'n', due: NOW }]),
            'sessions.json': JSON.stringify([{ id: 's', deck_id: 'kid', status: 'completed', started_at: NOW }]),
            'reviews.json': JSON.stringify([
                { id: 'r1', card_id: 'c', rating: 'good', review_time: NOW, state_before: 'new', stability_before: 0,
                    difficulty_before: 0, state_after: 'review', stability_after: 1, difficulty_after: 5,
                    scheduled_days: 1, session_id: 'gone', deck_id: 'gone-deck' },
                { id: 'r2', card_id: 'c', rating: 'good', review_time: NOW, state_before: 'review', stability_before: 1,
                    difficulty_before: 5, state_after: 'review', stability_after: 2, difficulty_after: 5,
                    scheduled_days: 2, session_id: 's', deck_id: 'kid' },
            ]),
        });

        const result = await importSekelFile(file, 'u3');

        expect(result.decksCreated).toBe(2);
        const mom = testDb.prepare("SELECT id, parent_id FROM decks WHERE user_id = 'u3' AND name = 'Mom'").get() as
            { id: string; parent_id: string | null };
        const kid = testDb.prepare("SELECT parent_id FROM decks WHERE user_id = 'u3' AND name = 'Kid'").get() as
            { parent_id: string | null };
        expect(mom.parent_id).toBeNull();
        expect(kid.parent_id).toBe(mom.id);
        expect(count('reviews', "user_id = 'u3' AND session_id IS NULL AND deck_id IS NULL")).toBe(1);
        expect(count('reviews', "user_id = 'u3' AND session_id IS NOT NULL AND deck_id IS NOT NULL")).toBe(1);
    });

    it('rejects a package with a dangling required reference before writing anything', async () => {
        const file = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': JSON.stringify([{ id: 'd', name: 'D' }]),
            'note_types.json': '[]',
            'notes.json': JSON.stringify([{ id: 'n', deck_id: 'd', note_type_id: 'missing', fields: '{}' }]),
        });
        const decksBefore = count('decks');

        await expect(importSekelFile(file, 'u3')).rejects.toThrow(SpkgValidationError);
        expect(count('decks')).toBe(decksBefore);
        expect(mockCreateBackup).not.toHaveBeenCalled();
    });

    it('treats a bad media file as a warning and still imports everything else', async () => {
        const file = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': JSON.stringify([{ id: 'd', name: 'D' }]),
            'media.json': JSON.stringify([
                { filename: 'good.png', file_path: 'C:\\Users\\someone\\AppData\\Roaming\\Sekel\\media\\aaa.png' },
                { filename: 'evil.png', file_path: 'bbb.png' },
            ]),
            'media/aaa.png': 'PNG-ish',
            'media/bbb.png': 'BAD bytes',
        });

        const result = await importSekelFile(file, 'u3');

        expect(result.decksCreated).toBe(1);
        expect(result.mediaExtracted).toBe(1);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/evil\.png/);
        // Legacy absolute file_path values are matched by their last segment.
        const row = testDb.prepare("SELECT filename, file_path FROM media WHERE user_id = 'u3'").get() as
            { filename: string; file_path: string };
        expect(row.filename).toBe('good.png');
        expect(row.file_path.startsWith(path.join(userDataDir, 'media'))).toBe(true);
    });

    it('does not treat the JSON parts as media', async () => {
        const { file } = await exportZip('C', false);
        const result = await importSekelFile(file, 'u2');
        expect(result.mediaExtracted).toBe(0);
        expect(result.warnings).toEqual([]);
        const summary = await getSekelImportSummary(file);
        expect(summary.hasMedia).toBe(false);
    });
});

// ── Decompression-bomb guards ─────────────────────────────────────────────────

/** Overwrites the declared uncompressed size of `name` in both ZIP headers. */
function patchDeclaredSize(buf: Buffer, name: string, size: number): Buffer {
    const out = Buffer.from(buf);
    for (let i = 0; i < out.length - 4; i++) {
        const sig = out.readUInt32LE(i);
        if (sig === 0x04034b50) { // local file header
            const len = out.readUInt16LE(i + 26);
            if (out.toString('utf8', i + 30, i + 30 + len) === name) out.writeUInt32LE(size, i + 22);
        } else if (sig === 0x02014b50) { // central directory header
            const len = out.readUInt16LE(i + 28);
            if (out.toString('utf8', i + 46, i + 46 + len) === name) out.writeUInt32LE(size, i + 24);
        }
    }
    return out;
}

describe('.spkg decompression limits', () => {
    function spyOnInflation() {
        const proto = Object.getPrototypeOf(new JSZip().file('x', 'y').file('x')!);
        return vi.spyOn(proto, 'nodeStream');
    }

    afterEach(() => { vi.restoreAllMocks(); });

    it('rejects a JSON part whose declared size exceeds the limit without inflating it', async () => {
        const file = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': '[' + ' '.repeat(LIMITS.json + 10) + ']',
        });
        const spy = spyOnInflation();

        await expect(getSekelImportSummary(file)).rejects.toThrow(ImportSizeLimitError);
        await expect(importSekelFile(file, 'u3')).rejects.toThrow(ImportSizeLimitError);

        const inflated = spy.mock.contexts.map(c => (c as { name: string }).name);
        expect(inflated).not.toContain('decks.json');
        expect(mockCreateBackup).not.toHaveBeenCalled();
    });

    it('stops inflating when an entry lies about its size', async () => {
        const honest = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': '[' + ' '.repeat(LIMITS.json * 2) + ']',
        });
        const lying = path.join(userDataDir, 'lying.spkg');
        fs.writeFileSync(lying, patchDeclaredSize(fs.readFileSync(honest), 'decks.json', 10));

        // JSZip 3.x exposes the central-directory size on the private _data
        // field the importer reads; confirm the header now claims 10 bytes so
        // only the streaming cap can catch this entry.
        const reloaded = await JSZip.loadAsync(fs.readFileSync(lying));
        const declared = (reloaded.file('decks.json') as unknown as { _data: { uncompressedSize: number } })
            ._data.uncompressedSize;
        expect(declared).toBe(10);

        await expect(getSekelImportSummary(lying)).rejects.toThrow(ImportSizeLimitError);
        await expect(importSekelFile(lying, 'u3')).rejects.toThrow(ImportSizeLimitError);
        expect(count('decks', "user_id = 'u3'")).toBe(0);
    });

    it('rejects an archive whose entries declare more than the cumulative limit, before writing', async () => {
        const files: Record<string, string> = {
            'collection.json': COLLECTION,
            'decks.json': JSON.stringify([{ id: 'd', name: 'D' }]),
        };
        for (let i = 0; i < 5; i++) files[`media/${i}.png`] = 'A'.repeat(LIMITS.total / 4);
        const file = await writeZip(files);
        const spy = spyOnInflation();

        await expect(importSekelFile(file, 'u3')).rejects.toThrow(ImportSizeLimitError);
        expect(spy).not.toHaveBeenCalled();
        expect(count('decks', "user_id = 'u3'")).toBe(0);
        expect(mockCreateBackup).not.toHaveBeenCalled();
    });

    it('skips an oversized media file with a warning instead of failing the import', async () => {
        const file = await writeZip({
            'collection.json': COLLECTION,
            'decks.json': JSON.stringify([{ id: 'd', name: 'D' }]),
            'media/big.png': 'A'.repeat(LIMITS.file + 1),
            'media/ok.png': 'PNG',
        });
        const spy = spyOnInflation();

        const result = await importSekelFile(file, 'u3');

        expect(result.decksCreated).toBe(1);
        expect(result.mediaExtracted).toBe(1);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/big\.png/);
        expect(spy.mock.contexts.map(c => (c as { name: string }).name)).not.toContain('media/big.png');
    });
});
