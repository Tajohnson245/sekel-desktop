import { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudUpload, Database, Download, HardDrive, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, useToast } from '../../UI';
import type { BackupInfo, CloudSnapshotInfo } from '../../../types/electron.d';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function BackupTab() {
    const { t } = useTranslation();
    const { showToast } = useToast();

    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [totalSize, setTotalSize] = useState(0);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [integrityResult, setIntegrityResult] = useState<string | null>(null);
    const [checkingIntegrity, setCheckingIntegrity] = useState(false);

    // Cloud backups (Supabase). Coexists with the local backups above.
    const [cloudSnapshots, setCloudSnapshots] = useState<CloudSnapshotInfo[]>([]);
    const [cloudLoading, setCloudLoading] = useState(true);
    const [cloudError, setCloudError] = useState<string | null>(null);
    const [cloudBackingUp, setCloudBackingUp] = useState(false);
    const [cloudRestoreTarget, setCloudRestoreTarget] = useState<CloudSnapshotInfo | null>(null);
    const [cloudRestoring, setCloudRestoring] = useState(false);

    const loadBackupData = useCallback(async () => {
        try {
            const [backupList, size] = await Promise.all([
                window.electronAPI.backup.list(),
                window.electronAPI.backup.getTotalSize(),
            ]);
            setBackups(backupList);
            setTotalSize(size);
        } catch (err) {
            console.error('Failed to load backup data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBackupData();
    }, [loadBackupData]);

    // Listen for menu-triggered backup creation
    useEffect(() => {
        const unsub = window.electronAPI.backup.onCreated(() => {
            showToast(t('backup.created_success'), 'success');
            loadBackupData();
        });
        return unsub;
    }, [loadBackupData, showToast, t]);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const result = await window.electronAPI.backup.create();
            if (result) {
                showToast(t('backup.created_success'), 'success');
                await loadBackupData();
            } else {
                showToast(t('backup.created_error'), 'error');
            }
        } catch {
            showToast(t('backup.created_error'), 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        setRestoring(true);
        try {
            const result = await window.electronAPI.backup.restore(restoreTarget.filePath);
            if (result.success) {
                showToast(t('backup.restore_success'), 'success');
                setRestoreTarget(null);
                await loadBackupData();
            } else {
                showToast(result.error || t('backup.restore_error'), 'error');
            }
        } catch {
            showToast(t('backup.restore_error'), 'error');
        } finally {
            setRestoring(false);
        }
    };

    const handleDelete = async (filename: string) => {
        await window.electronAPI.backup.delete(filename);
        await loadBackupData();
    };

    const loadCloudSnapshots = useCallback(async () => {
        setCloudLoading(true);
        setCloudError(null);
        try {
            const list = await window.electronAPI.cloudBackup.list();
            setCloudSnapshots(list);
        } catch (err) {
            setCloudError(err instanceof Error ? err.message : String(err));
        } finally {
            setCloudLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCloudSnapshots();
    }, [loadCloudSnapshots]);

    const handleCloudBackupNow = async () => {
        setCloudBackingUp(true);
        try {
            const ok = await window.electronAPI.cloudBackup.snapshotNow();
            if (ok) {
                showToast(t('backup.cloud_backup_success'), 'success');
                await loadCloudSnapshots();
            } else {
                showToast(t('backup.cloud_backup_error'), 'error');
            }
        } catch {
            showToast(t('backup.cloud_backup_error'), 'error');
        } finally {
            setCloudBackingUp(false);
        }
    };

    const handleCloudRestore = async () => {
        if (!cloudRestoreTarget) return;
        setCloudRestoring(true);
        try {
            const result = await window.electronAPI.cloudBackup.restore(cloudRestoreTarget.id);
            if (result.success) {
                showToast(t('backup.cloud_restore_success'), 'success');
                setCloudRestoreTarget(null);
                // Relaunch so all in-memory state matches the restored database.
                setTimeout(() => { void window.electronAPI.cloudBackup.restart(); }, 1200);
            } else {
                showToast(result.error || t('backup.cloud_restore_error'), 'error');
                setCloudRestoring(false);
            }
        } catch {
            showToast(t('backup.cloud_restore_error'), 'error');
            setCloudRestoring(false);
        }
    };

    const handleCheckIntegrity = async () => {
        setCheckingIntegrity(true);
        setIntegrityResult(null);
        try {
            const result = await window.electronAPI.db.checkIntegrity();
            setIntegrityResult(result);
        } catch (err) {
            setIntegrityResult(err instanceof Error ? err.message : 'Check failed');
        } finally {
            setCheckingIntegrity(false);
        }
    };

    if (loading) {
        return <div className="profile-section"><p>{t('common.loading')}</p></div>;
    }

    return (
        <>
            {/* Backup Actions */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>
                        <HardDrive size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        {t('backup.title')}
                    </h3>
                </div>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                    {t('backup.description')}
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Button
                        variant="primary"
                        onClick={handleCreate}
                        disabled={creating}
                        icon={<Download size={14} />}
                    >
                        {creating ? t('backup.creating') : t('backup.create_now')}
                    </Button>
                </div>

                {/* Backup list */}
                <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="field-label">{t('backup.available_backups')}</label>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {t('backup.total_size', { size: formatBytes(totalSize) })}
                        </span>
                    </div>

                    {backups.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                            {t('backup.no_backups')}
                        </p>
                    ) : (
                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                            {backups.map((backup) => (
                                <div
                                    key={backup.filename}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem 0.8rem',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.9rem' }}>{formatTimestamp(backup.timestamp)}</div>
                                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatBytes(backup.sizeBytes)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <Button
                                            variant="secondary"
                                            onClick={() => setRestoreTarget(backup)}
                                            icon={<Upload size={12} />}
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                        >
                                            {t('backup.restore')}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleDelete(backup.filename)}
                                            icon={<Trash2 size={12} />}
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Cloud Backups (Supabase) */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>
                        <Cloud size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        {t('backup.cloud_title')}
                    </h3>
                </div>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                    {t('backup.cloud_description')}
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <Button
                        variant="primary"
                        onClick={handleCloudBackupNow}
                        disabled={cloudBackingUp}
                        icon={<CloudUpload size={14} />}
                    >
                        {cloudBackingUp ? t('backup.cloud_backing_up') : t('backup.cloud_backup_now')}
                    </Button>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                    <label className="field-label">{t('backup.cloud_available')}</label>

                    {cloudLoading ? (
                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('common.loading')}</p>
                    ) : cloudError ? (
                        <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                            {t('backup.cloud_unavailable')}
                        </p>
                    ) : cloudSnapshots.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                            {t('backup.cloud_no_backups')}
                        </p>
                    ) : (
                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                            {cloudSnapshots.map((snap) => (
                                <div
                                    key={snap.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.6rem 0.8rem',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.9rem' }}>{formatTimestamp(snap.createdAt)}</div>
                                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                            {formatBytes(snap.sizeBytes)}
                                            {snap.reviewCount != null && ` · ${t('backup.cloud_review_count', { n: snap.reviewCount })}`}
                                            {` · ${t(`backup.cloud_generation_${snap.generation}`)}`}
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={() => setCloudRestoreTarget(snap)}
                                        icon={<Download size={12} />}
                                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                    >
                                        {t('backup.restore')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Database Integrity Check */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>
                        <Database size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        {t('backup.integrity_title')}
                    </h3>
                </div>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    {t('backup.integrity_desc')}
                </p>
                <Button
                    variant="secondary"
                    onClick={handleCheckIntegrity}
                    disabled={checkingIntegrity}
                    icon={<Database size={14} />}
                >
                    {checkingIntegrity ? t('backup.checking') : t('backup.check_database')}
                </Button>
                {integrityResult && (
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        background: integrityResult === 'ok' ? 'var(--teal-soft)' : 'var(--rose-soft)',
                        color: integrityResult === 'ok' ? 'var(--teal)' : 'var(--rose)',
                    }}>
                        {integrityResult === 'ok' ? t('backup.integrity_ok') : t('backup.integrity_error', { detail: integrityResult })}
                    </div>
                )}
            </section>

            {/* Restore Confirmation Modal */}
            <Modal
                isOpen={restoreTarget !== null}
                onClose={() => setRestoreTarget(null)}
                title={t('backup.restore_confirm_title')}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setRestoreTarget(null)} disabled={restoring}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="danger" onClick={handleRestore} disabled={restoring}>
                            {restoring ? t('backup.restoring') : t('backup.restore_confirm')}
                        </Button>
                    </>
                }
            >
                <div className="text-muted">
                    <p>{t('backup.restore_warning')}</p>
                    {restoreTarget && (
                        <p style={{ marginTop: '0.5rem', fontWeight: 500 }}>
                            {t('backup.restore_date', { date: formatTimestamp(restoreTarget.timestamp) })}
                        </p>
                    )}
                    <p style={{ marginTop: '0.75rem', fontWeight: 500, color: 'var(--danger)' }}>
                        {t('backup.restore_danger')}
                    </p>
                </div>
            </Modal>

            {/* Cloud Restore Confirmation Modal */}
            <Modal
                isOpen={cloudRestoreTarget !== null}
                onClose={() => { if (!cloudRestoring) setCloudRestoreTarget(null); }}
                title={t('backup.cloud_restore_confirm_title')}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCloudRestoreTarget(null)} disabled={cloudRestoring}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="danger" onClick={handleCloudRestore} disabled={cloudRestoring}>
                            {cloudRestoring ? t('backup.restoring') : t('backup.cloud_restore_confirm')}
                        </Button>
                    </>
                }
            >
                <div className="text-muted">
                    <p>{t('backup.cloud_restore_warning')}</p>
                    {cloudRestoreTarget && (
                        <p style={{ marginTop: '0.5rem', fontWeight: 500 }}>
                            {t('backup.restore_date', { date: formatTimestamp(cloudRestoreTarget.createdAt) })}
                        </p>
                    )}
                    <p style={{ marginTop: '0.75rem', fontWeight: 500, color: 'var(--danger)' }}>
                        {t('backup.cloud_restore_danger')}
                    </p>
                </div>
            </Modal>
        </>
    );
}
