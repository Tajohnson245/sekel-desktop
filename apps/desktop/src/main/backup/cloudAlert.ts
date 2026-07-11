/**
 * Discord alerting for repeated cloud-backup failures.
 *
 * The Discord webhook URL is a server-side secret, so the client never holds
 * it. Instead the main process invokes the `backup-alert` Supabase Edge
 * Function with the user's JWT; the function verifies the caller and posts the
 * embed to Discord. This mirrors how feedback-discord keeps the webhook URL in
 * Supabase secrets rather than in the shipped app.
 *
 * Called only after 3 consecutive failures (gated by the caller), so a single
 * transient network blip never pages anyone.
 */

import { createClient } from '@supabase/supabase-js';
import { app } from 'electron';
import { createLogger, consoleTransport } from '@sekel/observability';
import type { CloudBackupSession } from './cloudTypes';

const log = createLogger({ module: 'cloud-backup-alert', transports: [consoleTransport] });

export async function sendBackupFailureAlert(
    session: CloudBackupSession | null,
    consecutiveFailures: number,
    lastError: string,
): Promise<void> {
    if (!session) return;

    const url = process.env.VITE_SUPABASE_PROJECT_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) {
        log.warn('Cannot send backup alert — Supabase config missing');
        return;
    }

    try {
        // Anon client carrying the user's JWT so the edge function can verify
        // the caller and attribute the alert to a real user_id.
        const client = createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
        });

        const { error } = await client.functions.invoke('backup-alert', {
            body: {
                user_id: session.userId,
                consecutive_failures: consecutiveFailures,
                last_error: lastError,
                app_version: app.getVersion(),
                platform: process.platform,
            },
        });

        if (error) {
            log.error('backup-alert function returned error', { error: error.message });
        } else {
            log.info('Sent backup failure alert to Discord', { consecutiveFailures });
        }
    } catch (err) {
        // Alerting is best-effort — never let it throw into the snapshot path.
        log.error('Failed to invoke backup-alert function', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
