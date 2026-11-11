import { describe, it, expect } from 'vitest';
import {
    DEFAULT_DAILY_REQUEST_LIMIT,
    DEFAULT_DAILY_TOKEN_LIMIT,
    DEFAULT_MAX_OUTPUT_TOKENS,
    dailyLimitsFromEnv,
    policyFromEnv,
    usageFromResponse,
    validateChatRequest,
} from '../../supabase/functions/_shared/aiPolicy';

const policy = policyFromEnv(() => undefined);

function req(overrides: Record<string, unknown> = {}) {
    return {
        model: 'gpt-4.1-mini',
        messages: [
            { role: 'system', content: 'You are a classifier.' },
            { role: 'user', content: 'Card Front: x' },
        ],
        response_format: { type: 'json_object' },
        ...overrides,
    };
}

function expectRejected(input: unknown, fragment: string) {
    const r = validateChatRequest(input, policy);
    expect(r.ok).toBe(false);
    if (!r.ok) {
        expect(r.status).toBe(400);
        expect(r.message).toContain(fragment);
    }
}

describe('validateChatRequest — shapes the app sends', () => {
    it('accepts the classify / generation request and adds an output cap', () => {
        const r = validateChatRequest(req(), policy);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.body.model).toBe('gpt-4.1-mini');
            expect(r.body.max_completion_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
            expect(r.body.response_format).toEqual({ type: 'json_object' });
        }
    });

    it('keeps an explicit max_tokens and does not add max_completion_tokens', () => {
        const r = validateChatRequest(req({ max_tokens: 4000 }), policy);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.body.max_tokens).toBe(4000);
            expect(r.body.max_completion_tokens).toBeUndefined();
        }
    });

    it('accepts the image-parsing request (gpt-4o, inline base64 image)', () => {
        const r = validateChatRequest({
            model: 'gpt-4o',
            max_tokens: 4000,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Please extract all text' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'high' } },
                ],
            }],
        }, policy);
        expect(r.ok).toBe(true);
    });

    it('accepts the eval model', () => {
        expect(validateChatRequest(req({ model: 'gpt-4o-mini' }), policy).ok).toBe(true);
    });
});

describe('validateChatRequest — refusals', () => {
    it('refuses non-object bodies', () => {
        expectRejected(null, 'JSON object');
        expectRejected([], 'JSON object');
        expectRejected('hi', 'JSON object');
    });

    it('refuses models outside the allowlist', () => {
        expectRejected(req({ model: 'gpt-4.5-preview' }), 'model not allowed');
        expectRejected(req({ model: undefined }), 'model not allowed');
    });

    it('refuses streaming, tools, audio and other unused parameters', () => {
        expectRejected(req({ stream: true }), 'unsupported parameter: stream');
        expectRejected(req({ tools: [] }), 'unsupported parameter: tools');
        expectRejected(req({ modalities: ['audio'] }), 'unsupported parameter: modalities');
        expectRejected(req({ logit_bias: {} }), 'unsupported parameter: logit_bias');
    });

    it('refuses n > 1', () => {
        expectRejected(req({ n: 8 }), 'n must be 1');
    });

    it('refuses output limits above the cap', () => {
        expectRejected(req({ max_tokens: DEFAULT_MAX_OUTPUT_TOKENS + 1 }), 'max_tokens');
        expectRejected(req({ max_completion_tokens: 100_000 }), 'max_completion_tokens');
        expectRejected(req({ max_tokens: 0 }), 'max_tokens');
        expectRejected(req({ max_tokens: 1.5 }), 'max_tokens');
    });

    it('refuses remote image URLs and non-image data URLs', () => {
        const withImage = (url: string) => req({
            messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }],
        });
        expectRejected(withImage('https://example.com/a.png'), 'base64 data URL');
        expectRejected(withImage('data:text/html;base64,PGgxPg=='), 'base64 data URL');
    });

    it('refuses images outside user messages', () => {
        expectRejected(req({
            messages: [{ role: 'system', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }],
        }), 'only user messages');
    });

    it('refuses tool messages and extra message fields', () => {
        expectRejected(req({ messages: [{ role: 'tool', content: 'x', tool_call_id: '1' }] }), 'unsupported message field');
        expectRejected(req({ messages: [{ role: 'tool', content: 'x' }] }), 'message role');
        expectRejected(req({ messages: [{ role: 'assistant', content: 'x', tool_calls: [] }] }), 'unsupported message field');
    });

    it('refuses empty or oversized message lists', () => {
        expectRejected(req({ messages: [] }), 'non-empty');
        const many = Array.from({ length: 51 }, () => ({ role: 'user', content: 'x' }));
        expectRejected(req({ messages: many }), 'too many messages');
    });

    it('refuses json_schema and unknown response formats', () => {
        expectRejected(req({ response_format: { type: 'json_schema', json_schema: {} } }), 'response_format');
    });

    it('refuses out-of-range sampling values', () => {
        expectRejected(req({ temperature: 3 }), 'temperature');
        expectRejected(req({ top_p: -1 }), 'top_p');
        expectRejected(req({ stop: ['a', 'b', 'c', 'd', 'e'] }), 'stop');
    });
});

describe('policy and limits from env', () => {
    it('uses defaults when unset or invalid', () => {
        expect(dailyLimitsFromEnv(() => undefined)).toEqual({
            requests: DEFAULT_DAILY_REQUEST_LIMIT,
            tokens: DEFAULT_DAILY_TOKEN_LIMIT,
        });
        const bad = dailyLimitsFromEnv((k) => (k === 'AI_DAILY_REQUEST_LIMIT' ? '-5' : 'lots'));
        expect(bad).toEqual({ requests: DEFAULT_DAILY_REQUEST_LIMIT, tokens: DEFAULT_DAILY_TOKEN_LIMIT });
    });

    it('reads overrides', () => {
        const env: Record<string, string> = {
            AI_DAILY_REQUEST_LIMIT: '100',
            AI_DAILY_TOKEN_LIMIT: '50000',
            AI_MAX_OUTPUT_TOKENS: '2048',
            AI_ALLOWED_MODELS: ' gpt-4.1-mini , gpt-4.1 ',
        };
        expect(dailyLimitsFromEnv((k) => env[k])).toEqual({ requests: 100, tokens: 50_000 });
        const p = policyFromEnv((k) => env[k]);
        expect([...p.allowedModels]).toEqual(['gpt-4.1-mini', 'gpt-4.1']);
        expect(p.maxOutputTokens).toBe(2048);
        expect(validateChatRequest(req({ model: 'gpt-4o' }), p).ok).toBe(false);
    });
});

describe('usageFromResponse', () => {
    it('reads token counts', () => {
        expect(usageFromResponse({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }))
            .toEqual({ prompt: 10, completion: 5 });
    });

    it('returns null without usage', () => {
        expect(usageFromResponse({})).toBeNull();
        expect(usageFromResponse(null)).toBeNull();
    });
});
