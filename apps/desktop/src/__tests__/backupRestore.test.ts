import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// ── Environment: a throwaway userData dir with a real on-disk sekel.db ────────

let userDataDir = '';
let liveDb: Database.Database;
/** When set, getDb() returns this instead of the live DB (to simulate failures). */
let dbOverride: unknown = null;

const dbPath = () => path.join(userDataDir, 'sekel.db');

function openLive(): Database.Database {
    liveDb = new Database(dbPath());
    liveDb.pragma('journal_mode = WAL');
    return liveDb;
}

const mockInitDatabase = vi.fn(() => openLive());

vi.mock('electron', () => ({
    app: { getPath: () => userDataDir },
}));

vi.mock('@sekel/observability', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    return {
        createLogger: () => logger,
        consoleTransport: {},
        metrics: { increment: vi.fn() },
    };
});

vi.mock('../main/db/index', () => ({
    getDb: () => dbOverride ?? liveDb,
    getDbPath: () => dbPath(),
    initDatabase: () => mockInitDatabase(),
}));

import {
    AUTO_BACKUP_RETENTION,
    createBackup,
    deleteBackup,
    getBackupDir,
    listBackups,
    pruneAutoBackups,
    resolveBackupFile,
} from '../main/backup/service';
import {
    restoreBackupByFilename,
    restoreFromTrustedPath,
    validateBackupFile,
} from '../main/backup/restore';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal Sekel-shaped DB file (schema_version + marker table). */
function makeSekelDb(filePath: string, marker: string, version = MIGRATIONS.length): void {
    const db = new Database(filePath);
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
    db.exec('CREATE TABLE marker (v TEXT)');
    db.prepare('INSERT INTO marker (v) VALUES (?)').run(marker);
    db.close();
}

function setMarker(v: string): void {
    liveDb.prepare('UPDATE marker SET v = ?').run(v);
}

function readMarker(): string {
    return (liveDb.prepare('SELECT v FROM marker').get() as { v: string }).v;
}

function backupName(iso: string, kind: 'manual' | 'auto'): string {
    return `sekel-backup-${iso.replace(/[:.]/g, '-')}${kind === 'auto' ? '-auto' : ''}.db`;
}

function touchBackup(name: string): void {
    fs.mkdirSync(getBackupDir(), { recursive: true });
    fs.writeFileSync(path.join(getBackupDir(), name), 'x');
}

function backupFiles(): string[] {
    return fs.existsSync(getBackupDir()) ? fs.readdirSync(getBackupDir()).sort() : [];
}

beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sekel-backup-test-'));
    makeSekelDb(dbPath(), 'before');
    openLive();
    dbOverride = null;
    mockInitDatabase.mockClear();
    mockInitDatabase.mockImplementation(() => openLive());
});

