import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'path';

/**
 * Shared Electron test fixtures.
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *
 * The `app` fixture launches and closes the Electron process around each test.
 * The `window` fixture gives you the first BrowserWindow, ready to interact with.
 *
 * PREREQUISITE: Run `npm run build` (or `npx turbo run build --filter=@sekel/desktop`)
 * before running E2E tests so that `.vite/build/main.js` exists.
 */

type Fixtures = {
    app: ElectronApplication;
    window: Page;
};

export const test = base.extend<Fixtures>({
    // eslint-disable-next-line no-empty-pattern
    app: async ({}, use) => {
        const mainJsPath = join(__dirname, '../.vite/build/main.js');

        const app = await electron.launch({
            args: [
                // GitHub Actions runners don't have the SUID sandbox configured.
                // --no-sandbox is required for Electron to launch on Linux CI.
                ...(process.env.CI ? ['--no-sandbox'] : []),
                mainJsPath,
            ],
            env: {
                ...process.env,
                NODE_ENV: 'test',
            },
        });

        await use(app);
        await app.close();
    },

    window: async ({ app }, use) => {
        const win = await app.firstWindow();
        await win.waitForLoadState('domcontentloaded');
        await use(win);
    },
});

export { expect };
