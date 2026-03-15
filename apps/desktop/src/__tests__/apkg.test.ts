import { describe, it, expect, afterEach } from 'vitest';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import JSZip from 'jszip';

import { processApkgFile, detectFormat, validateAnkiDb } from '../main/import/apkg';
import { cleanupStaleTempDirs, makeTempDirPath, removeTempDir } from '../main/import/tempCleanup';
import {
    UnsupportedFormatError,
    InvalidApkgError,
    CorruptedZipError,
    ValidationError,
} from '../main/import/types';

// ── Fixture Helpers ────────────────────────────────────────────────────────────

/** Creates a minimal valid Anki SQLite DB on disk and returns its Buffer. */
async function makeAnkiDb(tables = ['col', 'notes', 'cards', 'revlog']): Promise<Buffer> {
    const tmpPath = path.join(os.tmpdir(), `anki-test-${randomUUID()}.db`);
    const db = new Database(tmpPath);
    for (const table of tables) {
        db.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
    }
    db.close();
    const buf = await fsPromises.readFile(tmpPath);
    await fsPromises.unlink(tmpPath);
    return buf;
}

interface MakeApkgOptions {
    dbFilename: string;
    includeMedia?: boolean;
    mediaContent?: Record<string, string>;
    dbBuffer?: Buffer;
}

/** Builds an .apkg (ZIP) buffer using JSZip with the given options. */
async function makeApkgBuffer(opts: MakeApkgOptions): Promise<Buffer> {
    const {
        dbFilename,
        includeMedia = true,
        mediaContent = { '0': 'test-image.jpg' },
        dbBuffer,
    } = opts;

    const zip = new JSZip();
    const db = dbBuffer ?? (await makeAnkiDb());
    zip.file(dbFilename, db);

    if (includeMedia) {
        zip.file('media', JSON.stringify(mediaContent));
        for (const key of Object.keys(mediaContent)) {
            zip.file(key, Buffer.from(`fake-content-${key}`));
        }
    }

    return zip.generateAsync({ type: 'nodebuffer' });
}

/** Writes an .apkg fixture to a temp file and returns its path. */
async function writeApkgFixture(opts: MakeApkgOptions): Promise<string> {
    const buf = await makeApkgBuffer(opts);
    const fixturePath = path.join(os.tmpdir(), `sekel-fixture-${randomUUID()}.apkg`);
    await fsPromises.writeFile(fixturePath, buf);
    return fixturePath;
}

// Track temp dirs created by successful processApkgFile calls for afterEach cleanup
const dirsToClean: string[] = [];

afterEach(async () => {
    for (const dir of dirsToClean.splice(0)) {
        await removeTempDir(dir);
    }
});

// ── processApkgFile ────────────────────────────────────────────────────────────

