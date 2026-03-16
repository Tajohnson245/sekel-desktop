import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { MIGRATIONS } from '../main/db/migrations';

// ── In-memory test database ────────────────────────────────────────────────────

let testDb: Database.Database;

vi.mock('../main/db/index', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
}));

vi.mock('../main/db/syncPush', () => ({
    pushRecord: vi.fn(),
    deleteRecord: vi.fn(),
}));

// ── Electron mock ──────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn().mockReturnValue('/test/userData'),
    },
}));

// ── fs/promises mock ───────────────────────────────────────────────────────────

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();
const mockCopyFile = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    copyFile: (...args: unknown[]) => mockCopyFile(...args),
}));

// ── node:fs mock ───────────────────────────────────────────────────────────────

const mockExistsSync = vi.fn().mockReturnValue(true);

vi.mock('node:fs', () => ({
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

// ── Subject under test (imported after mocks are set up) ──────────────────────

import { extractMedia } from '../main/import/media';
import path from 'node:path';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
const IMPORT_ID = 'import-uuid-123';
const TEMP_DIR = '/tmp/sekel-import-test';

beforeEach(() => {
    testDb = setupDb();
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
});

afterEach(() => {
    testDb.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractMedia', () => {
    it('returns zero counts for empty mediaMap without touching the filesystem', async () => {
        const result = await extractMedia(TEMP_DIR, {}, USER_A, IMPORT_ID);

        expect(result).toEqual({ extracted: 0, skipped: 0, warnings: [], mediaRecords: [] });
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('reads numbered file using the numeric key and stores it with SHA1 + original extension', async () => {
        const content = Buffer.from('fake image data');
        mockReadFile.mockResolvedValue(content);
        const sha1 = createHash('sha1').update(content).digest('hex');

        const result = await extractMedia(
            TEMP_DIR,
            { '0': 'amino_acid.jpg' },
            USER_A,
            IMPORT_ID,
        );

        expect(result.extracted).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.mediaRecords[0].filename).toBe('amino_acid.jpg');
        expect(result.mediaRecords[0].file_hash).toBe(sha1);
        expect(result.mediaRecords[0].file_path).toContain(`${sha1}.jpg`);
        expect(mockReadFile).toHaveBeenCalledWith(path.join(TEMP_DIR, '0'));
        expect(mockCopyFile).toHaveBeenCalledWith(
            path.join(TEMP_DIR, '0'),
            expect.stringContaining(`${sha1}.jpg`),
        );
    });

    it('computes SHA1 correctly from file contents', async () => {
        const content = Buffer.from('hello world');
        const expectedSha1 = createHash('sha1').update(content).digest('hex');
        mockReadFile.mockResolvedValue(content);

        const result = await extractMedia(TEMP_DIR, { '0': 'test.png' }, USER_A, IMPORT_ID);

        expect(result.mediaRecords[0].file_hash).toBe(expectedSha1);
        expect(result.mediaRecords[0].file_path).toContain(expectedSha1);
    });

    it('skips a file that already exists for this user (same hash) and reuses the existing record', async () => {
        const content = Buffer.from('duplicate content');
        mockReadFile.mockResolvedValue(content);

        // First import
        await extractMedia(TEMP_DIR, { '0': 'image.jpg' }, USER_A, IMPORT_ID);
        mockCopyFile.mockClear();

        // Second import with same content
        const result = await extractMedia(TEMP_DIR, { '0': 'image.jpg' }, USER_A, 'import-uuid-456');

        expect(result.extracted).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.mediaRecords).toHaveLength(1);
        expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it.each([
        ['.jpg', 'image/jpeg'],
        ['.jpeg', 'image/jpeg'],
        ['.png', 'image/png'],
        ['.gif', 'image/gif'],
        ['.svg', 'image/svg+xml'],
        ['.mp3', 'audio/mpeg'],
        ['.wav', 'audio/wav'],
        ['.ogg', 'audio/ogg'],
        ['.xyz', 'application/octet-stream'],
    ])('derives MIME type "%s" → "%s" from file extension', async (ext, expectedMime) => {
        // Fresh DB for each iteration to avoid unique constraint violations
        testDb.close();
        testDb = setupDb();

        const content = Buffer.from(`content for ${ext}`);
        mockReadFile.mockResolvedValue(content);

        const result = await extractMedia(TEMP_DIR, { '0': `file${ext}` }, USER_A, IMPORT_ID);

        expect(result.mediaRecords[0].mime_type).toBe(expectedMime);
    });

    it('captures file size in bytes', async () => {
        const content = Buffer.from('exact size content here');
        mockReadFile.mockResolvedValue(content);

        const result = await extractMedia(TEMP_DIR, { '0': 'file.png' }, USER_A, IMPORT_ID);

        expect(result.mediaRecords[0].file_size).toBe(content.length);
    });

    it('inserts record with correct user_id, filename, file_hash, and import_id', async () => {
        const content = Buffer.from('some content');
        mockReadFile.mockResolvedValue(content);

        const result = await extractMedia(TEMP_DIR, { '0': 'card.jpg' }, USER_A, IMPORT_ID);
        const record = result.mediaRecords[0];

        expect(record.user_id).toBe(USER_A);
        expect(record.filename).toBe('card.jpg');
        expect(record.file_hash).toBeTruthy();
        expect(record.import_id).toBe(IMPORT_ID);
    });

    it('produces a warning for a missing numbered file and continues processing remaining files', async () => {
        // Key "0" is missing; key "1" exists
        mockExistsSync.mockImplementation((p: string) =>
            !p.endsWith(path.sep + '0') && !p.endsWith('/0'),
        );
        const content = Buffer.from('second file content');
        mockReadFile.mockResolvedValue(content);

        const result = await extractMedia(
            TEMP_DIR,
            { '0': 'missing.jpg', '1': 'present.png' },
            USER_A,
            IMPORT_ID,
        );

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('missing.jpg');
        expect(result.extracted).toBe(1);
        expect(result.mediaRecords[0].filename).toBe('present.png');
    });

    it('stores two files with the same original filename but different content as separate records', async () => {
        const content1 = Buffer.from('version one of diagram');
        const content2 = Buffer.from('version two of diagram');
        mockReadFile
            .mockResolvedValueOnce(content1)
            .mockResolvedValueOnce(content2);

        const result = await extractMedia(
            TEMP_DIR,
            { '0': 'diagram.png', '1': 'diagram.png' },
            USER_A,
            IMPORT_ID,
        );

        expect(result.extracted).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.mediaRecords[0].file_hash).not.toBe(result.mediaRecords[1].file_hash);
        expect(result.mediaRecords[0].filename).toBe('diagram.png');
        expect(result.mediaRecords[1].filename).toBe('diagram.png');
    });

    it('creates the media directory with { recursive: true } before copying files', async () => {
        const content = Buffer.from('data');
        mockReadFile.mockResolvedValue(content);

        await extractMedia(TEMP_DIR, { '0': 'file.png' }, USER_A, IMPORT_ID);

        expect(mockMkdir).toHaveBeenCalledWith(
            expect.stringContaining('media'),
            { recursive: true },
        );
    });

    it('does not copy or insert when all files in the batch are duplicates', async () => {
        const content = Buffer.from('shared content');
        mockReadFile.mockResolvedValue(content);

        // Seed the DB with the existing record
        await extractMedia(TEMP_DIR, { '0': 'shared.png' }, USER_A, 'first-import');
        const firstCopyCount = mockCopyFile.mock.calls.length;

        // Second import — same file
        const result = await extractMedia(
            TEMP_DIR,
            { '0': 'shared.png' },
            USER_A,
            'second-import',
        );

        expect(result.extracted).toBe(0);
        expect(result.skipped).toBe(1);
        expect(mockCopyFile.mock.calls.length).toBe(firstCopyCount); // no new copies
    });
});
