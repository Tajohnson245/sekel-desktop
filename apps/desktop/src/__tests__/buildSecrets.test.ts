import { describe, it, expect, afterEach } from 'vitest';
import config from '../../electron.vite.config';

// Everything in a define: block is readable inside the shipped installer.
// Server-only keys must never get there, even when they are present in the
// build environment (a developer's .env file or an old CI secret).

const SERVER_ONLY = {
    OPENAI_API_KEY: 'sk-test-must-not-ship',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-must-not-ship',
    ADMIN_EMAIL: 'admin-email-must-not-ship@example.com',
};

const saved = { ...process.env };

afterEach(() => {
    process.env = { ...saved };
});

type Resolved = {
    main?: { define?: Record<string, unknown> };
    preload?: { define?: Record<string, unknown> };
    renderer?: { define?: Record<string, unknown> };
};

async function resolve(): Promise<Resolved> {
    const fn = config as unknown as (env: { mode: string; command: string }) => Resolved | Promise<Resolved>;
    return await fn({ mode: 'build-secrets-test', command: 'build' });
}

describe('electron-vite build config', () => {
    it('never inlines server-only secrets', async () => {
        Object.assign(process.env, SERVER_ONLY, { VITE_SUPABASE_PROJECT_URL: 'https://example.supabase.co' });

        const resolved = await resolve();
        const defines = JSON.stringify([resolved.main?.define, resolved.preload?.define, resolved.renderer?.define]);

        for (const value of Object.values(SERVER_ONLY)) {
            expect(defines.includes(value), `define block contains ${value}`).toBe(false);
        }
        for (const name of Object.keys(SERVER_ONLY)) {
            expect(defines.includes(`process.env.${name}`), `define block mentions ${name}`).toBe(false);
        }
        // Sanity check that the public value does still get inlined.
        expect(defines).toContain('https://example.supabase.co');
    });
});
