/**
 * The Supabase sync schema and API (SEKEL-157), on real Postgres (PGlite) with
 * every migration in supabase/migrations applied.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createAuthUser, createSupabaseDb, rpc } from './helpers/supabaseHarness';
import { SYNC_COLUMNS, SYNC_TABLES, type SyncColumnType } from '../main/sync/tables';

let pg: PGlite;

beforeAll(async () => {
    pg = await createSupabaseDb();
}, 120_000);

const PG_TYPES: Record<SyncColumnType, string> = {
    uuid: 'uuid', text: 'text', int: 'integer', bigint: 'bigint', real: 'double precision',
    bool: 'boolean', json: 'json', ts: 'timestamp with time zone',
};

type PushResult = { upserted: number; deleted: number; max_seq: number };
type PullResult = { changes: Array<{ t: string; seq: number; row: Record<string, unknown> | null }>; next: number; more: boolean };

const T0 = '2026-11-01T10:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

async function newUser(): Promise<string> {
    const id = randomUUID();
    await createAuthUser(pg, id);
    return id;
}

function push(userId: string, changes: unknown, device = DEVICE_A, force = false) {
    return rpc<PushResult>(pg, userId, 'sync_push_v1', [device, JSON.stringify(changes), force]);
}
function pull(userId: string, since = 0, limit = 500, skip: string | null = null) {
    return rpc<PullResult>(pg, userId, 'sync_pull_v1', [since, limit, skip]);
}

const DEVICE_A = randomUUID();
const DEVICE_B = randomUUID();

function deck(id = randomUUID(), changedAt = at(0), extra: Record<string, unknown> = {}) {
    return { id, name: 'Deck', description: null, created_at: T0, updated_at: changedAt, algorithm: 'fsrs', parent_id: null, anki_id: null, anki_meta: null, client_changed_at: changedAt, ...extra };
}
function noteType(id = randomUUID()) {
    return { id, name: 'Basic', fields: [{ name: 'Front' }], card_templates: [], created_at: T0, updated_at: T0, anki_id: null, anki_meta: null, client_changed_at: T0 };
}
function note(id: string, deckId: string, noteTypeId: string) {
    return { id, deck_id: deckId, note_type_id: noteTypeId, fields: { Front: 'Q' }, tags: [], created_at: T0, updated_at: T0, anki_id: null, anki_guid: null, anki_meta: null, format: null, client_changed_at: T0 };
}
function card(id: string, noteId: string, changedAt = T0) {
    return { id, note_id: noteId, template_index: 0, state: 'new', due: T0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null, created_at: T0, updated_at: changedAt, anki_id: null, ease_factor: null, anki_meta: null, learning_steps: 0, client_changed_at: changedAt };
}

async function seedLibrary(userId: string) {
    const ids = { deck: randomUUID(), noteType: randomUUID(), note: randomUUID(), card: randomUUID() };
    // Children listed before parents on purpose: FKs are deferred to commit.
    await push(userId, { upserts: {
        cards: [card(ids.card, ids.note)],
        notes: [note(ids.note, ids.deck, ids.noteType)],
        decks: [deck(ids.deck)],
        note_types: [noteType(ids.noteType)],
    } });
    return ids;
}

describe('schema', () => {
    it('matches the shared table spec column for column', async () => {
        for (const t of SYNC_TABLES) {
            const { rows } = await pg.query<{ column_name: string; data_type: string; is_nullable: string }>(
                `select column_name, data_type, is_nullable from information_schema.columns
                  where table_schema = 'public' and table_name = $1`, [t.name]);
            const live = new Map(rows.map((r) => [r.column_name, r]));
            const expected = [...t.columns, { name: 'user_id', type: 'uuid' as const, required: true }, ...SYNC_COLUMNS];
            expect([...live.keys()].sort(), t.name).toEqual(expected.map((c) => c.name).sort());
            for (const c of expected) {
                const col = live.get(c.name)!;
                expect(col.data_type, `${t.name}.${c.name}`).toBe(PG_TYPES[c.type]);
                expect(col.is_nullable === 'NO', `${t.name}.${c.name} not null`).toBe(!!c.required);
            }
        }
    });

    it('moved the pre-local-first tables to the legacy schema', async () => {
        const { rows } = await pg.query<{ table_name: string }>(
            `select table_name from information_schema.tables where table_schema = 'legacy' order by 1`);
        expect(rows.map((r) => r.table_name)).toEqual(
            ['card_classifications', 'card_drafts', 'cards', 'deck_sessions', 'decks', 'media', 'note_types', 'notes', 'reviews']);
    });

    it('keeps the legacy schema out of reach of client roles', async () => {
        const u = await newUser();
        await expect(asUser(pg, u, (tx) => tx.query('select count(*) from legacy.decks'))).rejects.toThrow(/permission denied/);
    });
});

describe('row-level security', () => {
    it("never shows one user another user's rows", async () => {
        const a = await newUser();
        const b = await newUser();
        await seedLibrary(a);
        const res = await pull(b);
        expect(res.changes).toEqual([]);
        const direct = await asUser(pg, b, (tx) => tx.query('select count(*)::int as n from public.decks'));
        expect((direct.rows[0] as { n: number }).n).toBe(0);
    });

    it('stamps rows with the caller, whatever user_id the payload claims', async () => {
        const a = await newUser();
        const b = await newUser();
        const id = randomUUID();
        await push(a, { upserts: { decks: [{ ...deck(id), user_id: b }] } });
        const { rows } = await pg.query<{ user_id: string }>('select user_id from public.decks where id = $1', [id]);
        expect(rows[0].user_id).toBe(a);
    });

    it("can't overwrite another user's row with the same id", async () => {
        const a = await newUser();
        const b = await newUser();
        const id = randomUUID();
        await push(a, { upserts: { decks: [deck(id)] } });
        await expect(push(b, { upserts: { decks: [deck(id, at(5), { name: 'Hijack' })] } })).rejects.toThrow();
        const { rows } = await pg.query<{ name: string }>('select name from public.decks where id = $1', [id]);
        expect(rows[0].name).toBe('Deck');
    });

    it('gives clients no DELETE: rows can only be tombstoned', async () => {
        const a = await newUser();
        const ids = await seedLibrary(a);
        await expect(asUser(pg, a, (tx) => tx.query('delete from public.decks where id = $1', [ids.deck]))).rejects.toThrow(/permission denied/);
    });

    it('refuses anonymous callers', async () => {
        await expect(rpc(pg, null, 'sync_hello_v1', [])).rejects.toThrow(/permission denied/);
        await expect(push(null as unknown as string, {})).rejects.toThrow();
    });
});

describe('push and pull', () => {
    it('applies a batch with children before parents and returns it in cursor order', async () => {
        const u = await newUser();
        const ids = await seedLibrary(u);
        const res = await pull(u);
        expect(new Set(res.changes.map((c) => c.t))).toEqual(new Set(['note_types', 'decks', 'notes', 'cards']));
        const seqs = res.changes.map((c) => c.seq);
        expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
        expect(res.next).toBe(seqs[seqs.length - 1]);
        expect(res.more).toBe(false);
        expect(res.changes.find((c) => c.t === 'cards')!.row).toMatchObject({ id: ids.card, user_id: u, state: 'new', deleted_at: null });
    });

    it('rolls back the whole batch when a parent is missing', async () => {
        const u = await newUser();
        const orphan = card(randomUUID(), randomUUID());
        await expect(push(u, { upserts: { decks: [deck()], cards: [orphan] } })).rejects.toThrow(/foreign key/);
        expect((await pull(u)).changes).toEqual([]);
    });

    it('pages with a cursor', async () => {
        const u = await newUser();
        await push(u, { upserts: { decks: Array.from({ length: 5 }, () => deck()) } });
        const p1 = await pull(u, 0, 2);
        expect(p1.changes).toHaveLength(2);
        expect(p1.more).toBe(true);
        const p2 = await pull(u, p1.next, 2);
        const p3 = await pull(u, p2.next, 2);
        expect(p3.more).toBe(false);
        expect([...p1.changes, ...p2.changes, ...p3.changes]).toHaveLength(5);
    });

    it("hides the data of a device's own writes but still advances its cursor", async () => {
        const u = await newUser();
        await push(u, { upserts: { decks: [deck()] } }, DEVICE_A);
        await push(u, { upserts: { decks: [deck()] } }, DEVICE_B);
        const res = await pull(u, 0, 500, DEVICE_A);
        expect(res.changes).toHaveLength(2);
        expect(res.changes[0].row).toBeNull();
        expect(res.changes[1].row).toMatchObject({ origin_device: DEVICE_B });
    });
});

describe('conflicts: last writer wins', () => {
    async function deckName(id: string) {
        const { rows } = await pg.query<{ name: string; deleted_at: string | null }>('select name, deleted_at from public.decks where id = $1', [id]);
        return rows[0];
    }

    it('ignores an older change and applies a newer one', async () => {
        const u = await newUser();
        const id = randomUUID();
        await push(u, { upserts: { decks: [deck(id, at(10), { name: 'v10' })] } });
        await push(u, { upserts: { decks: [deck(id, at(5), { name: 'v5' })] } }, DEVICE_B);
        expect((await deckName(id)).name).toBe('v10');
        await push(u, { upserts: { decks: [deck(id, at(20), { name: 'v20' })] } }, DEVICE_B);
        expect((await deckName(id)).name).toBe('v20');
    });

    it('caps a device clock that runs ahead at server time + 5 minutes', async () => {
        const u = await newUser();
        const id = randomUUID();
        const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
        await push(u, { upserts: { decks: [deck(id, future, { name: 'from the future' })] } });
        const { rows } = await pg.query<{ c: string }>('select client_changed_at as c from public.decks where id = $1', [id]);
        expect(Date.parse(rows[0].c)).toBeLessThan(Date.now() + 6 * 60_000);
    });

    it('tombstones a row, keeps it against older edits, and revives it on a newer one', async () => {
        const u = await newUser();
        const id = randomUUID();
        await push(u, { upserts: { decks: [deck(id, at(0))] } });
        await push(u, { deletes: { decks: [{ id, at: at(10) }] } });
        expect((await deckName(id)).deleted_at).not.toBeNull();
        await push(u, { upserts: { decks: [deck(id, at(5), { name: 'stale edit' })] } }, DEVICE_B);
        expect(await deckName(id)).toMatchObject({ name: 'Deck' });
        expect((await deckName(id)).deleted_at).not.toBeNull();
        await push(u, { upserts: { decks: [deck(id, at(20), { name: 'restored' })] } }, DEVICE_B);
        expect(await deckName(id)).toEqual({ name: 'restored', deleted_at: null });
    });

    it('force applies an older copy (restoring a backup)', async () => {
        const u = await newUser();
        const id = randomUUID();
        await push(u, { upserts: { decks: [deck(id, at(30), { name: 'newer' })] } });
        await push(u, { upserts: { decks: [deck(id, at(1), { name: 'from backup' })] } }, DEVICE_A, true);
        expect((await deckName(id)).name).toBe('from backup');
    });

    it('re-sends the winning copy to everyone when a change loses', async () => {
        const u = await newUser();
        const id = randomUUID();
        await push(u, { upserts: { decks: [deck(id, at(10), { name: 'winner' })] } }, DEVICE_B);
        const cursor = (await pull(u)).next;
        // Device A pushes an older edit: rejected, but the winner comes back
        // to A on its next pull even though A skips its own writes.
        await push(u, { upserts: { decks: [deck(id, at(5), { name: 'loser' })] } }, DEVICE_A);
        const res = await pull(u, cursor, 500, DEVICE_A);
        expect(res.changes).toHaveLength(1);
        expect(res.changes[0].row).toMatchObject({ id, name: 'winner', origin_device: null });
        // A stale delete is re-sent the same way.
        const c2 = res.next;
        await push(u, { deletes: { decks: [{ id, at: at(1) }] } }, DEVICE_A);
        const again = await pull(u, c2, 500, DEVICE_A);
        expect(again.changes[0].row).toMatchObject({ id, name: 'winner', deleted_at: null });
    });

    it('re-sends a classification set that lost', async () => {
        const u = await newUser();
        const ids = await seedLibrary(u);
        const set = (changedAt: string, systemKey: string) => ({ upserts: { card_classifications: [{
            card_id: ids.card, exam_key: 'usmle-step1', at: changedAt,
            rows: [{ system_key: systemKey, topic_key: null, confidence: 0.9, split_weight: 1, classified_at: changedAt, model_version: 'v2' }],
        }] } });
        await push(u, set(at(10), 'cardio'), DEVICE_B);
        const cursor = (await pull(u)).next;
        await push(u, set(at(5), 'renal'), DEVICE_A);
        const res = await pull(u, cursor, 500, DEVICE_A);
        expect(res.changes.map((c) => c.row?.system_key)).toEqual(['cardio']);
    });

    it('bumps server_seq on every write, so pulls see tombstones', async () => {
        const u = await newUser();
        const id = randomUUID();
        await push(u, { upserts: { decks: [deck(id)] } });
        const first = await pull(u);
        await push(u, { deletes: { decks: [{ id, at: at(1) }] } });
        const second = await pull(u, first.next);
        expect(second.changes).toHaveLength(1);
        expect(second.changes[0].row).toMatchObject({ id });
        expect(second.changes[0].row!.deleted_at).not.toBeNull();
    });
});

describe('natural-key tables', () => {
    const profile = (examKey: string, changedAt: string, extra: Record<string, unknown> = {}) => ({
        exam_key: examKey, exam_date: '2027-06-01', is_primary: true, session_mode: 'auto',
        created_at: T0, updated_at: changedAt, last_notified_threshold: null, client_changed_at: changedAt, ...extra,
    });

    it('user_exam_profiles are keyed by exam_key, deleted and re-added', async () => {
        const u = await newUser();
        await push(u, { upserts: { user_exam_profiles: [profile('usmle-step1', at(0))] } });
        await push(u, { upserts: { user_exam_profiles: [profile('usmle-step1', at(5), { exam_date: '2027-07-01' })] } });
        await push(u, { deletes: { user_exam_profiles: [{ exam_key: 'usmle-step1', at: at(10) }] } });
        let rows = (await pg.query<{ exam_date: string; deleted_at: string | null }>(
            'select exam_date, deleted_at from public.user_exam_profiles where user_id = $1', [u])).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0].exam_date).toBe('2027-07-01');
        expect(rows[0].deleted_at).not.toBeNull();
        await push(u, { upserts: { user_exam_profiles: [profile('usmle-step1', at(15))] } });
        rows = (await pg.query<{ exam_date: string; deleted_at: string | null }>(
            'select exam_date, deleted_at from public.user_exam_profiles where user_id = $1', [u])).rows;
        expect(rows[0].deleted_at).toBeNull();
    });

    it('card classifications replace their (card, exam) set', async () => {
        const u = await newUser();
        const ids = await seedLibrary(u);
        const row = (systemKey: string | null, topicKey: string | null = null) => ({
            system_key: systemKey, topic_key: topicKey, confidence: systemKey ? 0.9 : 0, split_weight: 1, classified_at: at(1), model_version: 'gpt-4.1-mini#v2',
        });
        const set = (changedAt: string, rows: unknown[]) => ({ upserts: { card_classifications: [{ card_id: ids.card, exam_key: 'usmle-step1', at: changedAt, rows }] } });
        const live = async () => (await pg.query<{ system_key: string | null }>(
            `select system_key from public.card_classifications where card_id = $1 and deleted_at is null order by system_key nulls first`, [ids.card])).rows.map((r) => r.system_key);

        await push(u, set(at(1), [row('cardio', 'heart-failure'), row('renal')]));
        expect(await live()).toEqual(['cardio', 'renal']);

        // Re-classified as off-exam: the old rows are tombstoned.
        await push(u, set(at(2), [row(null)]));
        expect(await live()).toEqual([null]);

        // An older set from another device loses.
        await push(u, set(at(1.5), [row('neuro')]), DEVICE_B);
        expect(await live()).toEqual([null]);

        // The off-exam row (system_key NULL) is one row, not a new one each time.
        await push(u, set(at(3), [row(null)]));
        const all = await pg.query<{ n: number }>('select count(*)::int as n from public.card_classifications where card_id = $1 and system_key is null', [ids.card]);
        expect(all.rows[0].n).toBe(1);

        // An empty set clears the card for that exam.
        await push(u, set(at(4), []));
        expect(await live()).toEqual([]);
    });
});

describe('prune (after restoring a backup)', () => {
    it("tombstones every row that wasn't re-pushed since the cursor", async () => {
        const u = await newUser();
        const keep = randomUUID();
        const drop = randomUUID();
        await push(u, { upserts: { decks: [deck(keep), deck(drop)] } });
        const hello = await rpc<{ max_seq: number }>(pg, u, 'sync_hello_v1', []);
        await push(u, { upserts: { decks: [deck(keep, at(1))] } }, DEVICE_A, true);
        const res = await rpc<{ pruned: number }>(pg, u, 'sync_prune_v1', [hello.max_seq]);
        expect(res.pruned).toBe(1);
        const { rows } = await pg.query<{ id: string; deleted_at: string | null }>(
            'select id, deleted_at from public.decks where user_id = $1 order by id', [u]);
        expect(rows.find((r) => r.id === keep)!.deleted_at).toBeNull();
        expect(rows.find((r) => r.id === drop)!.deleted_at).not.toBeNull();
    });
});

describe('hello and the remote switch', () => {
    it('is off by default, on for allow-listed users, then on for everyone', async () => {
        const a = await newUser();
        const b = await newUser();
        expect(await rpc<{ enabled: boolean }>(pg, a, 'sync_hello_v1', [])).toMatchObject({ enabled: false, version: 1 });
        await pg.query(`update public.app_config set value = jsonb_set(value, '{allow_users}', $1::jsonb) where key = 'sync'`, [JSON.stringify([a])]);
        expect((await rpc<{ enabled: boolean }>(pg, a, 'sync_hello_v1', [])).enabled).toBe(true);
        expect((await rpc<{ enabled: boolean }>(pg, b, 'sync_hello_v1', [])).enabled).toBe(false);
        await pg.query(`update public.app_config set value = jsonb_set(value, '{enabled}', 'true') where key = 'sync'`);
        expect((await rpc<{ enabled: boolean }>(pg, b, 'sync_hello_v1', [])).enabled).toBe(true);
        await pg.query(`update public.app_config set value = '{"enabled": false, "allow_users": []}' where key = 'sync'`);
    });

    it("reports the caller's cursor", async () => {
        const u = await newUser();
        expect((await rpc<{ max_seq: number }>(pg, u, 'sync_hello_v1', [])).max_seq).toBe(0);
        const res = await push(u, { upserts: { decks: [deck()] } });
        expect((await rpc<{ max_seq: number }>(pg, u, 'sync_hello_v1', [])).max_seq).toBe(res.max_seq);
    });
});

describe('account deletion', () => {
    it('removes every synced row with the auth user', async () => {
        const u = await newUser();
        await seedLibrary(u);
        await pg.query('delete from auth.users where id = $1', [u]);
        for (const t of SYNC_TABLES) {
            const { rows } = await pg.query<{ n: number }>(`select count(*)::int as n from public.${t.name} where user_id = $1`, [u]);
            expect(rows[0].n, t.name).toBe(0);
        }
    });
});

describe('media bucket', () => {
    it('lets a user upload and read only in their own folder', async () => {
        const a = await newUser();
        const b = await newUser();
        await asUser(pg, a, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('sekel-media', $1, $2)`, [`${a}/abc.png`, a]));
        await expect(asUser(pg, a, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('sekel-media', $1, $2)`, [`${b}/abc.png`, a])))
            .rejects.toThrow(/row-level security/);
        const seenByB = await asUser(pg, b, (tx) => tx.query(`select name from storage.objects where bucket_id = 'sekel-media'`));
        expect(seenByB.rows).toEqual([]);
    });

    it('requires media rows to point inside the owner folder', async () => {
        const u = await newUser();
        const media = (storagePath: string) => ({ upserts: { media: [{
            id: randomUUID(), filename: 'a.png', file_hash: 'abc', file_size: 3, mime_type: 'image/png', created_at: T0,
            storage_path: storagePath, client_changed_at: T0,
        }] } });
        await expect(push(u, media(`${u}/abc.png`))).resolves.toBeTruthy();
        await expect(push(u, media(`someone-else/abc.png`))).rejects.toThrow(/storage_path_owner_check/);
        await expect(push(u, media(`${u}/../x.png`))).rejects.toThrow(/storage_path_owner_check/);
    });
});
