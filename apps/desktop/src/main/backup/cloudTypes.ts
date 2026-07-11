/**
 * Shared types for the cloud backup subsystem.
 *
 * This is the automatic, Supabase-backed backup layer. It is separate from the
 * existing manual, local-disk backup system in service.ts / restore.ts — both
 * coexist by design (local = instant offline safety net, cloud = off-device
 * durability + cross-device restore).
 */

/** Why a snapshot was taken. Mirrors the spec's trigger reasons. */
export type BackupReason = 'review-threshold' | 'app-close' | 'idle' | 'manual';

/**
 * The renderer-owned Supabase session, pushed to main so the main process can
 * perform RLS-scoped Storage uploads + row inserts as the signed-in user.
 * Held in memory only — never written to disk.
 */
export interface CloudBackupSession {
    userId: string;
    accessToken: string;
    refreshToken: string;
    /** Unix seconds when the access token expires, if known. */
    expiresAt?: number;
}

/** One cloud snapshot as surfaced to the renderer restore UI. */
export interface CloudSnapshotInfo {
    id: string;
    createdAt: string;
    generation: 'daily' | 'weekly' | 'monthly';
    sizeBytes: number;
    reviewCount: number | null;
    appVersion: string | null;
}

/** Result of a restore attempt (mirrors the local RestoreResult shape). */
export interface CloudRestoreResult {
    success: boolean;
    error?: string;
    /** Local safety backup filename created before overwriting, if any. */
    safetyBackup?: string;
}
