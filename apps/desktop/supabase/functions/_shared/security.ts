// Small security helpers shared by the edge functions. Folders starting with
// `_` aren't deployed as functions; the CLI bundles this file into each
// function that imports it.

const encoder = new TextEncoder();

/**
 * Constant-time string comparison. Both inputs are hashed first, so the
 * comparison loop always runs over 32 bytes and doesn't leak how long the
 * secret is or where the first mismatch is.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
    const [ha, hb] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(a)),
        crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const va = new Uint8Array(ha);
    const vb = new Uint8Array(hb);
    let diff = 0;
    for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
    return diff === 0;
}

/**
 * True when `header` on the request matches the shared secret. Returns false
 * (fail closed) when the secret isn't configured or the header is missing.
 */
export async function sharedSecretMatches(
    req: Request,
    header: string,
    expected: string | undefined,
): Promise<boolean> {
    if (!expected) return false;
    const got = req.headers.get(header);
    if (got === null) return false;
    return await timingSafeEqual(got, expected);
}

/**
 * Returns the normalised URL if `raw` is a public-object URL in `bucket` on
 * this project's own Storage (derived from SUPABASE_URL). Otherwise returns
 * null. Use it before embedding or linking a URL that came from a
 * client-written row, so a user can't make our Discord or email notifications
 * point at an arbitrary site.
 */
export function trustedPublicObjectUrl(raw: string | null | undefined, bucket: string): string | null {
    if (!raw) return null;
    const base = Deno.env.get('SUPABASE_URL');
    if (!base) return null;
    let url: URL;
    let origin: string;
    try {
        url = new URL(raw);
        origin = new URL(base).origin;
    } catch {
        return null;
    }
    if (url.origin !== origin) return null;
    if (url.username || url.password) return null;
    // URL parsing has already resolved any `..` / `%2e%2e` segments.
    if (!url.pathname.startsWith(`/storage/v1/object/public/${bucket}/`)) return null;
    return url.href;
}
