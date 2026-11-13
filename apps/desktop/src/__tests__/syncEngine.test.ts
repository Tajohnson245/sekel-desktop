/**
 * End-to-end sync (SEKEL-157): two devices (two SQLite databases with the real
 * migrations) syncing through the real engine against one Postgres (PGlite)
 * with the real Supabase migrations and sync RPCs.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { MIGRATIONS } from '../main/db/migrations';
import { createAuthUser, createSupabaseDb, rpc } from './helpers/supabaseHarness';

let current: Database.Database;
vi.mock('../main/db/index', () => ({ getDb: () => current, initDatabase: vi.fn() }));
vi.mock('../main/backup/deletionLog', () => ({
    logDeckDeletion: vi.fn(), logNoteDeletion: vi.fn(), logAllDecksDeletion: vi.fn(), logAllNotesInDeckDeletion: vi.fn(),
}));

import { createDeck, createNote, createNoteType, createCard, deleteDeck, recordReview, updateDeck, saveDraft, createDeckSession } from '../main/db/service';
import { SyncEngine } from '../main/sync/engine';
import { classifyRpcError } from '../main/sync/supabaseTransport';
import { markRestored } from '../main/sync/meta';
import { SyncError, type SyncTransport } from '../main/sync/types';

let pg: PGlite;
/** A fresh account per test, so devices only ever see that test's data. */
let USER: string;

beforeAll(async () => {
    pg = await createSupabaseDb();
}, 120_000);

beforeEach(async () => {
    USER = randomUUID();
    await createAuthUser(pg, USER);
    await pg.query(`update public.app_config set value = '{"enabled": true, "allow_users": []}' where key = 'sync'`);
});

// ── Devices ─────────────────────────────────────────────────────────────────

interface Device {
    name: string;
    db: Database.Database;
    engine: SyncEngine;
    mediaDir: string;
    transport: SyncTransport;
}

const storage = new Map<string, Buffer>();
const devices: Device[] = [];

function pgTransport(userId: string): SyncTransport {
    const call = async <T,>(fn: string, args: unknown[]): Promise<T> => {
        try {
            return await rpc<T>(pg, userId, fn, args);
        } catch (err) {
            const e = err as { code?: string; message?: string };
            throw classifyRpcError({ code: e.code, message: e.message });
        }
    };
    return {
        hello: () => call('sync_hello_v1', []),
        push: (device, payload, force) => call('sync_push_v1', [device, JSON.stringify(payload), force]),
        pull: (since, limit, skip) => call('sync_pull_v1', [since, limit, skip]),
        prune: (before) => call('sync_prune_v1', [before]),
        uploadMedia: async (p, data) => { storage.set(p, data); },
        downloadMedia: async (p) => {
            const d = storage.get(p);
            if (!d) throw new SyncError('transient', 'not found');
            return d;
        },
    };
}

/** A fresh device; `examOffset` makes its blueprint rowids differ from other devices'. */
function newDevice(name: string, examOffset = 0): Device {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        db.exec(MIGRATIONS[i]);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    for (let i = 0; i < examOffset; i++) {
        db.prepare(`INSERT INTO blueprint_exams (exam_key, label, updated_at) VALUES (?, 'filler', 'x')`).run(`filler-${i}`);
    }
    const examId = (db.prepare(`INSERT INTO blueprint_exams (exam_key, label, updated_at) VALUES ('usmle-step1', 'Step 1', 'x') RETURNING id`).get() as { id: number }).id;
    for (const sys of ['cardio', 'renal']) {
        const sid = (db.prepare(`INSERT INTO blueprint_systems (exam_id, system_key, label) VALUES (?, ?, ?) RETURNING id`).get(examId, sys, sys) as { id: number }).id;
        db.prepare(`INSERT INTO blueprint_topics (system_id, topic_key, label) VALUES (?, ?, ?)`).run(sid, `${sys}-topic`, sys);
    }
    const mediaDir = mkdtempSync(path.join(os.tmpdir(), `sekel-sync-${name}-`));
    const userId = USER;
    const transport = pgTransport(userId);
    const deviceId = randomUUID();
    const device: Device = { name, db, mediaDir, transport, engine: undefined as unknown as SyncEngine };
    device.engine = new SyncEngine({
        db: () => device.db,
        getSession: () => ({ userId }),
        transportFor: () => transport,
        deviceId: () => deviceId,
        mediaDir: () => mediaDir,
    });
    devices.push(device);
    return device;
}

