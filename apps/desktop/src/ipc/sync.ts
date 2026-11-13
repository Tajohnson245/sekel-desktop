import { instrumentedHandle } from '@sekel/observability';
import { getSyncStatus, syncNow } from '../main/sync/service';

/** Cloud sync status + "Sync now" for the Backup tab. Events: sync:status, sync:applied. */
export function setupSyncHandlers(): void {
    instrumentedHandle('sync:getStatus', () => getSyncStatus());
    instrumentedHandle('sync:syncNow', () => syncNow());
}
