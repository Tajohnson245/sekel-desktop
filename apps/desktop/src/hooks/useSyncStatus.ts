import { useEffect, useState } from 'react';
import type { SyncStatus } from '../types/electron';

/** Live cloud-sync status from the main process (null until the first read). */
export function useSyncStatus(): SyncStatus | null {
    const [status, setStatus] = useState<SyncStatus | null>(null);
    useEffect(() => {
        const sync = window.electronAPI?.sync;
        if (!sync) return;
        let alive = true;
        sync.getStatus().then((s) => { if (alive) setStatus(s); }).catch(() => undefined);
        const off = sync.onStatus((s) => setStatus(s));
        return () => { alive = false; off(); };
    }, []);
    return status;
}
