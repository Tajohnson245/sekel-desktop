import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,

    // CRITICAL: Must be 1 for Electron — multiple Electron windows on the
    // same display server will fail. Do not increase this.
    workers: 1,
    fullyParallel: false,

    forbidOnly: !!process.env.CI,

    // Fewer retries than the original browser config — 2 is sufficient.
    retries: process.env.CI ? 2 : 0,

    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
    ],

    use: {
        // Videos kept only on failure — useful for debugging CI without storing everything.
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
        actionTimeout: 15_000,
    },

    // No webServer or projects block — Electron tests launch the app
    // directly via _electron.launch() in e2e/fixtures.ts.
    //
    // IMPORTANT: The app must be pre-built before running E2E tests.
    // Run `npx turbo run build --filter=@sekel/desktop` first to ensure
    // .vite/build/main.js exists.
});
