/**
 * Backup service — manages automatic and manual SQLite backups using
 * better-sqlite3's .backup() API for WAL-safe snapshots.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDb } from '../db/index';

export interface BackupInfo {
    filename: string;
    filePath: string;
    timestamp: string;
    sizeBytes: number;
}

export interface BackupSettings {
    intervalMinutes: number;
    dailyRetention: number;
    weeklyRetention: number;
    monthlyRetention: number;
}

const DEFAULT_SETTINGS: BackupSettings = {
    intervalMinutes: 30,
    dailyRetention: 10,
    weeklyRetention: 4,
    monthlyRetention: 2,
};

let backupInterval: ReturnType<typeof setInterval> | null = null;
let currentSettings: BackupSettings = { ...DEFAULT_SETTINGS };

/** Returns the directory where backups are stored. */
export function getBackupDir(): string {
    return path.join(app.getPath('userData'), 'backups');
}

/** Ensures the backup directory exists. */
function ensureBackupDir(): void {
    const dir = getBackupDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/** Generates a timestamped backup filename. */
function makeBackupFilename(): string {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    return `sekel-backup-${ts}.db`;
}

/**
 * Creates a backup of the current database using better-sqlite3's .backup() API.
 * This is safe to call while the database is in WAL mode and actively in use.
 *
 * @returns Info about the created backup, or null if backup failed.
 */
export async function createBackup(): Promise<BackupInfo | null> {
    try {
        ensureBackupDir();
        const filename = makeBackupFilename();
        const destPath = path.join(getBackupDir(), filename);

        const db = getDb();
        await db.backup(destPath);

        const stat = fs.statSync(destPath);
        const info: BackupInfo = {
            filename,
            filePath: destPath,
            timestamp: new Date().toISOString(),
            sizeBytes: stat.size,
        };

        console.log(`[Backup] Created: ${filename} (${formatBytes(stat.size)})`);
        return info;
    } catch (err) {
        console.error('[Backup] Failed to create backup:', err);
        return null;
    }
}

/** Lists all available backups sorted newest first. */
export function listBackups(): BackupInfo[] {
    const dir = getBackupDir();
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter((f) => f.startsWith('sekel-backup-') && f.endsWith('.db'))
        .map((filename) => {
            const filePath = path.join(dir, filename);
            const stat = fs.statSync(filePath);

            return {
                filename,
                filePath,
                timestamp: stat.mtime.toISOString(),
                sizeBytes: stat.size,
            };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Deletes a specific backup file. */
export function deleteBackup(filename: string): boolean {
    const filePath = path.join(getBackupDir(), filename);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    console.log(`[Backup] Deleted: ${filename}`);
    return true;
}

/**
 * Prunes old backups according to the retention policy.
 *
 * Strategy:
 * - Backups < 2 days old: keep all
 * - Daily backups (2–30 days): keep one per day, up to dailyRetention
 * - Weekly backups (30–120 days): keep one per week, up to weeklyRetention
 * - Monthly backups (120+ days): keep one per month, up to monthlyRetention
 * - Everything else is deleted
 */
export function pruneBackups(settings: BackupSettings = currentSettings): void {
    const backups = listBackups();
    if (backups.length === 0) return;

    const now = Date.now();
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const FOUR_MONTHS = 120 * 24 * 60 * 60 * 1000;

    const toKeep = new Set<string>();
    const dailyBuckets = new Map<string, BackupInfo>();
    const weeklyBuckets = new Map<string, BackupInfo>();
    const monthlyBuckets = new Map<string, BackupInfo>();

    for (const backup of backups) {
        const age = now - new Date(backup.timestamp).getTime();

        if (age < TWO_DAYS) {
            // Keep all recent backups
            toKeep.add(backup.filename);
        } else if (age < THIRTY_DAYS) {
            // Daily bucket: one per day
            const dayKey = backup.timestamp.slice(0, 10); // YYYY-MM-DD
            if (!dailyBuckets.has(dayKey)) {
                dailyBuckets.set(dayKey, backup);
            }
        } else if (age < FOUR_MONTHS) {
            // Weekly bucket: one per ISO week
            const date = new Date(backup.timestamp);
            const weekKey = getISOWeekKey(date);
            if (!weeklyBuckets.has(weekKey)) {
                weeklyBuckets.set(weekKey, backup);
            }
        } else {
            // Monthly bucket: one per month
            const monthKey = backup.timestamp.slice(0, 7); // YYYY-MM
            if (!monthlyBuckets.has(monthKey)) {
                monthlyBuckets.set(monthKey, backup);
            }
        }
    }

    // Keep the most recent N from each bucket
    const dailyKept = [...dailyBuckets.values()].slice(0, settings.dailyRetention);
    const weeklyKept = [...weeklyBuckets.values()].slice(0, settings.weeklyRetention);
    const monthlyKept = [...monthlyBuckets.values()].slice(0, settings.monthlyRetention);

    for (const b of [...dailyKept, ...weeklyKept, ...monthlyKept]) {
        toKeep.add(b.filename);
    }

    // Delete everything not in the keep set
    let deleted = 0;
    for (const backup of backups) {
        if (!toKeep.has(backup.filename)) {
            deleteBackup(backup.filename);
            deleted++;
        }
    }

    if (deleted > 0) {
        console.log(`[Backup] Pruned ${deleted} old backup(s)`);
    }
}

/** Starts the automatic backup scheduler. */
export function startBackupScheduler(settings?: Partial<BackupSettings>): void {
    if (settings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    }

    stopBackupScheduler();

    if (currentSettings.intervalMinutes <= 0) {
        console.log('[Backup] Automatic backups disabled (interval = 0)');
        return;
    }

    const intervalMs = currentSettings.intervalMinutes * 60 * 1000;

    // Create initial backup on startup
    createBackup().then(() => pruneBackups());

    backupInterval = setInterval(async () => {
        await createBackup();
        pruneBackups();
    }, intervalMs);

    console.log(`[Backup] Scheduler started (every ${currentSettings.intervalMinutes} min)`);
}

/** Stops the automatic backup scheduler. */
export function stopBackupScheduler(): void {
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
        console.log('[Backup] Scheduler stopped');
    }
}

/** Updates backup settings and restarts the scheduler. */
export function updateBackupSettings(settings: Partial<BackupSettings>): void {
    currentSettings = { ...currentSettings, ...settings };
    startBackupScheduler(currentSettings);
}

/** Returns the current backup settings. */
export function getBackupSettings(): BackupSettings {
    return { ...currentSettings };
}

/** Returns the total size of all backups. */
export function getBackupsTotalSize(): number {
    return listBackups().reduce((sum, b) => sum + b.sizeBytes, 0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getISOWeekKey(date: Date): string {
    const d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 4);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
