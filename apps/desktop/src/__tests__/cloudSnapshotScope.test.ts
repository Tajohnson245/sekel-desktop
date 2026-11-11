import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';
import { scopeSnapshotToUser } from '../main/backup/snapshotScope';
import { isSessionUsable } from '../main/backup/cloudClient';

const ME = 'user-me';
const OTHER = 'user-other';
const tmpFiles: string[] = [];

/** A file-backed, fully migrated DB in WAL mode (like the live sekel.db). */
function makeDb(): { db: Database.Database; file: string } {
    const file = path.join(os.tmpdir(), `sekel-scope-test-${randomUUID()}.db`);
    tmpFiles.push(file);
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (const m of MIGRATIONS) db.exec(m);
    return { db, file };
}

function seedUser(db: Database.Database, userId: string, label: string) {
    const now = new Date().toISOString();
    const id = (s: string) => `${userId}-${s}`;
    db.prepare(`INSERT INTO user_profiles (id, first_name, medical_school, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(userId, `${label}-first`, `${label}-school`, now, now);
    db.prepare(`INSERT INTO decks (id, user_id, name, algorithm, created_at, updated_at) VALUES (?, ?, ?, 'fsrs', ?, ?)`).run(id('deck'), userId, `${label} deck`, now, now);
    db.prepare(`INSERT INTO note_types (id, user_id, name, fields, card_templates, created_at, updated_at) VALUES (?, ?, 'Basic', '[]', '[]', ?, ?)`).run(id('nt'), userId, now, now);
    db.prepare(`INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`)
        .run(id('note'), userId, id('deck'), id('nt'), JSON.stringify({ Front: `${label} secret question` }), now, now);
    db.prepare(`INSERT INTO cards (id, user_id, note_id, template_index, state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, created_at, updated_at)
                VALUES (?, ?, ?, 0, 'review', ?, 1, 5, 0, 1, 1, 0, ?, ?)`).run(id('card'), userId, id('note'), now, now, now);
    db.prepare(`INSERT INTO deck_sessions (id, user_id, deck_id, status, started_at, created_at) VALUES (?, ?, ?, 'completed', ?, ?)`).run(id('sess'), userId, id('deck'), now, now);
    db.prepare(`INSERT INTO reviews (id, user_id, card_id, rating, review_time, state_before, stability_before, difficulty_before, state_after, stability_after, difficulty_after, scheduled_days, session_id, deck_id, review_index, created_at)
                VALUES (?, ?, ?, 'good', ?, 'review', 1, 5, 'review', 2, 5, 2, ?, ?, 0, ?)`).run(id('rev'), userId, id('card'), now, id('sess'), id('deck'), now);
    db.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, classified_at) VALUES (?, 1, 10, ?)`).run(id('card'), now);
}

function seedBlueprint(db: Database.Database) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, 'step1', 'USMLE Step 1', ?)`).run(now);
    db.prepare(`INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (10, 1, 'cardio', 'Cardio', 5, 10)`).run();
}

afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
            try { fs.unlinkSync(f + suffix); } catch { /* absent */ }
        }
    }
});

describe('scopeSnapshotToUser', () => {
    it('keeps only the signed-in user\'s rows (and shared reference data) in the snapshot copy', async () => {
        const { db } = makeDb();
        seedBlueprint(db);
        seedUser(db, ME, 'mine');
        seedUser(db, OTHER, 'theirs');

        const copy = path.join(os.tmpdir(), `sekel-scope-copy-${randomUUID()}.sqlite`);
        tmpFiles.push(copy);
        await db.backup(copy);
        db.close();

        const { removed } = scopeSnapshotToUser(copy, ME);
        expect(removed.decks).toBe(1);
        expect(removed.user_profiles).toBe(1);

        const snap = new Database(copy, { readonly: true });
        try {
            for (const table of ['decks', 'note_types', 'notes', 'cards', 'deck_sessions', 'reviews']) {
                const owners = snap.prepare(`SELECT DISTINCT user_id FROM ${table}`).all() as { user_id: string }[];
                expect(owners.map(o => o.user_id), table).toEqual([ME]);
            }
            expect(snap.prepare('SELECT id FROM user_profiles').all()).toEqual([{ id: ME }]);
            // Classification rows for the other user's card went with the card (FK cascade).
            expect(snap.prepare('SELECT card_id FROM card_classifications').all()).toEqual([{ card_id: `${ME}-card` }]);
            // Shared blueprint data is untouched.
            expect(snap.prepare('SELECT COUNT(*) AS n FROM blueprint_systems').get()).toEqual({ n: 1 });
            expect(snap.pragma('foreign_key_check')).toEqual([]);
            expect(snap.pragma('journal_mode', { simple: true })).toBe('delete');
        } finally {
            snap.close();
        }

        // VACUUM: the other user's content must not survive in free pages.
        const raw = fs.readFileSync(copy).toString('latin1');
        expect(raw).not.toContain('theirs secret question');
        expect(raw).not.toContain('theirs-school');
        expect(raw).toContain('mine secret question');
        expect(fs.existsSync(`${copy}-wal`)).toBe(false);
    });

    it('is a no-op for a single-user database', async () => {
        const { db } = makeDb();
        seedBlueprint(db);
        seedUser(db, ME, 'mine');
        const copy = path.join(os.tmpdir(), `sekel-scope-copy-${randomUUID()}.sqlite`);
        tmpFiles.push(copy);
        await db.backup(copy);
        db.close();

        expect(scopeSnapshotToUser(copy, ME).removed).toEqual({});
        const snap = new Database(copy, { readonly: true });
        expect(snap.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 1 });
        snap.close();
    });

    it('refuses an empty user id rather than wiping the copy', () => {
        expect(() => scopeSnapshotToUser('unused.sqlite', '')).toThrow();
    });
});

describe('isSessionUsable', () => {
    const base = { userId: ME, accessToken: 'tok', refreshToken: 'ref' };
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);

    it('accepts a token with time left and an unknown expiry', () => {
        expect(isSessionUsable({ ...base, expiresAt: now / 1000 + 3600 }, now)).toBe(true);
        expect(isSessionUsable(base, now)).toBe(true);
    });

    it('rejects expired or nearly-expired tokens (main never refreshes them itself)', () => {
        expect(isSessionUsable({ ...base, expiresAt: now / 1000 - 1 }, now)).toBe(false);
        expect(isSessionUsable({ ...base, expiresAt: now / 1000 + 30 }, now)).toBe(false);
        expect(isSessionUsable({ ...base, accessToken: '' }, now)).toBe(false);
    });
});
