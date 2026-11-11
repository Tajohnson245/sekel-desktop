// Request rules for the ai-proxy edge function.
//
// This file must stay free of Deno APIs and remote imports: the desktop test
// suite (vitest) imports it directly (src/__tests__/aiPolicy.test.ts).
//
// The proxy only forwards the parts of the OpenAI chat-completions API the
// desktop app uses (see src/ipc/ai.ts, classify.ts, document_parsing.ts):
// plain, non-streaming completions with text and inline image inputs. Anything
// else is refused, so a signed-in user can't use the server's OpenAI key for
// tools, audio, streaming, many-choice fan-out, or arbitrary models.

export interface AiPolicy {
    allowedModels: ReadonlySet<string>;
    /** Upper bound for max_tokens / max_completion_tokens, and the default when neither is sent. */
    maxOutputTokens: number;
    maxMessages: number;
}

export interface DailyLimits {
    requests: number;
    tokens: number;
}

export const DEFAULT_ALLOWED_MODELS = ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'] as const;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
export const DEFAULT_MAX_MESSAGES = 50;
export const DEFAULT_DAILY_REQUEST_LIMIT = 4_000;
export const DEFAULT_DAILY_TOKEN_LIMIT = 8_000_000;
/** Largest request body the proxy will read (inline images are base64). */
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

const ALLOWED_KEYS = new Set([
    'model',
    'messages',
    'response_format',
    'temperature',
    'top_p',
    'max_tokens',
    'max_completion_tokens',
    'seed',
    'n',
    'stop',
    'presence_penalty',
    'frequency_penalty',
]);

const ALLOWED_ROLES = new Set(['system', 'developer', 'user', 'assistant']);
const ALLOWED_MESSAGE_KEYS = new Set(['role', 'content', 'name']);
const ALLOWED_RESPONSE_FORMATS = new Set(['text', 'json_object']);
const ALLOWED_IMAGE_DETAIL = new Set(['auto', 'low', 'high']);

export type ValidationResult =
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; status: number; message: string };

