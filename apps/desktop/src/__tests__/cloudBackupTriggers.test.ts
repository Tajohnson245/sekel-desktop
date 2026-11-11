import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sekel-cloud-sweep-'));
let testDb: Database.Database;

vi.mock('electron', () => ({
    app: { getPath: () => tempDir, getVersion: () => '0.0.0-test' },
    powerMonitor: { getSystemIdleTime: () => 0 },
}));
vi.mock('@sentry/electron/main', () => ({ withScope: () => {}, captureException: () => {} }));
vi.mock('../main/db/index', () => ({ getDb: () => testDb }));
vi.mock('../main/backup/cloudState', () => ({
    setSession: () => {},
    getSession: () => null,
    getReviewsSinceLastBackup: () => 0,
}));
vi.mock('../main/backup/cloudAlert', () => ({ sendBackupFailureAlert: async () => {} }));

import { hasLocalWritesSinceSnapshot, setSession, sweepStaleSnapshotTemps } from '../main/backup/cloudBackup';

beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
});
afterEach(() => testDb.close());

describe('cloud backup: non-review writes count as unsynced work', () => {
    it('flags imports/edits made after the session baseline', () => {
        // Startup writes (migrations/seeding) happen before the first session.
        testDb.prepare('INSERT INTO t (v) VALUES (?)').run('seed');
        setSession({ userId: 'u1', accessToken: 'a', refreshToken: 'r' });
        expect(hasLocalWritesSinceSnapshot()).toBe(false);

        testDb.prepare('INSERT INTO t (v) VALUES (?)').run('imported card');
        expect(hasLocalWritesSinceSnapshot()).toBe(true);
    });

    it('re-anchors when the connection is reopened (e.g. after a restore)', () => {
        testDb.close();
        testDb = new Database(':memory:');   // total_changes() restarts at 0
        expect(hasLocalWritesSinceSnapshot()).toBe(false);
        testDb.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
        testDb.prepare('INSERT INTO t DEFAULT VALUES').run();
        expect(hasLocalWritesSinceSnapshot()).toBe(true);
    });
});

describe('sweepStaleSnapshotTemps', () => {
    it('removes stale snapshot copies only', () => {
        const stale = path.join(tempDir, `sekel-cloud-${randomUUID()}.sqlite`);
        const staleWal = `${stale}-wal`;
        const fresh = path.join(tempDir, `sekel-cloud-${randomUUID()}.sqlite`);
        const unrelated = path.join(tempDir, 'sekel-import-something.db');
        for (const f of [stale, staleWal, fresh, unrelated]) fs.writeFileSync(f, 'x');
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        for (const f of [stale, staleWal, unrelated]) fs.utimesSync(f, twoHoursAgo, twoHoursAgo);

        expect(sweepStaleSnapshotTemps()).toBe(2);
        expect(fs.existsSync(stale)).toBe(false);
        expect(fs.existsSync(staleWal)).toBe(false);
        expect(fs.existsSync(fresh)).toBe(true);      // may belong to a running snapshot
        expect(fs.existsSync(unrelated)).toBe(true);  // not ours
        for (const f of [fresh, unrelated]) fs.unlinkSync(f);
    });
});
