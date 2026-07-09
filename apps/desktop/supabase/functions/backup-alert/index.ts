// Posts a Discord alert when a user's cloud backups have failed repeatedly.
// Invoked by the desktop main process (with the user's JWT) only after 3
// consecutive snapshot failures, so a single transient blip never pages anyone.
//
// Deployed WITH jwt verification (no --no-verify-jwt): the platform rejects
// unauthenticated callers, and we re-derive the user from the token rather than
// trusting the request body.
//
// Secrets (function env), first match wins for the webhook:
//   - DISCORD_BACKUP_ALERT_WEBHOOK_URL   dedicated channel (optional)
//   - DISCORD_FEEDBACK_BOT_WEBHOOK_URL   fallback (shared with feedback)
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

interface AlertBody {
    consecutive_failures?: number;
    last_error?: string;
    app_version?: string | null;
    platform?: string | null;
}

const DISCORD_LIMITS = { TITLE: 256, FIELD_VALUE: 1024 } as const;

function truncate(value: string, max: number): string {
    return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

Deno.serve(async (req) => {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return new Response('unauthorized', { status: 401 });

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Re-derive the caller from the token (don't trust a client-supplied id).
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
        return new Response('unauthorized', { status: 401 });
    }
    const user = userData.user;

    let body: AlertBody;
    try {
        body = await req.json() as AlertBody;
    } catch {
        return new Response('invalid json', { status: 400 });
    }

    const discordUrl =
        Deno.env.get('DISCORD_BACKUP_ALERT_WEBHOOK_URL') ??
        Deno.env.get('DISCORD_FEEDBACK_BOT_WEBHOOK_URL');
    if (!discordUrl) {
        console.error('No Discord webhook configured for backup alerts');
        return new Response('misconfigured', { status: 500 });
    }

    const failures = typeof body.consecutive_failures === 'number' ? body.consecutive_failures : 3;

    const embed = {
        title: truncate(`⚠️ Cloud backup failing — ${failures} consecutive failures`, DISCORD_LIMITS.TITLE),
        description: 'A user\'s automatic cloud backups have failed repeatedly. Their local SQLite data is still intact, but off-device backups are not being written.',
        color: 0xef4444,
        fields: [
            { name: 'Email', value: user.email ?? '(unknown)', inline: true },
            { name: 'User ID', value: '`' + user.id + '`', inline: true },
            { name: 'Failures', value: String(failures), inline: true },
            { name: 'App Version', value: body.app_version || '—', inline: true },
            { name: 'Platform', value: body.platform || '—', inline: true },
            { name: 'Last Error', value: truncate(body.last_error || '—', DISCORD_LIMITS.FIELD_VALUE), inline: false },
        ],
        timestamp: new Date().toISOString(),
    };

    const res = await fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error('discord webhook failed', res.status, text);
        return new Response('discord failed', { status: 500 });
    }

    return new Response('ok', { status: 200 });
});
