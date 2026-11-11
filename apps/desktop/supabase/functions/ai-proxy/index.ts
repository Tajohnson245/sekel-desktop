// Forwards OpenAI chat-completion requests from the desktop app, using the
// server's OPENAI_API_KEY so no OpenAI key ships inside the installer.
//
// The desktop main process points the OpenAI SDK at this function
// (src/main/ai/openaiClient.ts), so the URL it calls is
//   POST {SUPABASE_URL}/functions/v1/ai-proxy/chat/completions
// with the signed-in user's access token as the Bearer token.
//
// Auth: deployed WITH JWT verification (no --no-verify-jwt), so the platform
// rejects unsigned or expired tokens before this code runs. The caller is
// then identified from the token via auth.getUser(), never from the body.
//
// Limits (see _shared/aiPolicy.ts and the ai_usage_daily migration):
//   * only the request shapes the app uses: allowed models, text and inline
//     images, no streaming / tools / audio, n = 1, capped output tokens;
//   * a per-user daily allowance of requests and tokens, counted in
//     public.ai_usage_daily. Over the limit → 429 with x-should-retry: false,
//     which tells the OpenAI SDK not to retry.
//
// Secrets:
//   - OPENAI_API_KEY                    required
//   - AI_DAILY_REQUEST_LIMIT            optional, default 4000
//   - AI_DAILY_TOKEN_LIMIT              optional, default 8,000,000
//   - AI_MAX_OUTPUT_TOKENS              optional, default 16,384
//   - AI_ALLOWED_MODELS                 optional, comma-separated
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import {
    MAX_BODY_BYTES,
    dailyLimitsFromEnv,
    policyFromEnv,
    usageFromResponse,
    validateChatRequest,
} from '../_shared/aiPolicy.ts';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const UPSTREAM_TIMEOUT_MS = 120_000;

// Response headers from OpenAI worth passing back: the SDK uses the retry and
// rate-limit headers to back off correctly on 429s.
const PASS_THROUGH_HEADERS = ['retry-after', 'retry-after-ms', 'x-request-id', 'openai-processing-ms'];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (name: string) => Deno.env.get(name);
const policy = policyFromEnv(env);
const limits = dailyLimitsFromEnv(env);

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

/** An error in the OpenAI error shape, so the SDK surfaces `message`. */
function errorResponse(status: number, code: string, message: string, retry = false): Response {
    return new Response(
        JSON.stringify({ error: { message, type: 'sekel_ai_proxy', code } }),
        {
            status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'x-should-retry': retry ? 'true' : 'false',
            },
        },
    );
}

async function readBody(req: Request): Promise<string | null> {
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return null;
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) return null;
    return new TextDecoder().decode(buf);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST.');

    if (!new URL(req.url).pathname.endsWith('/chat/completions')) {
        return errorResponse(404, 'not_found', 'Only /chat/completions is available.');
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        console.error('OPENAI_API_KEY is not set');
        return errorResponse(503, 'not_configured', 'AI features are not configured on the server.');
    }

    // 1. Who is calling.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return errorResponse(401, 'unauthorized', 'Sign in to use AI features.');
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user) return errorResponse(401, 'unauthorized', 'Sign in to use AI features.');
    if (user.is_anonymous) return errorResponse(403, 'forbidden', 'Sign in with an account to use AI features.');

    // 2. What they're asking for.
    const raw = await readBody(req);
    if (raw === null) return errorResponse(413, 'too_large', 'Request is too large.');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return errorResponse(400, 'invalid_json', 'Request body is not valid JSON.');
    }
    const check = validateChatRequest(parsed, policy);
    if (!check.ok) return errorResponse(check.status, 'invalid_request', check.message);

    // 3. Count it against today's allowance. Fail closed if the counter is down.
    const { data: quota, error: quotaErr } = await admin.rpc('ai_usage_try_consume', {
        p_user_id: user.id,
        p_max_requests: limits.requests,
        p_max_tokens: limits.tokens,
    });
    if (quotaErr) {
        console.error('ai_usage_try_consume failed', { userId: user.id, error: quotaErr.message });
        return errorResponse(503, 'quota_unavailable', 'AI usage tracking is unavailable. Try again shortly.', true);
    }
    const row = Array.isArray(quota) ? quota[0] : quota;
    if (!row?.allowed) {
        console.warn('daily AI limit reached', { userId: user.id, requests: row?.request_count, tokens: row?.total_tokens });
        return errorResponse(429, 'daily_limit_reached', "You've reached today's AI limit. It resets at midnight UTC.");
    }

    // 4. Forward to OpenAI.
    let upstream: Response;
    try {
        upstream = await fetch(OPENAI_CHAT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(check.body),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
    } catch (err) {
        const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
        console.error('OpenAI request failed', { userId: user.id, timedOut, error: String(err) });
        return timedOut
            ? errorResponse(504, 'upstream_timeout', 'The AI service took too long to respond.', true)
            : errorResponse(502, 'upstream_unreachable', 'Could not reach the AI service.', true);
    }
    const text = await upstream.text();

    // Our key was rejected. Don't pass OpenAI's message (it describes our
    // account) back to the user, and don't let the SDK retry.
    if (upstream.status === 401 || upstream.status === 403) {
        console.error('OpenAI rejected the server key', { status: upstream.status, body: text.slice(0, 500) });
        return errorResponse(502, 'upstream_auth', 'The AI service is unavailable right now.');
    }

    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* non-JSON upstream error; pass it through */ }

    if (upstream.ok) {
        const usage = usageFromResponse(body);
        if (usage) {
            const { error: recErr } = await admin.rpc('ai_usage_record', {
                p_user_id: user.id,
                p_prompt_tokens: usage.prompt,
                p_completion_tokens: usage.completion,
            });
            if (recErr) console.error('ai_usage_record failed', { userId: user.id, error: recErr.message });
        }
        console.log('ai-proxy ok', {
            userId: user.id,
            model: check.body.model,
            promptTokens: usage?.prompt,
            completionTokens: usage?.completion,
        });
    } else {
        console.warn('OpenAI error', { userId: user.id, status: upstream.status, body: text.slice(0, 500) });
    }

    const headers: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    };
    for (const name of PASS_THROUGH_HEADERS) {
        const v = upstream.headers.get(name);
        if (v !== null) headers[name] = v;
    }
    upstream.headers.forEach((v, name) => {
        if (name.startsWith('x-ratelimit-')) headers[name] = v;
    });
    // Out of OpenAI credit (our spend limit): retrying won't help.
    const code = (body as { error?: { code?: string } } | null)?.error?.code;
    if (upstream.status === 429 && code === 'insufficient_quota') headers['x-should-retry'] = 'false';

    return new Response(text, { status: upstream.status, headers });
});
