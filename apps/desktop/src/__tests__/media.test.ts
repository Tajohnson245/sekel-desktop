import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));

vi.mock('../main/db/syncPush', () => ({
    pushRecord: vi.fn(),
    deleteRecord: vi.fn(),
}));

import { createMedia, fetchMediaByFilename } from '../main/db/service';

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

const USER_A = 'user-a';
const USER_B = 'user-b';

beforeEach(() => { testDb = setupDb(); });
afterEach(() => { testDb.close(); });

describe('createMedia', () => {
    it('creates a media record with all required fields', () => {
        const m = createMedia({
            user_id: USER_A,
            filename: 'image.jpg',
            file_path: '/imports/user-a/image.jpg',
            file_hash: 'abc123',
            file_size: null,
            mime_type: null,
        });
        expect(m.id).toBeTruthy();
        expect(m.user_id).toBe(USER_A);
        expect(m.filename).toBe('image.jpg');
        expect(m.file_path).toBe('/imports/user-a/image.jpg');
        expect(m.file_hash).toBe('abc123');
        expect(m.file_size).toBeNull();
        expect(m.mime_type).toBeNull();
        expect(m.created_at).toBeTruthy();
    });

    it('creates a media record with optional fields populated', () => {
        const m = createMedia({
            user_id: USER_A,
            filename: 'audio.mp3',
            file_path: '/imports/user-a/audio.mp3',
            file_hash: 'def456',
            file_size: 204800,
            mime_type: 'audio/mpeg',
        });
        expect(m.file_size).toBe(204800);
        expect(m.mime_type).toBe('audio/mpeg');
    });

    it('rejects two records with the same user_id and file_hash', () => {
        createMedia({ user_id: USER_A, filename: 'a.jpg', file_path: '/a.jpg', file_hash: 'samehash', file_size: null, mime_type: null });
        expect(() => createMedia({ user_id: USER_A, filename: 'b.jpg', file_path: '/b.jpg', file_hash: 'samehash', file_size: null, mime_type: null })).toThrow();
    });

    it('allows two records with the same user_id but different file_hash', () => {
        createMedia({ user_id: USER_A, filename: 'a.jpg', file_path: '/a.jpg', file_hash: 'hash1', file_size: null, mime_type: null });
        expect(() => createMedia({ user_id: USER_A, filename: 'b.jpg', file_path: '/b.jpg', file_hash: 'hash2', file_size: null, mime_type: null })).not.toThrow();
    });

    it('allows two different users to have media with the same file_hash', () => {
        createMedia({ user_id: USER_A, filename: 'img.jpg', file_path: '/a/img.jpg', file_hash: 'sharedhash', file_size: null, mime_type: null });
        expect(() => createMedia({ user_id: USER_B, filename: 'img.jpg', file_path: '/b/img.jpg', file_hash: 'sharedhash', file_size: null, mime_type: null })).not.toThrow();
    });
});

describe('fetchMediaByFilename', () => {
    it('returns the media record for a matching user and filename', () => {
        createMedia({ user_id: USER_A, filename: 'card.png', file_path: '/card.png', file_hash: 'h1', file_size: null, mime_type: null });
        const m = fetchMediaByFilename(USER_A, 'card.png');
        expect(m).not.toBeNull();
        expect(m!.filename).toBe('card.png');
    });

    it('returns null when no match exists', () => {
        expect(fetchMediaByFilename(USER_A, 'missing.png')).toBeNull();
    });

    it('does not return another user\'s media with the same filename', () => {
        createMedia({ user_id: USER_B, filename: 'shared.png', file_path: '/shared.png', file_hash: 'h2', file_size: null, mime_type: null });
        expect(fetchMediaByFilename(USER_A, 'shared.png')).toBeNull();
    });
});
