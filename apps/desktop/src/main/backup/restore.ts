/**
 * Backup restore — replaces the current database with a backup snapshot.
 *
 * Restore process:
 * 1. Copy the source to `sekel.db.restoring` (the live DB is untouched)
 * 2. Validate the staged copy: SQLite header, `PRAGMA quick_check`, and a
 *    schema_version this build knows how to migrate
 * 3. Create a safety backup of the current state — abort if that fails
 * 4. Close the active connection, drop stale WAL/SHM, rename the staged copy
 *    over `sekel.db`, and reopen
 * 5. If reopening fails, put the safety backup back automatically
 *
 * The caller relaunches the app afterwards so in-memory state matches.
 *
 * Two entry points:
 *  - restoreBackupByFilename(): the IPC-facing API. Accepts only a bare backup
 *    filename, resolved inside the backup directory.
 *  - restoreFromTrustedPath(): main-process only (cloud restore downloads to a
 *    temp file). Never wire this to IPC.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { getDb, getDbPath, initDatabase } from '../db/index';
import { markRestored } from '../sync/meta';
import { MIGRATIONS } from '../db/migrations';
import { createBackup, resolveBackupFile, type BackupInfo } from './service';
import { createLogger, consoleTransport } from '@sekel/observability';

const log = createLogger({ module: 'backup-restore', transports: [consoleTransport] });

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

export interface RestoreResult {
    success: boolean;
    safetyBackup?: BackupInfo;
    error?: string;
    /** Set when the restore failed after the swap and the safety copy was put back. */
    rolledBack?: boolean;
}

/**
 * IPC entry point: restores the backup named `filename` from the backup directory.
 * Anything other than a bare backup filename (absolute paths, UNC shares,
 * `..` segments) is rejected before touching the filesystem.
 */
export async function restoreBackupByFilename(filename: unknown): Promise<RestoreResult> {
    const resolved = resolveBackupFile(filename);
    if (!resolved) {
        return { success: false, error: 'Invalid backup file' };
    }
    // Keep the chosen backup from being pruned by the safety backup's retention pass.
    return restoreFromTrustedPath(resolved, [filename as string]);
}

/**
 * Checks that `filePath` is an intact SQLite database holding a Sekel schema
 * this build can open. Opens the file read-only.
 *
 * @returns null when valid, otherwise a user-facing reason.
 */
export function validateBackupFile(filePath: string): string | null {
    let header: Buffer;
    try {
        const fd = fs.openSync(filePath, 'r');
        try {
            header = Buffer.alloc(SQLITE_MAGIC.length);
            const read = fs.readSync(fd, header, 0, header.length, 0);
            if (read < header.length) header = header.subarray(0, read);
        } finally {
            fs.closeSync(fd);
        }
    } catch (err) {
        return `Backup file could not be read: ${errMessage(err)}`;
    }
    if (!header.equals(SQLITE_MAGIC)) {
        return 'Backup file is not a valid SQLite database';
    }

    let db: Database.Database | null = null;
    try {
        db = new Database(filePath, { readonly: true, fileMustExist: true });

        const check = db.pragma('quick_check', { simple: true });
        if (check !== 'ok') {
            return `Backup file failed the integrity check: ${String(check)}`;
        }

        const hasVersionTable = db
            .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
            .get();
        if (!hasVersionTable) {
            return 'Backup file is not a Sekel database';
        }

        const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
        const version = row.v ?? 0;
        if (version > MIGRATIONS.length) {
            return 'This backup was made by a newer version of Sekel. Update the app, then try again.';
        }
        return null;
    } catch (err) {
        return `Backup file could not be opened: ${errMessage(err)}`;
    } finally {
        db?.close();
    }
}

/**
 * Restores the database from a backup file at an absolute path chosen by the
 * main process. Must never receive a renderer-supplied path.
 *
 * @param backupFilePath - Absolute path to the backup .db file to restore from.
 * @param protect - Backup filenames the safety backup's retention pass must keep.
 * @returns Result indicating success/failure and the safety backup info.
 */