afterEach(() => {
    vi.useRealTimers();
    if (liveDb?.open) liveDb.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ── createBackup ──────────────────────────────────────────────────────────────

describe('createBackup', () => {
    it('writes a complete manual backup and leaves no .tmp file', async () => {
        const info = await createBackup();
        expect(info).not.toBeNull();
        expect(info!.kind).toBe('manual');
        expect(info!.filename).toMatch(/^sekel-backup-.*Z\.db$/);
        expect(info!.filename).not.toMatch(/-auto\.db$/);
        expect(backupFiles()).toEqual([info!.filename]);
        expect(validateBackupFile(info!.filePath)).toBeNull();
    });

    it('tags automatic backups with -auto', async () => {
        const info = await createBackup('auto');
        expect(info!.kind).toBe('auto');
        expect(info!.filename).toMatch(/-auto\.db$/);
        expect(listBackups().map(b => b.kind)).toEqual(['auto']);
    });

    it('never leaves a partial file under the final name when the backup fails', async () => {
        dbOverride = {
            backup: async (dest: string) => {
                fs.writeFileSync(dest, 'SQLite format 3\0partial');
                throw new Error('disk full');
            },
        };
        const info = await createBackup('manual');
        expect(info).toBeNull();
        expect(backupFiles()).toEqual([]);
        expect(listBackups()).toEqual([]);
    });
});

// ── Retention ─────────────────────────────────────────────────────────────────

describe('pruneAutoBackups', () => {
    it(`keeps the newest ${AUTO_BACKUP_RETENTION} automatic backups and never touches manual ones`, () => {
        const autos: string[] = [];
        for (let i = 0; i < 14; i++) {
            const name = backupName(new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), 'auto');
            autos.push(name);
            touchBackup(name);
        }
        const manuals = [0, 1, 2].map(i => backupName(new Date(Date.UTC(2024, 0, 1 + i)).toISOString(), 'manual'));
        manuals.forEach(touchBackup);

        const deleted = pruneAutoBackups(AUTO_BACKUP_RETENTION);

        expect(deleted.sort()).toEqual(autos.slice(0, 4).sort());
        expect(backupFiles()).toEqual([...manuals, ...autos.slice(4)].sort());
    });

    it('does not delete protected backups', () => {
        const names = Array.from({ length: 3 }, (_, i) =>
            backupName(new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), 'auto'));
        names.forEach(touchBackup);

        pruneAutoBackups(1, [names[0]]);

        expect(backupFiles()).toEqual([names[0], names[2]].sort());
    });

    it('removes stale .tmp leftovers but keeps in-progress ones', () => {
        const stale = backupName('2025-01-01T00:00:00.000Z', 'manual') + '.tmp';
        const fresh = backupName('2025-01-02T00:00:00.000Z', 'manual') + '.tmp';
        touchBackup(stale);
        touchBackup(fresh);
        const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
        fs.utimesSync(path.join(getBackupDir(), stale), twoHoursAgo, twoHoursAgo);

        pruneAutoBackups();

        expect(backupFiles()).toEqual([fresh]);
    });

    it('runs automatically after an automatic backup', async () => {
        for (let i = 0; i < 12; i++) {
            touchBackup(backupName(new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), 'auto'));
        }
        const manual = backupName('2019-01-01T00:00:00.000Z', 'manual');
        touchBackup(manual);

        const info = await createBackup('auto');

        const files = backupFiles();
        expect(files).toContain(info!.filename);
        expect(files).toContain(manual);
        expect(files.filter(f => f.endsWith('-auto.db'))).toHaveLength(AUTO_BACKUP_RETENTION);
    });

    it('manual backups do not trigger pruning', async () => {
        for (let i = 0; i < 12; i++) {
            touchBackup(backupName(new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), 'auto'));
        }
        await createBackup('manual');
        expect(backupFiles().filter(f => f.endsWith('-auto.db'))).toHaveLength(12);
    });
});

// ── Filename resolution ───────────────────────────────────────────────────────

describe('resolveBackupFile', () => {
    it('resolves valid manual and automatic names inside the backup dir', () => {
        for (const kind of ['manual', 'auto'] as const) {
            const name = backupName('2025-06-01T12:00:00.000Z', kind);
            expect(resolveBackupFile(name)).toBe(path.join(path.resolve(getBackupDir()), name));
        }
    });

    it.each([
        ['absolute path', path.join(os.tmpdir(), backupName('2025-06-01T12:00:00.000Z', 'manual'))],
        ['UNC path', '\\\\attacker\\share\\' + backupName('2025-06-01T12:00:00.000Z', 'manual')],
        ['traversal', '..\\..\\' + backupName('2025-06-01T12:00:00.000Z', 'manual')],
        ['posix traversal', '../' + backupName('2025-06-01T12:00:00.000Z', 'manual')],
        ['foreign name', 'sekel.db'],
        ['non-string', 42],
    ])('rejects %s', (_label, value) => {
        expect(resolveBackupFile(value)).toBeNull();
    });

    it('deleteBackup still deletes by filename', async () => {
        const info = await createBackup();
        expect(deleteBackup(info!.filename)).toBe(true);
        expect(backupFiles()).toEqual([]);
    });
});