type Env = (name: string) => string | undefined;

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function positiveInt(raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function policyFromEnv(env: Env): AiPolicy {
    const models = (env('AI_ALLOWED_MODELS') ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
    return {
        allowedModels: new Set(models.length > 0 ? models : DEFAULT_ALLOWED_MODELS),
        maxOutputTokens: positiveInt(env('AI_MAX_OUTPUT_TOKENS'), DEFAULT_MAX_OUTPUT_TOKENS),
        maxMessages: DEFAULT_MAX_MESSAGES,
    };
}

export function dailyLimitsFromEnv(env: Env): DailyLimits {
    return {
        requests: positiveInt(env('AI_DAILY_REQUEST_LIMIT'), DEFAULT_DAILY_REQUEST_LIMIT),
        tokens: positiveInt(env('AI_DAILY_TOKEN_LIMIT'), DEFAULT_DAILY_TOKEN_LIMIT),
    };
}

function fail(message: string, status = 400): ValidationResult {
    return { ok: false, status, message };
}

function checkNumber(
    body: Record<string, unknown>,
    key: string,
    min: number,
    max: number,
    integer = false,
): string | null {
    if (!(key in body)) return null;
    const v = body[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
        return `${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`;
    }
    return null;
}

function checkContentPart(part: unknown): string | null {
    if (!isPlainObject(part)) return 'content parts must be objects';
    if (part.type === 'text') {
        if (Object.keys(part).some((k) => k !== 'type' && k !== 'text')) return 'unsupported field in text part';
        return typeof part.text === 'string' ? null : 'text part needs a string `text`';
    }
    if (part.type === 'image_url') {
        if (Object.keys(part).some((k) => k !== 'type' && k !== 'image_url')) return 'unsupported field in image part';
        const img = part.image_url;
        if (!isPlainObject(img)) return 'image part needs an `image_url` object';
        if (Object.keys(img).some((k) => k !== 'url' && k !== 'detail')) return 'unsupported field in image_url';
        // Inline images only. The app always sends base64 data URLs; refusing
        // remote URLs keeps OpenAI from fetching arbitrary links for us.
        if (typeof img.url !== 'string' || !/^data:image\/(png|jpeg|gif|webp);base64,/.test(img.url)) {
            return 'image_url.url must be a base64 data URL (png, jpeg, gif or webp)';
        }
        if (img.detail !== undefined && !ALLOWED_IMAGE_DETAIL.has(img.detail as string)) {
            return 'image_url.detail must be auto, low or high';
        }
        return null;
    }
    return 'content parts must be of type text or image_url';
}

function checkMessage(msg: unknown): string | null {
    if (!isPlainObject(msg)) return 'each message must be an object';
    for (const k of Object.keys(msg)) {
        if (!ALLOWED_MESSAGE_KEYS.has(k)) return `unsupported message field: ${k}`;
    }
    if (typeof msg.role !== 'string' || !ALLOWED_ROLES.has(msg.role)) {
        return 'message role must be system, developer, user or assistant';
    }
    if (msg.name !== undefined && typeof msg.name !== 'string') return 'message name must be a string';
    const content = msg.content;
    if (typeof content === 'string') return null;
    if (Array.isArray(content) && content.length > 0) {
        if (msg.role !== 'user' && content.some((p) => isPlainObject(p) && p.type !== 'text')) {
            return 'only user messages may contain images';
        }
        for (const part of content) {
            const err = checkContentPart(part);
            if (err) return err;
        }
        return null;
    }
    return 'message content must be a string or a non-empty array of parts';
}

/**
 * Checks a chat-completions request body against the policy. On success
 * returns the body to forward: the same fields, plus max_completion_tokens set
 * to the policy cap when the caller sent no output limit.
 */
export function validateChatRequest(input: unknown, policy: AiPolicy): ValidationResult {
    if (!isPlainObject(input)) return fail('request body must be a JSON object');

    for (const k of Object.keys(input)) {
        if (!ALLOWED_KEYS.has(k)) return fail(`unsupported parameter: ${k}`);
    }

    if (typeof input.model !== 'string' || !policy.allowedModels.has(input.model)) {
        return fail(`model not allowed: ${String(input.model)}`);
    }

    const messages = input.messages;
    if (!Array.isArray(messages) || messages.length === 0) return fail('messages must be a non-empty array');
    if (messages.length > policy.maxMessages) return fail(`too many messages (max ${policy.maxMessages})`);
    for (const m of messages) {
        const err = checkMessage(m);
        if (err) return fail(err);
    }

    if (input.response_format !== undefined) {
        const rf = input.response_format;
        if (!isPlainObject(rf) || Object.keys(rf).some((k) => k !== 'type') || !ALLOWED_RESPONSE_FORMATS.has(rf.type as string)) {
            return fail('response_format must be { type: "text" } or { type: "json_object" }');
        }
    }

    if (input.n !== undefined && input.n !== 1) return fail('n must be 1');

    const numberErr =
        checkNumber(input, 'temperature', 0, 2) ??
        checkNumber(input, 'top_p', 0, 1) ??
        checkNumber(input, 'presence_penalty', -2, 2) ??
        checkNumber(input, 'frequency_penalty', -2, 2) ??
        checkNumber(input, 'seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true) ??
        checkNumber(input, 'max_tokens', 1, policy.maxOutputTokens, true) ??
        checkNumber(input, 'max_completion_tokens', 1, policy.maxOutputTokens, true);
    if (numberErr) return fail(numberErr);

    if (input.stop !== undefined) {
        const s = input.stop;
        const ok = typeof s === 'string' ||
            (Array.isArray(s) && s.length <= 4 && s.every((x) => typeof x === 'string'));
        if (!ok) return fail('stop must be a string or up to 4 strings');
    }

    const body: Record<string, unknown> = { ...input };
    if (body.max_tokens === undefined && body.max_completion_tokens === undefined) {
        body.max_completion_tokens = policy.maxOutputTokens;
    }
    return { ok: true, body };
}

/** Prompt / completion token counts from an OpenAI response body, if present. */
export function usageFromResponse(responseBody: unknown): { prompt: number; completion: number } | null {
    if (!isPlainObject(responseBody)) return null;
    const usage = responseBody.usage;
    if (!isPlainObject(usage)) return null;
    const prompt = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const completion = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
    return { prompt, completion };
}
