import { describe, it, expect } from 'vitest';
import { isAuthCallbackUrl, parseAuthCallback } from '../lib/deepLink';

describe('isAuthCallbackUrl', () => {
    it('accepts the auth callback with query or hash', () => {
        expect(isAuthCallbackUrl('sekel://auth/callback?code=abc')).toBe(true);
        expect(isAuthCallbackUrl('sekel://auth/callback#error=access_denied')).toBe(true);
        expect(isAuthCallbackUrl('sekel://auth/callback')).toBe(true);
    });

    it('rejects other hosts, paths, schemes and junk', () => {
        expect(isAuthCallbackUrl('sekel://x#access_token=a&refresh_token=b')).toBe(false);
        expect(isAuthCallbackUrl('sekel://auth/other?code=abc')).toBe(false);
        expect(isAuthCallbackUrl('sekel://evil/callback?code=abc')).toBe(false);
        expect(isAuthCallbackUrl('https://auth/callback?code=abc')).toBe(false);
        expect(isAuthCallbackUrl('--squirrel-firstrun')).toBe(false);
        expect(isAuthCallbackUrl(undefined)).toBe(false);
        expect(isAuthCallbackUrl(42)).toBe(false);
        expect(isAuthCallbackUrl('sekel://auth/callback?code=' + 'a'.repeat(5000))).toBe(false);
    });
});

describe('parseAuthCallback', () => {
    it('extracts a PKCE code', () => {
        expect(parseAuthCallback('sekel://auth/callback?code=3f2c-uuid')).toEqual({ kind: 'code', code: '3f2c-uuid' });
    });

    it('refuses implicit-flow tokens (session injection)', () => {
        const r = parseAuthCallback('sekel://auth/callback#access_token=ATTACKER&refresh_token=ATTACKER&type=recovery');
        expect(r.kind).toBe('ignored');
    });

    it('refuses tokens even alongside nothing else on a foreign host', () => {
        expect(parseAuthCallback('sekel://x#access_token=a&refresh_token=b').kind).toBe('ignored');
    });

    it('surfaces Supabase errors from query or hash', () => {
        expect(parseAuthCallback('sekel://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'))
            .toEqual({ kind: 'error', code: 'otp_expired', description: 'Email link is invalid' });
        expect(parseAuthCallback('sekel://auth/callback#error=access_denied&error_description=nope'))
            .toEqual({ kind: 'error', code: 'access_denied', description: 'nope' });
    });

    it('ignores callbacks with nothing usable', () => {
        expect(parseAuthCallback('sekel://auth/callback').kind).toBe('ignored');
    });
});
