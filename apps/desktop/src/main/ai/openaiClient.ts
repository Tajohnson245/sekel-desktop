/**
 * OpenAI client for the main process.
 *
 * Requests go to the `ai-proxy` Supabase edge function, not to OpenAI. The
 * proxy holds the OpenAI key (a Supabase function secret), so no OpenAI key is
 * built into the app. Each request carries the signed-in user's access token,
 * which the proxy uses to identify the user and meter their daily allowance
 * (see supabase/functions/ai-proxy and supabase/functions/_shared/aiPolicy.ts).
 *
 * The access token is the one the renderer pushes to main on sign-in and on
 * every token refresh (authStore → cloudBackup.setSession → cloudState). It's
 * read fresh for every request, so long batches keep working across refreshes.
 */

import { OpenAI } from 'openai';
import { getSession } from '../backup/cloudState';

export const SIGN_IN_REQUIRED_MESSAGE = 'Sign in to use AI features.';

export class AiSignInRequiredError extends Error {
    constructor() {
        super(SIGN_IN_REQUIRED_MESSAGE);
        this.name = 'AiSignInRequiredError';
    }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ProxyFetchDeps {
    /** Current user access token, or null when signed out. */
    getAccessToken: () => string | null;
    /** Supabase anon / publishable key (public; sent as the `apikey` header). */
    anonKey: string;
    fetchImpl?: FetchLike;
}

export function aiProxyBaseUrl(projectUrl: string): string {
    return `${projectUrl.replace(/\/+$/, '')}/functions/v1/ai-proxy`;
}

/**
 * A 401 in the OpenAI error shape. Returned instead of throwing, because the
 * SDK treats a thrown fetch error as a connection failure and retries it.
 * `x-should-retry: false` stops the SDK retrying this one.
 */
function signedOutResponse(): Response {
    return new Response(
        JSON.stringify({ error: { message: SIGN_IN_REQUIRED_MESSAGE, type: 'sekel_ai_proxy', code: 'unauthorized' } }),
        { status: 401, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } },
    );
}

/**
 * fetch for the OpenAI SDK: replaces the SDK's placeholder Authorization
 * header with the user's current access token and adds the Supabase apikey.
 */
export function createProxyFetch(deps: ProxyFetchDeps): FetchLike {
    const doFetch: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));

    return async (input, init) => {
        const token = deps.getAccessToken();
        if (!token) return signedOutResponse();

        const send = (accessToken: string) => {
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${accessToken}`);
            headers.set('apikey', deps.anonKey);
            return doFetch(input, { ...init, headers });
        };

        const res = await send(token);
        // A request can race the hourly token refresh. If a newer token
        // arrived while this one was in flight, retry once with it.
        if (res.status === 401) {
            const fresh = deps.getAccessToken();
            if (fresh && fresh !== token) return send(fresh);
        }
        return res;
    };
}

/**
 * True for errors that every following request would hit too: signed out,
 * today's AI allowance used up, or AI not set up on the server. Batch loops
 * use it to stop early instead of failing each remaining item one by one.
 */
export function isBatchStoppingAiError(err: unknown): boolean {
    if (err instanceof AiSignInRequiredError) return true;
    if (typeof err !== 'object' || err === null) return false;
    const { status, code } = err as { status?: unknown; code?: unknown };
    if (status === 401) return true;
    if (status === 429 && code === 'daily_limit_reached') return true;
    return code === 'not_configured' || code === 'upstream_auth' || code === 'insufficient_quota';
}

function currentAccessToken(): string | null {
    return getSession()?.accessToken ?? null;
}

/** Throws AiSignInRequiredError when no user is signed in. */
export function requireAiSession(): void {
    if (!currentAccessToken()) throw new AiSignInRequiredError();
}

/** An OpenAI SDK client that talks to the ai-proxy edge function. */
export function createProxiedOpenAI(options: { maxRetries?: number; timeout?: number } = {}): OpenAI {
    const projectUrl = process.env.VITE_SUPABASE_PROJECT_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!projectUrl || !anonKey) {
        throw new Error('AI features need VITE_SUPABASE_PROJECT_URL and VITE_SUPABASE_ANON_KEY at build time.');
    }
    return new OpenAI({
        // Placeholder: the SDK requires a key, but createProxyFetch replaces
        // the Authorization header with the user's token on every request.
        apiKey: 'sekel-ai-proxy',
        baseURL: aiProxyBaseUrl(projectUrl),
        fetch: createProxyFetch({ getAccessToken: currentAccessToken, anonKey }),
        ...options,
    });
}
