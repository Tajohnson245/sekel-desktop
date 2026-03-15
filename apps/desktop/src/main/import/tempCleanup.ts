import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TEMP_DIR_PREFIX = 'sekel-import-';

/** Returns a fresh (not yet created) temp dir path: {os.tmpdir()}/sekel-import-{uuid} */
export function makeTempDirPath(): string {
    return path.join(os.tmpdir(), TEMP_DIR_PREFIX + randomUUID());
}

/**
 * Removes a temp dir. Silent if the path does not exist.
 * Used in processApkgFile()'s finally/catch block and by Phase 3 after import.
 */
export async function removeTempDir(dirPath: string): Promise<void> {
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
