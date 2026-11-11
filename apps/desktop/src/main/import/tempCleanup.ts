import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TEMP_DIR_PREFIX = 'sekel-import-';
const TEMP_DIR_NAME_RE = /^sekel-import-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a fresh (not yet created) temp dir path: {os.tmpdir()}/sekel-import-{uuid} */
export function makeTempDirPath(): string {
    return path.join(os.tmpdir(), TEMP_DIR_PREFIX + randomUUID());
}

/**
 * True only for paths shaped exactly like makeTempDirPath() output: a direct
 * child of os.tmpdir() named sekel-import-{uuid}. Temp dir paths round-trip
 * through the renderer, so every path we are asked to delete is checked here.
 */
export function isImportTempDir(dirPath: unknown): dirPath is string {
    if (typeof dirPath !== 'string' || dirPath.length === 0) return false;
    const resolved = path.resolve(dirPath);
    const parent = path.dirname(resolved);
    const tmpRoot = path.resolve(os.tmpdir());
    const sameParent = process.platform === 'win32'
        ? parent.toLowerCase() === tmpRoot.toLowerCase()
        : parent === tmpRoot;
    return sameParent && TEMP_DIR_NAME_RE.test(path.basename(resolved));
}

/**
 * Removes an import temp dir. Silent if the path does not exist.
 * Refuses (and logs) anything that is not an import temp dir — see isImportTempDir.
 * Used in processApkgFile()'s finally/catch block and by Phase 3 after import.
 */
export async function removeTempDir(dirPath: string): Promise<void> {
    if (!isImportTempDir(dirPath)) {
        console.warn('[import] refusing to remove non-import temp path:', dirPath);
        return;
    }
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (err) {
        console.error('[import] failed to remove temp dir:', dirPath, err);
    }
}

/**
 * Scans os.tmpdir() for stale sekel-import-* directories left by a previous
 * crashed session and removes them. Called once on app.whenReady().
 * Errors on individual dirs are caught so the rest still run.
 */
export async function cleanupStaleTempDirs(): Promise<void> {
    const tmpDir = os.tmpdir();
    let entries: string[];
    try {
        entries = await fs.readdir(tmpDir);
    } catch (err) {
        console.error('[import] could not read temp dir for cleanup:', err);
        return;
    }

    const stale = entries.filter(e => e.startsWith(TEMP_DIR_PREFIX));
    if (stale.length === 0) return;

    console.log(`[import] cleaning up ${stale.length} stale temp dir(s)`);
    for (const entry of stale) {
        const fullPath = path.join(tmpDir, entry);
        try {
            await fs.rm(fullPath, { recursive: true, force: true });
        } catch (err) {
            console.error('[import] failed to remove stale temp dir:', fullPath, err);
        }
    }
}