// ── validateBackupFile ────────────────────────────────────────────────────────

describe('validateBackupFile', () => {
    const scratch = () => path.join(userDataDir, `candidate-${randomUUID()}.db`);

    it('accepts a valid Sekel database', () => {
        const p = scratch();
        makeSekelDb(p, 'ok');
        expect(validateBackupFile(p)).toBeNull();
    });

    it('accepts an older schema version (migrations will run on open)', () => {
        const p = scratch();
        makeSekelDb(p, 'ok', 1);
        expect(validateBackupFile(p)).toBeNull();
    });

    it('rejects a non-SQLite file', () => {
        const p = scratch();
        fs.writeFileSync(p, 'definitely not sqlite');
        expect(validateBackupFile(p)).toMatch(/not a valid SQLite database/);
    });

    it('rejects an empty file', () => {
        const p = scratch();
        fs.writeFileSync(p, '');
        expect(validateBackupFile(p)).toMatch(/not a valid SQLite database/);
    });

    it('rejects a SQLite file that is not a Sekel database', () => {
        const p = scratch();
        const db = new Database(p);
        db.exec('CREATE TABLE other (x)');
        db.close();
        expect(validateBackupFile(p)).toMatch(/not a Sekel database/);
    });

    it('rejects a backup from a newer schema version', () => {
        const p = scratch();
        makeSekelDb(p, 'future', MIGRATIONS.length + 1);
        expect(validateBackupFile(p)).toMatch(/newer version of Sekel/);
    });

    it('rejects a corrupted database', () => {
        const p = scratch();
        const db = new Database(p);
        db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
        db.exec('CREATE TABLE filler (x TEXT)');
        const ins = db.prepare('INSERT INTO filler (x) VALUES (?)');
        for (let i = 0; i < 500; i++) ins.run('row-' + i + '-'.repeat(100));
        db.close();
        // Smash the b-tree pages after the header page.
        const buf = fs.readFileSync(p);
        const pageSize = buf.readUInt16BE(16);
        buf.fill(0xab, pageSize * 2, pageSize * 4);
        fs.writeFileSync(p, buf);

        expect(validateBackupFile(p)).not.toBeNull();
    });
});

// ── restore ───────────────────────────────────────────────────────────────────

