import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackupSnapshot, BackupSnapshotInsert } from '../types';

/** Inserts a snapshot metadata row (bytes already uploaded to Storage). */
export async function insertBackupSnapshot(
    client: SupabaseClient,
    snapshot: BackupSnapshotInsert,
): Promise<BackupSnapshot> {
    const { data, error } = await client
        .from('backup_snapshots')
        .insert(snapshot)
        .select()
        .single();
    if (error) throw error;
    return data as BackupSnapshot;
}

/** Lists the caller's snapshots, newest first (drives the restore list). */
export async function listBackupSnapshots(
    client: SupabaseClient,
    limit = 50,
): Promise<BackupSnapshot[]> {
    const { data, error } = await client
        .from('backup_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as BackupSnapshot[];
}

/** Most recent snapshot for the caller, or null if none exists. */
export async function fetchLatestBackupSnapshot(
    client: SupabaseClient,
): Promise<BackupSnapshot | null> {
    const { data, error } = await client
        .from('backup_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return (data as BackupSnapshot) ?? null;
}

/** Deletes a snapshot metadata row by id (Storage object removed separately). */
export async function deleteBackupSnapshot(
    client: SupabaseClient,
    id: string,
): Promise<void> {
    const { error } = await client
        .from('backup_snapshots')
        .delete()
        .eq('id', id);
    if (error) throw error;
}
