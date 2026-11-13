import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../UI';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import type { SyncStatus } from '../../../types/electron';

/** One line describing what sync is doing right now. */
export function syncStateLabel(t: (key: string, opts?: Record<string, unknown>) => string, s: SyncStatus): string {
    switch (s.state) {
        case 'signed_out': return t('sync.state_signed_out');
        case 'disabled': return t('sync.state_disabled');
        case 'unavailable': return t('sync.state_unavailable');
        case 'offline': return t('sync.state_offline');
        case 'error': return t('sync.state_error');
        case 'syncing':
            return t(`sync.state_syncing_${s.phase ?? 'uploading'}`, { count: s.progress });
        default:
            return t('sync.state_idle');
    }
}

/** Profile → Backup: row-level cloud sync status and "Sync now". */
export function CloudSyncSection() {
    const { t } = useTranslation();
    const status = useSyncStatus();
    const [busy, setBusy] = useState(false);
    if (!status) return null;

    const canSync = status.state !== 'signed_out' && status.state !== 'disabled' && status.state !== 'syncing';
    const handleSyncNow = async () => {
        setBusy(true);
        try {
            await window.electronAPI.sync.syncNow();
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="profile-section" data-testid="cloud-sync-section">
            <div className="section-header">
                <h3>
                    <RefreshCw size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                    {t('sync.title')}
                </h3>
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                {t('sync.description')}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div role="status" aria-live="polite">
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{syncStateLabel(t, status)}</div>
                    {status.lastSyncAt && (
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {t('sync.last_synced', { time: new Date(status.lastSyncAt).toLocaleString() })}
                        </div>
                    )}
                    {status.pending > 0 && status.state !== 'syncing' && (
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t('sync.pending', { count: status.pending })}</div>
                    )}
                    {status.failed > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--rose)' }} title={status.lastError ?? undefined}>
                            {t('sync.failed', { count: status.failed })}
                        </div>
                    )}
                </div>
                <Button
                    variant="secondary"
                    onClick={handleSyncNow}
                    disabled={!canSync || busy}
                    icon={<RefreshCw size={14} />}
                >
                    {t('sync.sync_now')}
                </Button>
            </div>
        </section>
    );
}