afterEach(() => {
    for (const d of devices.splice(0)) {
        d.engine.stop();
        d.db.close();
        rmSync(d.mediaDir, { recursive: true, force: true });
    }
});

async function sync(d: Device) {
    const status = await d.engine.syncNow();
    expect(status.state, `${d.name}: ${status.lastError}`).toBe('idle');
    return status;
}

function on<T>(d: Device, fn: () => T): T {
    current = d.db;
    return fn();
}

function examId(d: Device): number {
    return (d.db.prepare(`SELECT id FROM blueprint_exams WHERE exam_key = 'usmle-step1'`).get() as { id: number }).id;
}

function seedLibrary(d: Device) {
    return on(d, () => {
        const nt = createNoteType({ user_id: USER, name: 'Basic', fields: [{ name: 'Front' }, { name: 'Back' }], card_templates: [{ name: 'C1', front_template: '{{Front}}', back_template: '{{Back}}' }] });
        const deck = createDeck({ user_id: USER, name: 'Cardio', description: 'hearts', algorithm: 'fsrs', parent_id: null, anki_id: null });
        const note = createNote({ user_id: USER, deck_id: deck.id, note_type_id: nt.id, fields: { Front: 'Q1', Back: 'A1' }, tags: ['a', 'b'] });
        const card = createCard({ user_id: USER, note_id: note.id, template_index: 0, state: 'new', due: '2026-11-01T00:00:00.000Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null });
        return { nt, deck, note, card };
    });
}

function rows(d: Device, sql: string, ...params: unknown[]) {
    return d.db.prepare(sql).all(...params);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('first sync', () => {
    it('uploads a whole library and another device downloads it', async () => {
        const a = newDevice('a');
        const lib = seedLibrary(a);
        on(a, () => {
            const session = createDeckSession(USER, lib.deck.id);
            recordReview(lib.card.id, { state: 'learning', stability: 2, difficulty: 5, reps: 1, last_review: '2026-11-02T10:00:00.000Z', due: '2026-11-02T10:10:00.000Z' }, {
                user_id: USER, card_id: lib.card.id, rating: 'good', session_id: session.id, deck_id: lib.deck.id, review_index: 1,
                review_duration_ms: 900, state_before: 'new', stability_before: 0, difficulty_before: 0,
                state_after: 'learning', stability_after: 2, difficulty_after: 5, scheduled_days: 0,
            } as never);
            saveDraft(USER, { front: 'draft f', back: 'draft b', source: 'ai' } as never);
            a.db.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                          VALUES (?, ?, '2027-06-01', 1, 'auto', 'now', '2026-11-01T00:00:00.000Z')`).run(USER, examId(a));
        });
        const status = await sync(a);
        expect(status.pending).toBe(0);
        expect(rows(a, 'SELECT * FROM sync_outbox')).toEqual([]);

        const b = newDevice('b', 3); // different blueprint rowids
        await sync(b);

        const cols = 'id, name, description, algorithm, parent_id';
        expect(rows(b, `SELECT ${cols} FROM decks`)).toEqual(rows(a, `SELECT ${cols} FROM decks`));
        expect(rows(b, 'SELECT id, fields, tags, deck_id FROM notes')).toEqual(rows(a, 'SELECT id, fields, tags, deck_id FROM notes'));
        const cardCols = 'id, note_id, state, due, stability, difficulty, reps, last_review, learning_steps';
        expect(rows(b, `SELECT ${cardCols} FROM cards`)).toEqual(rows(a, `SELECT ${cardCols} FROM cards`));
        expect(rows(b, 'SELECT id, rating, session_id, deck_id, review_time FROM reviews')).toEqual(rows(a, 'SELECT id, rating, session_id, deck_id, review_time FROM reviews'));
        expect(rows(b, 'SELECT front, back, source FROM card_drafts')).toEqual([{ front: 'draft f', back: 'draft b', source: 'ai' }]);
        // Exam profile mapped onto B's own blueprint rowid.
        expect(rows(b, 'SELECT exam_id, exam_date, is_primary FROM user_exam_profiles')).toEqual([{ exam_id: examId(b), exam_date: '2027-06-01', is_primary: 1 }]);
        expect(examId(b)).not.toBe(examId(a));
        // Applying pulled rows doesn't queue them to be pushed back.
        expect(rows(b, 'SELECT * FROM sync_outbox')).toEqual([]);
    });
});

describe('ongoing sync', () => {
    it('carries edits, reviews and cascading deletes both ways', async () => {
        const a = newDevice('a');
        const b = newDevice('b');
        const lib = seedLibrary(a);
        await sync(a);
        await sync(b);

        on(b, () => updateDeck(lib.deck.id, { name: 'Cardiology' }));
        await sync(b);
        await sync(a);
        expect(rows(a, 'SELECT name FROM decks')).toEqual([{ name: 'Cardiology' }]);

        on(a, () => deleteDeck(lib.deck.id));
        await sync(a);
        await sync(b);
        expect(rows(b, 'SELECT COUNT(*) AS n FROM decks')).toEqual([{ n: 0 }]);
        expect(rows(b, 'SELECT COUNT(*) AS n FROM notes')).toEqual([{ n: 0 }]);
        expect(rows(b, 'SELECT COUNT(*) AS n FROM cards')).toEqual([{ n: 0 }]);
        const { rows: server } = await pg.query<{ n: number }>('select count(*)::int as n from public.cards where id = $1 and deleted_at is not null', [lib.card.id]);
        expect(server[0].n).toBe(1);
    });

    it('settles a conflict on the later edit, even when that device had already pulled', async () => {
        const a = newDevice('a');
        const b = newDevice('b');
        const lib = seedLibrary(a);
        await sync(a);
        await sync(b);

        on(a, () => updateDeck(lib.deck.id, { name: 'A edit' }));
        await new Promise((r) => setTimeout(r, 15));
        on(b, () => updateDeck(lib.deck.id, { name: 'B edit (later)' }));
        await sync(b);
        // A still has its older edit pending: its push loses, the server re-sends
        // B's version, and A converges on it.
        await sync(a);
        await sync(a);
        await sync(b);
        expect(rows(a, 'SELECT name FROM decks')).toEqual([{ name: 'B edit (later)' }]);
        expect(rows(b, 'SELECT name FROM decks')).toEqual([{ name: 'B edit (later)' }]);
    });

    it('syncs classification sets across installs with different blueprint ids', async () => {
        const a = newDevice('a');
        const b = newDevice('b', 5);
        const lib = seedLibrary(a);
        const sys = (d: Device, key: string) => (d.db.prepare('SELECT id FROM blueprint_systems WHERE system_key = ? AND exam_id = ?').get(key, examId(d)) as { id: number }).id;
        const topic = (d: Device, key: string) => (d.db.prepare('SELECT id FROM blueprint_topics WHERE topic_key = ?').get(key) as { id: number }).id;
        a.db.prepare(`INSERT INTO card_classifications (card_id, user_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version)
                      VALUES (?, ?, ?, ?, ?, 0.9, 1, '2026-11-03T00:00:00.000Z', 'gpt-4.1-mini#v2')`)
            .run(lib.card.id, USER, examId(a), sys(a, 'cardio'), topic(a, 'cardio-topic'));
        await sync(a);
        await sync(b);
        expect(rows(b, 'SELECT exam_id, system_id, topic_id, confidence FROM card_classifications')).toEqual([
            { exam_id: examId(b), system_id: sys(b, 'cardio'), topic_id: topic(b, 'cardio-topic'), confidence: 0.9 },
        ]);

        // Re-classified on A as off-exam: the set is replaced everywhere.
        a.db.prepare('DELETE FROM card_classifications WHERE card_id = ?').run(lib.card.id);
        a.db.prepare(`INSERT INTO card_classifications (card_id, user_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version)
                      VALUES (?, ?, ?, NULL, NULL, 0, 1, '2026-11-04T00:00:00.000Z', 'gpt-4.1-mini#v2')`).run(lib.card.id, USER, examId(a));
        await sync(a);
        await sync(b);
        expect(rows(b, 'SELECT system_id, confidence FROM card_classifications')).toEqual([{ system_id: null, confidence: 0 }]);
    });
});

describe('media', () => {
    it('uploads the file with its row and downloads it on the other device on demand', async () => {
        const a = newDevice('a');
        const b = newDevice('b');
        const bytes = Buffer.from('fake png bytes');
        const hash = 'abc123';
        const filePath = path.join(a.mediaDir, `${hash}.png`);
        writeFileSync(filePath, bytes);
        const mediaId = randomUUID();
        a.db.prepare(`INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, created_at)
                      VALUES (?, ?, 'heart.png', ?, ?, ?, 'image/png', '2026-11-01T00:00:00.000Z')`)
            .run(mediaId, USER, filePath, hash, bytes.length);
        await sync(a);
        expect(storage.get(`${USER}/${hash}.png`)).toEqual(bytes);

        await sync(b);
        const row = b.db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId) as { user_id: string; file_path: string; file_hash: string; filename: string };
        expect(row.filename).toBe('heart.png');
        expect(row.file_path).toBe(path.join(b.mediaDir, `${hash}.png`));
        expect(existsSync(row.file_path)).toBe(false);
        const fetched = await b.engine.fetchMedia(row);
        expect(fetched).toBe(row.file_path);
        expect(readFileSync(row.file_path)).toEqual(bytes);
    });

    it('parks a media row whose file is gone instead of retrying forever', async () => {
        const a = newDevice('a');
        a.db.prepare(`INSERT INTO media (id, user_id, filename, file_path, file_hash, created_at) VALUES (?, ?, 'x.png', ?, 'gone', 'now')`)
            .run(randomUUID(), USER, path.join(a.mediaDir, 'missing.png'));
        const status = await sync(a);
        expect(status.failed).toBe(1);
        expect(status.pending).toBe(0);
    });
});

describe('switch and failures', () => {
    it('does nothing while the server switch is off', async () => {
        await pg.query(`update public.app_config set value = '{"enabled": false, "allow_users": []}' where key = 'sync'`);
        const a = newDevice('a');
        seedLibrary(a);
        const status = await a.engine.syncNow();
        expect(status.state).toBe('disabled');
        const { rows: server } = await pg.query<{ n: number }>('select count(*)::int as n from public.decks where user_id = $1 and name = $2', [USER, 'Cardio']);
        expect(server[0].n).toBe(0);
    });

    it('reports a server without the sync API as unavailable', async () => {
        const a = newDevice('a');
        a.transport.hello = async () => { throw classifyRpcError({ code: 'PGRST202', message: 'Could not find the function' }); };
        const status = await a.engine.syncNow();
        expect(status.state).toBe('unavailable');
    });

    it('isolates a row the server rejects and syncs the rest', async () => {
        const a = newDevice('a');
        const lib = seedLibrary(a);
        // reps out of Postgres integer range: that one row is rejected.
        a.db.prepare('UPDATE cards SET reps = 99999999999 WHERE id = ?').run(lib.card.id);
        const status = await sync(a);
        expect(status.failed).toBe(1);
        const failed = rows(a, 'SELECT table_name, row_id, last_error FROM sync_outbox') as Array<{ table_name: string; row_id: string; last_error: string }>;
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({ table_name: 'cards', row_id: lib.card.id });
        const { rows: server } = await pg.query<{ n: number }>('select count(*)::int as n from public.notes where id = $1', [lib.note.id]);
        expect(server[0].n).toBe(1);
    });
});

describe('restoring a backup', () => {
    it('makes the cloud match the restored library on every device', async () => {
        const a = newDevice('a');
        const b = newDevice('b');
        const lib = seedLibrary(a);
        await sync(a);
        const snapshot = a.db.serialize();

        const later = on(a, () => createDeck({ user_id: USER, name: 'Made after the backup', description: null, algorithm: 'fsrs', parent_id: null, anki_id: null }));
        on(a, () => updateDeck(lib.deck.id, { name: 'Renamed after the backup' }));
        await sync(a);
        await sync(b);
        expect(rows(b, 'SELECT name FROM decks ORDER BY name')).toEqual([{ name: 'Made after the backup' }, { name: 'Renamed after the backup' }]);

        // Restore the snapshot on A.
        a.db.close();
        a.db = new Database(snapshot);
        a.db.pragma('foreign_keys = ON');
        markRestored(a.db);
        await sync(a);
        await sync(b);
        expect(rows(b, 'SELECT id, name FROM decks')).toEqual([{ id: lib.deck.id, name: 'Cardio' }]);
        const { rows: server } = await pg.query<{ deleted_at: string | null }>('select deleted_at from public.decks where id = $1', [later.id]);
        expect(server[0].deleted_at).not.toBeNull();
        // Reconciled once; a later sync doesn't redo it.
        expect(rows(a, `SELECT COUNT(*) AS n FROM sync_outbox`)).toEqual([{ n: 0 }]);
    });
});