export async function restoreFromTrustedPath(
    backupFilePath: string,
    protect: string[] = [],
): Promise<RestoreResult> {
    if (!fs.existsSync(backupFilePath)) {
        return { success: false, error: 'Backup file not found' };
    }

    const dbPath = getDbPath();
    const stagingPath = dbPath + '.restoring';

    // 1. Stage a copy next to the live DB. Validating the staged bytes (rather
    //    than the source) means what we check is exactly what we install.
    try {
        removeDbFiles(stagingPath);
        fs.copyFileSync(backupFilePath, stagingPath);
    } catch (err) {
        removeDbFiles(stagingPath);
        log.error('Failed to stage backup for restore', { error: errMessage(err) });
        return { success: false, error: `Could not copy the backup: ${errMessage(err)}` };
    }

    // 2. Validate. The read-only open may leave empty -wal/-shm sidecars behind.
    const invalid = validateBackupFile(stagingPath);
    removeSidecars(stagingPath);
    if (invalid) {
        removeDbFiles(stagingPath);
        log.warn('Rejected backup for restore', { reason: invalid });
        return { success: false, error: invalid };
    }

    // 3. Safety backup of the current state. Without one there is no way back,
    //    so a failure here (e.g. disk full) cancels the restore.
    const safetyBackup = await createBackup('auto', protect);
    if (!safetyBackup) {
        removeDbFiles(stagingPath);
        return {
            success: false,
            error: 'Could not create a safety backup of your current data, so the restore was cancelled. Check free disk space and try again.',
        };
    }

    // 4. Swap the staged copy in.
    let swapped = false;
    try {
        swapInStagedFile(stagingPath, dbPath);
        swapped = true;
        initDatabase();
        // Cloud sync makes the cloud match the restored library on its next
        // cycle (force-push, then prune what the restore removed).
        try {
            markRestored(getDb());
        } catch (err) {
            log.warn('Could not flag the restore for cloud sync', { error: errMessage(err) });
        }
        log.info('Restore completed successfully', { safetyBackup: safetyBackup.filename });
        return { success: true, safetyBackup };
    } catch (err) {
        if (!swapped) {
            // The live file was never replaced — just reopen it.
            removeDbFiles(stagingPath);
            try {
                initDatabase();
                log.error('Restore failed before replacing the database', { error: errMessage(err) });
                return {
                    success: false,
                    error: `Restore failed (${errMessage(err)}). Your data was not changed.`,
                    safetyBackup,
                };
            } catch {
                // Fall through to the full rollback below.
            }
        }
        log.error('Restore failed; rolling back to safety backup', { error: errMessage(err) });

        // 5. Put the pre-restore state back.
        const rolledBack = rollBack(safetyBackup.filePath, stagingPath, dbPath);
        return {
            success: false,
            error: rolledBack
                ? `Restore failed (${errMessage(err)}). Your previous data was put back.`
                : `Restore failed (${errMessage(err)}) and your previous data could not be put back automatically. Restore the backup "${safetyBackup.filename}" to recover it.`,
            safetyBackup,
            rolledBack,
        };
    }
}

/**
 * Closes the live connection, drops stale WAL/SHM, and renames staging over
 * the DB. Throws only from the rename, so a throw means the live file is intact.
 */
function swapInStagedFile(stagingPath: string, dbPath: string): void {
    closeDbQuietly();
    // WAL/SHM belong to the old database (closing checkpointed them); replaying
    // them onto the restored file would corrupt it.
    removeSidecars(dbPath);
    fs.renameSync(stagingPath, dbPath);
}

function rollBack(safetyPath: string, stagingPath: string, dbPath: string): boolean {
    try {
        removeDbFiles(stagingPath);
        fs.copyFileSync(safetyPath, stagingPath);
        swapInStagedFile(stagingPath, dbPath);
        initDatabase();
        log.info('Rolled back to safety backup');
        return true;
    } catch (rollbackErr) {
        log.error('Rollback to safety backup failed', { error: errMessage(rollbackErr) });
        removeDbFiles(stagingPath);
        // Last resort: reopen whatever is on disk so the app is not left without a DB.
        try {
            initDatabase();
        } catch (reinitErr) {
            log.error('Failed to reinitialize database after rollback failure', { error: errMessage(reinitErr) });
        }
        return false;
    }
}

function closeDbQuietly(): void {
    try {
        const db = getDb();
        if (db.open) db.close();
    } catch {
        // Not initialised or already closed — nothing to do.
    }
}

function removeSidecars(dbFilePath: string): void {
    for (const suffix of ['-wal', '-shm']) {
        try { fs.rmSync(dbFilePath + suffix, { force: true }); } catch { /* best effort */ }
    }
}

function removeDbFiles(dbFilePath: string): void {
    try { fs.rmSync(dbFilePath, { force: true }); } catch { /* best effort */ }
    removeSidecars(dbFilePath);
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
