import { describe, it, expect, vi } from 'vitest';
import { OpenAI } from 'openai';

// openaiClient reads the session from cloudState, which pulls in
// electron-store. Only the pure helpers are under test here.
vi.mock('../main/backup/cloudState', () => ({ getSession: () => null }));

import {
    AiSignInRequiredError,
    SIGN_IN_REQUIRED_MESSAGE,
    aiProxyBaseUrl,
    createProxyFetch,
    isBatchStoppingAiError,
} from '../main/ai/openaiClient';

const BASE = 'https://proj.supabase.co/functions/v1/ai-proxy';

function okCompletion() {
    return new Response(JSON.stringify({
        id: 'c1',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-4.1-mini',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function proxyError(status: number, code: string, retry: boolean) {
    return new Response(
        JSON.stringify({ error: { message: `proxy says ${code}`, type: 'sekel_ai_proxy', code } }),
        { status, headers: { 'content-type': 'application/json', 'x-should-retry': retry ? 'true' : 'false' } },
    );
}

type Call = { url: string; headers: Headers; body: string };

function fakeFetch(responses: Array<() => Response>) {
    const calls: Call[] = [];
    const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers), body: String(init?.body ?? '') });
        const next = responses.shift();
        if (!next) throw new Error('unexpected extra request');
        return next();
    });
    return { impl, calls };
}

function client(getAccessToken: () => string | null, responses: Array<() => Response>) {
    const { impl, calls } = fakeFetch(responses);
    const openai = new OpenAI({
        apiKey: 'sekel-ai-proxy',
        baseURL: BASE,
        maxRetries: 2,
        fetch: createProxyFetch({ getAccessToken, anonKey: 'anon-key', fetchImpl: impl }),
    });
    return { openai, calls };
}

const request = {
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user' as const, content: 'hi' }],
    response_format: { type: 'json_object' as const },
};

describe('aiProxyBaseUrl', () => {
    it('appends the function path once', () => {
        expect(aiProxyBaseUrl('https://proj.supabase.co')).toBe(BASE);
        expect(aiProxyBaseUrl('https://proj.supabase.co/')).toBe(BASE);
    });
});

describe('OpenAI SDK through createProxyFetch', () => {
    it('calls the proxy with the user token, not the placeholder key', async () => {
        const { openai, calls } = client(() => 'user-jwt', [okCompletion]);
        const res = await openai.chat.completions.create(request);

        expect(res.choices[0].message.content).toBe('{"ok":true}');
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${BASE}/chat/completions`);
        expect(calls[0].headers.get('authorization')).toBe('Bearer user-jwt');
        expect(calls[0].headers.get('apikey')).toBe('anon-key');
        expect(JSON.parse(calls[0].body).model).toBe('gpt-4.1-mini');
    });

    it('fails without a network call when signed out, and does not retry', async () => {
        const { openai, calls } = client(() => null, []);
        const err = await openai.chat.completions.create(request).catch((e: unknown) => e);

        expect(calls).toHaveLength(0);
        expect(err).toBeInstanceOf(OpenAI.AuthenticationError);
        expect((err as Error).message).toContain(SIGN_IN_REQUIRED_MESSAGE);
        expect(isBatchStoppingAiError(err)).toBe(true);
    });

    it('does not retry when the daily limit is reached', async () => {
        const { openai, calls } = client(() => 'user-jwt', [
            () => proxyError(429, 'daily_limit_reached', false),
            okCompletion,
        ]);
        const err = await openai.chat.completions.create(request).catch((e: unknown) => e);

        expect(calls).toHaveLength(1);
        expect(err).toBeInstanceOf(OpenAI.RateLimitError);
        expect((err as { code?: string }).code).toBe('daily_limit_reached');
        expect(isBatchStoppingAiError(err)).toBe(true);
    });

    it('still retries OpenAI rate limits the proxy passes through', async () => {
        const { openai, calls } = client(() => 'user-jwt', [
            () => new Response(
                JSON.stringify({ error: { message: 'Rate limit', type: 'requests', code: 'rate_limit_exceeded' } }),
                { status: 429, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } },
            ),
            okCompletion,
        ]);
        const res = await openai.chat.completions.create(request);

        expect(res.choices).toHaveLength(1);
        expect(calls).toHaveLength(2);
    });

    it('retries once with a newer token after a 401', async () => {
        let token = 'old-jwt';
        const { openai, calls } = client(() => token, [
            () => { token = 'new-jwt'; return new Response('{"msg":"Invalid JWT"}', { status: 401 }); },
            okCompletion,
        ]);
        await openai.chat.completions.create(request);

        expect(calls.map((c) => c.headers.get('authorization'))).toEqual(['Bearer old-jwt', 'Bearer new-jwt']);
    });

    it('does not loop on a 401 when the token has not changed', async () => {
        const { openai, calls } = client(() => 'same-jwt', [
            () => new Response('{"msg":"Invalid JWT"}', { status: 401, headers: { 'x-should-retry': 'false' } }),
        ]);
        const err = await openai.chat.completions.create(request).catch((e: unknown) => e);

        expect(calls).toHaveLength(1);
        expect(isBatchStoppingAiError(err)).toBe(true);
    });
});

describe('isBatchStoppingAiError', () => {
    it('is false for ordinary failures', () => {
        expect(isBatchStoppingAiError(new Error('JSON parse failed'))).toBe(false);
        expect(isBatchStoppingAiError({ status: 429, code: 'rate_limit_exceeded' })).toBe(false);
        expect(isBatchStoppingAiError({ status: 500 })).toBe(false);
        expect(isBatchStoppingAiError(null)).toBe(false);
    });

    it('is true for sign-in and server-configuration failures', () => {
        expect(isBatchStoppingAiError(new AiSignInRequiredError())).toBe(true);
        expect(isBatchStoppingAiError({ status: 503, code: 'not_configured' })).toBe(true);
        expect(isBatchStoppingAiError({ status: 502, code: 'upstream_auth' })).toBe(true);
        expect(isBatchStoppingAiError({ status: 429, code: 'insufficient_quota' })).toBe(true);
    });
});