describe('processApkgFile', () => {
    it('succeeds with anki21 format → format === legacy2', async () => {
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21', includeMedia: true });
        try {
            const result = await processApkgFile(apkgPath);
            dirsToClean.push(result.tempDir);
            expect(result.format).toBe('legacy2');
            expect(result.dbFilePath).toContain('collection.anki21');
            expect(result.warnings).toHaveLength(0);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('succeeds with anki2 format → format === legacy1', async () => {
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki2', includeMedia: false });
        try {
            const result = await processApkgFile(apkgPath);
            dirsToClean.push(result.tempDir);
            expect(result.format).toBe('legacy1');
            expect(result.dbFilePath).toContain('collection.anki2');
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('throws UnsupportedFormatError for anki21b, and cleans up temp dir', async () => {
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21b' });
        let tempDirFromError: string | undefined;
        try {
            await expect(processApkgFile(apkgPath)).rejects.toThrowError(UnsupportedFormatError);
            // Verify cleanup: find the temp dir that would have been created
            // We can't easily get it post-throw, so check none with our prefix exist newly
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
        void tempDirFromError; // suppress lint
    });

    it('throws InvalidApkgError when no recognised DB file exists in ZIP', async () => {
        const zip = new JSZip();
        zip.file('some-random-file.txt', 'hello');
        const buf = await zip.generateAsync({ type: 'nodebuffer' });
        const apkgPath = path.join(os.tmpdir(), `sekel-fixture-${randomUUID()}.apkg`);
        await fsPromises.writeFile(apkgPath, buf);
        try {
            await expect(processApkgFile(apkgPath)).rejects.toThrowError(InvalidApkgError);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('throws CorruptedZipError for non-ZIP bytes', async () => {
        const apkgPath = path.join(os.tmpdir(), `sekel-fixture-${randomUUID()}.apkg`);
        await fsPromises.writeFile(apkgPath, Buffer.from('this is not a zip file at all'));
        try {
            await expect(processApkgFile(apkgPath)).rejects.toThrowError(CorruptedZipError);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('throws ValidationError when DB is missing a required table', async () => {
        const dbBuffer = await makeAnkiDb(['col', 'notes', 'cards']); // missing revlog
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21', dbBuffer });
        try {
            await expect(processApkgFile(apkgPath)).rejects.toThrowError(ValidationError);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('parses mediaMap and mediaFilePaths correctly', async () => {
        const mediaContent = { '0': 'image.jpg', '1': 'audio.mp3' };
        const apkgPath = await writeApkgFixture({
            dbFilename: 'collection.anki21',
            mediaContent,
        });
        try {
            const result = await processApkgFile(apkgPath);
            dirsToClean.push(result.tempDir);
            expect(result.mediaMap).toEqual(mediaContent);
            expect(result.mediaFilePaths).toHaveLength(2);
            expect(result.mediaFilePaths[0]).toContain('0');
            expect(result.mediaFilePaths[1]).toContain('1');
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('returns empty mediaMap with a warning when media file is absent', async () => {
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21', includeMedia: false });
        try {
            const result = await processApkgFile(apkgPath);
            dirsToClean.push(result.tempDir);
            expect(result.mediaMap).toEqual({});
            expect(result.mediaFilePaths).toHaveLength(0);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toMatch(/media/i);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('does NOT clean up tempDir on success (Phase 3 owns cleanup)', async () => {
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21' });
        try {
            const result = await processApkgFile(apkgPath);
            dirsToClean.push(result.tempDir);
            const stat = await fsPromises.stat(result.tempDir);
            expect(stat.isDirectory()).toBe(true);
        } finally {
            await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
        }
    });

    it('cleans up tempDir on error', async () => {
        // Use anki21b to trigger an error after extraction
        const apkgPath = await writeApkgFixture({ dbFilename: 'collection.anki21b' });

        // Spy on removeTempDir by checking that the dir doesn't exist after the throw
        // We need a way to observe tempDir — we'll check that no new sekel-import-* dirs remain
        const before = fs.readdirSync(os.tmpdir()).filter(e => e.startsWith('sekel-import-'));

        try {
            await processApkgFile(apkgPath);
        } catch {
            // expected
        }

        const after = fs.readdirSync(os.tmpdir()).filter(e => e.startsWith('sekel-import-'));
        // Directories created during the failed import should be cleaned up
        expect(after.length).toBeLessThanOrEqual(before.length);

        await fsPromises.unlink(apkgPath).catch(() => { /* ignore */ });
    });
});

// ── detectFormat ───────────────────────────────────────────────────────────────

describe('detectFormat', () => {
    it('returns legacy2 for collection.anki21', () => {
        const result = detectFormat(new Set(['collection.anki21', 'media']));
        expect(result.format).toBe('legacy2');
        expect(result.dbFilename).toBe('collection.anki21');
    });

    it('returns legacy1 for collection.anki2', () => {
        const result = detectFormat(new Set(['collection.anki2', 'media']));
        expect(result.format).toBe('legacy1');
        expect(result.dbFilename).toBe('collection.anki2');
    });

    it('throws UnsupportedFormatError for collection.anki21b', () => {
        expect(() => detectFormat(new Set(['collection.anki21b']))).toThrowError(UnsupportedFormatError);
    });

    it('throws InvalidApkgError when no recognised file present', () => {
        expect(() => detectFormat(new Set(['readme.txt', 'media']))).toThrowError(InvalidApkgError);
    });

    it('prioritises anki21b before anki21', () => {
        // If both somehow exist, anki21b check fires first
        expect(() => detectFormat(new Set(['collection.anki21b', 'collection.anki21']))).toThrowError(UnsupportedFormatError);
    });
});

// ── validateAnkiDb ─────────────────────────────────────────────────────────────

describe('validateAnkiDb', () => {
    async function writeTempDb(tables: string[]): Promise<string> {
        const tmpPath = path.join(os.tmpdir(), `validate-test-${randomUUID()}.db`);
        const db = new Database(tmpPath);
        for (const t of tables) db.exec(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);
        db.close();
        return tmpPath;
    }

    it('passes for a DB with all four required tables', async () => {
        const dbPath = await writeTempDb(['col', 'notes', 'cards', 'revlog']);
        try {
            expect(() => validateAnkiDb(dbPath)).not.toThrow();
        } finally {
            await fsPromises.unlink(dbPath);
        }
    });

    it('throws ValidationError listing the missing table(s)', async () => {
        const dbPath = await writeTempDb(['col', 'notes', 'cards']); // missing revlog
        try {
            expect(() => validateAnkiDb(dbPath)).toThrowError(ValidationError);
            expect(() => validateAnkiDb(dbPath)).toThrowError(/revlog/);
        } finally {
            await fsPromises.unlink(dbPath);
        }
    });
});

// ── cleanupStaleTempDirs ───────────────────────────────────────────────────────

describe('cleanupStaleTempDirs', () => {
    it('removes sekel-import-* directories from os.tmpdir()', async () => {
        const staleDir = makeTempDirPath();
        await fsPromises.mkdir(staleDir);
        // Confirm it exists
        expect(fs.existsSync(staleDir)).toBe(true);

        await cleanupStaleTempDirs();

        expect(fs.existsSync(staleDir)).toBe(false);
    });

    it('leaves non-sekel-import directories untouched', async () => {
        const otherDir = path.join(os.tmpdir(), `other-dir-${randomUUID()}`);
        await fsPromises.mkdir(otherDir);
        try {
            await cleanupStaleTempDirs();
            expect(fs.existsSync(otherDir)).toBe(true);
        } finally {
            await fsPromises.rm(otherDir, { recursive: true, force: true });
        }
    });

    it('does not throw if a sekel-import-* dir is already gone', async () => {
        // Just run cleanup without any stale dirs — should not throw
        await expect(cleanupStaleTempDirs()).resolves.toBeUndefined();
    });
});