describe('restoreBackupByFilename', () => {
    it('restores the chosen backup, keeps a safety backup, and cleans up staging files', async () => {
        const original = await createBackup('manual');
        setMarker('after');

        const result = await restoreBackupByFilename(original!.filename);

        expect(result.success).toBe(true);
        expect(readMarker()).toBe('before');
        expect(result.safetyBackup?.kind).toBe('auto');
        expect(mockInitDatabase).toHaveBeenCalledTimes(1);

        // The safety backup holds the pre-restore state.
        const safety = new Database(result.safetyBackup!.filePath, { readonly: true });
        expect((safety.prepare('SELECT v FROM marker').get() as { v: string }).v).toBe('after');
        safety.close();

        expect(fs.readdirSync(userDataDir).filter(f => f.includes('.restoring'))).toEqual([]);
    });

    it.each([
        ['an absolute path outside the backup dir', () => {
            const outside = path.join(userDataDir, backupName('2025-06-01T12:00:00.000Z', 'manual'));
            makeSekelDb(outside, 'attacker');
            return outside;
        }],
        ['a UNC path', () => '\\\\attacker\\share\\' + backupName('2025-06-01T12:00:00.000Z', 'manual')],
        ['a traversal', () => '..\\' + backupName('2025-06-01T12:00:00.000Z', 'manual')],
        ['the live database', () => 'sekel.db'],
    ])('rejects %s without touching anything', async (_label, makeArg) => {
        const arg = makeArg();
        const result = await restoreBackupByFilename(arg);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Invalid backup file/);
        expect(readMarker()).toBe('before');
        expect(backupFiles()).toEqual([]);
        expect(mockInitDatabase).not.toHaveBeenCalled();
    });

    it('refuses a garbage file with a valid backup name and leaves the DB alone', async () => {
        const name = backupName('2025-06-01T12:00:00.000Z', 'manual');
        touchBackup(name);

        const result = await restoreBackupByFilename(name);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not a valid SQLite database/);
        expect(readMarker()).toBe('before');
        expect(backupFiles()).toEqual([name]); // no safety backup taken
        expect(fs.readdirSync(userDataDir).filter(f => f.includes('.restoring'))).toEqual([]);
    });

    it('refuses a backup from a newer app version', async () => {
        const name = backupName('2025-06-01T12:00:00.000Z', 'manual');
        fs.mkdirSync(getBackupDir(), { recursive: true });
        makeSekelDb(path.join(getBackupDir(), name), 'future', MIGRATIONS.length + 5);

        const result = await restoreBackupByFilename(name);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/newer version/);
        expect(readMarker()).toBe('before');
    });

    it('returns not-found for a valid name that does not exist', async () => {
        const result = await restoreBackupByFilename(backupName('2025-06-01T12:00:00.000Z', 'manual'));
        expect(result).toEqual({ success: false, error: 'Backup file not found' });
    });

    it('does not prune the backup being restored', async () => {
        // Oldest auto backup is the restore source; 10 newer autos already exist.
        const source = backupName('2020-01-01T00:00:00.000Z', 'auto');
        fs.mkdirSync(getBackupDir(), { recursive: true });
        makeSekelDb(path.join(getBackupDir(), source), 'from-old-auto');
        for (let i = 0; i < AUTO_BACKUP_RETENTION; i++) {
            touchBackup(backupName(new Date(Date.UTC(2021, 0, 1 + i)).toISOString(), 'auto'));
        }

        const result = await restoreBackupByFilename(source);

        expect(result.success).toBe(true);
        expect(readMarker()).toBe('from-old-auto');
        expect(backupFiles()).toContain(source);
    });
});

describe('restoreFromTrustedPath', () => {
    it('restores from a main-chosen temp path (cloud restore)', async () => {
        const tmp = path.join(userDataDir, 'sekel-restore-snap.sqlite');
        makeSekelDb(tmp, 'from-cloud');

        const result = await restoreFromTrustedPath(tmp);

        expect(result.success).toBe(true);
        expect(readMarker()).toBe('from-cloud');
    });

    it('aborts before touching the DB when the safety backup cannot be written', async () => {
        const tmp = path.join(userDataDir, 'source.db');
        makeSekelDb(tmp, 'new-data');
        // Make the backups "directory" a file so the safety backup fails.
        fs.writeFileSync(getBackupDir(), 'not a dir');

        const result = await restoreFromTrustedPath(tmp);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/safety backup/);
        expect(liveDb.open).toBe(true);
        expect(readMarker()).toBe('before');
        expect(mockInitDatabase).not.toHaveBeenCalled();
        expect(fs.readdirSync(userDataDir).filter(f => f.includes('.restoring'))).toEqual([]);
    });

    it('rolls back to the safety backup when the restored DB fails to open', async () => {
        const tmp = path.join(userDataDir, 'source.db');
        makeSekelDb(tmp, 'restored');
        setMarker('pre-restore');
        mockInitDatabase.mockImplementationOnce(() => {
            openLive();
            throw new Error('migration exploded');
        });

        const result = await restoreFromTrustedPath(tmp);

        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(true);
        expect(result.error).toMatch(/previous data was put back/);
        expect(readMarker()).toBe('pre-restore');
        expect(fs.readdirSync(userDataDir).filter(f => f.includes('.restoring'))).toEqual([]);
    });
});
