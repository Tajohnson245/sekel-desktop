// Receives Supabase Database Webhook payloads on feedback INSERT and sends a
// confirmation email via Resend using the "feedback-submission" template
// (managed in the Resend dashboard — not in this repo).
//
// Required Supabase secrets:
//   - RESEND_API_KEY            API key from https://resend.com/api-keys
//   - FEEDBACK_EMAIL_FROM       Verified sender, e.g. "Sekel <support@sekel.io>"
//   - WEBHOOK_SECRET            Shared secret matched against the
//                               x-webhook-secret header (same value as the
//                               feedback-discord function uses).
//
// Optional Supabase secret:
//   - FEEDBACK_EMAIL_TEMPLATE_ID   Override the default template ID, useful
//                                  for staging. Defaults to "feedback-submission".
//
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Set via:
//   supabase secrets set RESEND_API_KEY=re_xxx \
//     FEEDBACK_EMAIL_FROM='Sekel <support@sekel.io>' \
//     --project-ref uawkoueqectmkiyjcrtb
//
// Database Webhook setup (one-time, Supabase dashboard → Database → Webhooks):
//   - Table:    public.feedback
//   - Events:   Insert
//   - Method:   POST
//   - URL:      https://<project>.supabase.co/functions/v1/feedback-email
//   - Headers:  x-webhook-secret: <WEBHOOK_SECRET value>
//
// Template variables expected by the "feedback-submission" Resend template
// (see VARIABLE_NAMES note in code — these MUST match the names defined
// inside the Resend dashboard template, including case).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

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

const TYPE_LABEL: Record<FeedbackRecord['type'], string> = {
    bug:             'Bug',
    feature_request: 'Feature Request',
    question:        'Question',
    other:           'Other',
};

function formatTicketId(n: number): string {
    return `Feedback-${String(n).padStart(3, '0')}`;
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', {
        month:    'long',
        day:      'numeric',
        year:     'numeric',
        timeZone: 'UTC',
    });
    const time = d.toLocaleTimeString('en-US', {
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
        timeZone: 'UTC',
    });
    return `${date} · ${time} UTC`;
}

// Used when building the optional-row HTML below — those rows are injected
// into the Resend template via triple-brace ({{{...}}}) raw-HTML variables,
// so user content inside them must be escaped here (Resend won't escape
// triple-brace values).
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    const incomingSecret = req.headers.get('x-webhook-secret');
    if (!expectedSecret || incomingSecret !== expectedSecret) {
        return new Response('forbidden', { status: 403 });
    }

    const resendKey  = Deno.env.get('RESEND_API_KEY');
    const fromAddr   = Deno.env.get('FEEDBACK_EMAIL_FROM');
    const templateId = Deno.env.get('FEEDBACK_EMAIL_TEMPLATE_ID') ?? 'feedback-submission';
    if (!resendKey || !fromAddr) {
        console.error('RESEND_API_KEY or FEEDBACK_EMAIL_FROM not set');
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

    let email: string | null = null;
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

    // User missing or deleted between insert and webhook firing — skip rather
    // than retry. Discord notification still fired, so the team is aware.
    if (!email) {
        console.error('no email found for user', fb.user_id, '— skipping send');
        return new Response('no recipient', { status: 200 });
    }

    // Resend's template engine has no conditional syntax, so optional rows
    // (desired_fix, screenshot_url) are pre-rendered here as complete
    // <div class="receipt-row"> blocks and injected via triple-brace
    // ({{{desiredFixRow}}}, {{{screenshotRow}}}) raw-HTML variables. When
    // the corresponding field is null, the variable is an empty string and
    // the row vanishes cleanly. CSS classes referenced below are defined
    // in the Resend dashboard template's <style> block.
    const desiredFixRow = fb.desired_fix
        ? `<div class="receipt-row">
            <span class="receipt-row-label">Desired Fix</span>
            <span class="receipt-row-value">
              <span class="message-block">${escapeHtml(fb.desired_fix)}</span>
            </span>
          </div>`
        : '';

    const screenshotRow = fb.screenshot_url
        ? `<div class="receipt-row">
            <span class="receipt-row-label">Screenshot</span>
            <span class="receipt-row-value">
              <a href="${escapeHtml(fb.screenshot_url)}" class="screenshot-link">View screenshot &rarr;</a>
            </span>
          </div>`
        : '';

    // VARIABLE_NAMES: these keys MUST match the variable names defined in
    // the "feedback-submission" template in the Resend dashboard. Required
    // values use {{var}} (double-brace, auto-escaped). The two *Row keys
    // must use {{{var}}} (triple-brace, raw HTML) since they contain markup.
    const variables: Record<string, string> = {
        submissionId:   formatTicketId(fb.ticket_number),
        submittedAt:    formatTimestamp(fb.created_at),
        feedbackType:   TYPE_LABEL[fb.type] ?? fb.type,
        summary:        fb.summary,
        areas:          fb.areas.join(', '),
        description:    fb.description,
        desiredFixRow,
        screenshotRow,
        os:             fb.os ?? 'Unknown',
        appVersion:     fb.app_version ?? '?',
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify({
            from: fromAddr,
            to:   [email],
            template: {
                id: templateId,
                variables,
            },
        }),
    });

    if (!resendRes.ok) {
        const errBody = await resendRes.text();
        console.error('resend send failed', resendRes.status, errBody);
        return new Response('resend failed', { status: 500 });
    }

    return new Response('ok', { status: 200 });
});
