// Receives Supabase Database Webhook payloads on feedback INSERT and posts
// a formatted embed to the Discord channel configured by the webhook URL.
//
// Required Supabase secrets:
//   - DISCORD_FEEDBACK_BOT_WEBHOOK_URL  Discord channel webhook URL
//   - WEBHOOK_SECRET                    shared secret matched against the
//                                       x-webhook-secret header on the request
//
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { sharedSecretMatches, trustedPublicObjectUrl } from '../_shared/security.ts';

interface FeedbackRecord {
    id: string;
    user_id: string;
    type: 'bug' | 'feature_request' | 'question' | 'other';
    summary: string;
    areas: string[];
    description: string;
    screenshot_url: string | null;
    desired_fix: string | null;
    os: string | null;
    mac_chip: string | null;
    app_version: string | null;
    ticket_number: number;
    created_at: string;
}

interface DbWebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    schema: string;
    record: FeedbackRecord;
}

const COLOR_BY_TYPE: Record<FeedbackRecord['type'], number> = {
    bug:             0xef4444, // red
    feature_request: 0x3b82f6, // blue
    question:        0xeab308, // yellow
    other:           0x6b7280, // grey
};

const TYPE_LABEL: Record<FeedbackRecord['type'], string> = {
    bug:             'Bug',
    feature_request: 'Feature Request',
    question:        'Question',
    other:           'Other',
};

const DISCORD_LIMITS = {
    TITLE:       256,
    DESCRIPTION: 4096,
    FIELD_VALUE: 1024,
} as const;

function truncate(value: string, max: number): string {
    return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

function formatTicketId(n: number): string {
    return `Feedback-${String(n).padStart(3, '0')}`;
}

Deno.serve(async (req) => {
    if (!(await sharedSecretMatches(req, 'x-webhook-secret', Deno.env.get('WEBHOOK_SECRET')))) {
        return new Response('forbidden', { status: 403 });
    }

    const discordUrl = Deno.env.get('DISCORD_FEEDBACK_BOT_WEBHOOK_URL');
    if (!discordUrl) {
        console.error('DISCORD_FEEDBACK_BOT_WEBHOOK_URL not set');
        return new Response('misconfigured', { status: 500 });
    }

    let payload: DbWebhookPayload;
    try {
        payload = await req.json() as DbWebhookPayload;
    } catch {
        return new Response('invalid json', { status: 400 });
    }

    if (payload.type !== 'INSERT' || payload.table !== 'feedback') {
        return new Response('ignored', { status: 200 });
    }

    const fb = payload.record;

    let email = '(unknown)';
    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data, error } = await supabase.auth.admin.getUserById(fb.user_id);
        if (error) {
            console.error('failed to fetch user email', error);
        } else if (data?.user?.email) {
            email = data.user.email;
        }
    } catch (err) {
        console.error('error fetching user', err);
    }

    const ticketId = formatTicketId(fb.ticket_number);
    const typeLabel = TYPE_LABEL[fb.type] ?? fb.type;
    const color = COLOR_BY_TYPE[fb.type] ?? COLOR_BY_TYPE.other;

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: 'Type',        value: typeLabel,             inline: true },
        { name: 'OS',          value: fb.os ?? '—',          inline: true },
        { name: 'App Version', value: fb.app_version ?? '—', inline: true },
    ];

    if (fb.mac_chip) {
        fields.push({ name: 'Mac Chip', value: fb.mac_chip, inline: true });
    }

    fields.push(
        { name: 'Areas', value: fb.areas.length ? fb.areas.join(', ') : '—', inline: false },
        { name: 'Email', value: email,                                       inline: true  },
        { name: 'User ID', value: '`' + fb.user_id + '`',                    inline: true  },
    );

    if (fb.desired_fix) {
        fields.push({
            name:   'Desired Fix',
            value:  truncate(fb.desired_fix, DISCORD_LIMITS.FIELD_VALUE),
            inline: false,
        });
    }

    // screenshot_url is client-written. Only link or embed it if it points at
    // our own feedback-screenshots bucket.
    const screenshotUrl = trustedPublicObjectUrl(fb.screenshot_url, 'feedback-screenshots');
    if (screenshotUrl) {
        fields.push({ name: 'Screenshot', value: screenshotUrl, inline: false });
    } else if (fb.screenshot_url) {
        console.warn('omitting untrusted screenshot_url', { id: fb.id });
        fields.push({ name: 'Screenshot', value: '(omitted: not a project storage URL)', inline: false });
    }

    const embed: Record<string, unknown> = {
        title:       truncate(`${ticketId} · ${fb.summary}`, DISCORD_LIMITS.TITLE),
        description: truncate(fb.description, DISCORD_LIMITS.DESCRIPTION),
        color,
        fields,
        timestamp:   fb.created_at,
        footer:      { text: `Row ID: ${fb.id}` },
    };
    if (screenshotUrl) {
        embed.image = { url: screenshotUrl };
    }

    const discordRes = await fetch(discordUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ embeds: [embed] }),
    });

    if (!discordRes.ok) {
        const body = await discordRes.text();
        console.error('discord webhook failed', discordRes.status, body);
        return new Response('discord failed', { status: 500 });
    }

    return new Response('ok', { status: 200 });
});
