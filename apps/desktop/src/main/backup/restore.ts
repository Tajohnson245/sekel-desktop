/**
 * Backup restore — replaces the current database with a backup snapshot.
 *
 * Restore process:
 * 1. Create a safety backup of the current state
 * 2. Close the active database connection
 * 3. Copy the backup file over the current database
 * 4. Reopen the database connection
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDb, initDatabase } from '../db/index';
import { createBackup, type BackupInfo } from './service';

export interface RestoreResult {
    success: boolean;
    safetyBackup?: BackupInfo;
    error?: string;
}

/**
 * Restores the database from a backup file.
 *
 * @param backupFilePath - Absolute path to the backup .db file to restore from.
 * @returns Result indicating success/failure and the safety backup info.
 */
export async function restoreFromBackup(backupFilePath: string): Promise<RestoreResult> {
    // Validate the backup file exists
    if (!fs.existsSync(backupFilePath)) {
        return { success: false, error: 'Backup file not found' };
    }

    // Create a safety backup before overwriting
    const safetyBackup = await createBackup();

    const dbPath = path.join(app.getPath('userData'), 'sekel.db');
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';

    try {
        // Close the current database connection
        const db = getDb();
        db.close();

        // Remove WAL/SHM files if they exist (they're now stale)
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        // Copy backup over the current database
        fs.copyFileSync(backupFilePath, dbPath);

        // Reinitialize the database connection
        initDatabase();

        console.log('[Backup] Restore completed successfully');
        return {
            success: true,
            safetyBackup: safetyBackup ?? undefined,
        };
    } catch (err) {
        console.error('[Backup] Restore failed:', err);

        // Try to reinitialize the database in any case
        try {
            initDatabase();
        } catch (reinitErr) {
            console.error('[Backup] Failed to reinitialize database after restore failure:', reinitErr);
        }

        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown restore error',
            safetyBackup: safetyBackup ?? undefined,
        };
    }
}
