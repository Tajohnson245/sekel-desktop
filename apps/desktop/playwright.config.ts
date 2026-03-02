import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    // Fail the build on CI if you accidentally left test.only in the source code.
    forbidOnly: !!process.env.CI,
    // Retry on CI only.
    retries: process.env.CI ? 8 : 0,
    // Opt out of parallel tests on CI.
    workers: process.env.CI ? 8 : undefined,
    // Reporter to use. CI: blob (can be merged later) or html. Local: html.
    reporter: 'html',

    // global timeout
    timeout: 30 * 1000,
    expect: {
        // Maximum time expect() should wait for the condition to be met.
        timeout: 5000,
    },

    use: {
        // Base URL to use in actions like `await page.goto('/')`.
        baseURL: 'http://localhost:5173',

        // Collect trace when retrying the failed test.
        trace: 'on-first-retry',

        // Capture screenshot after each test failure.
        screenshot: 'only-on-failure',

        // Keep video only on failure.
        video: 'retain-on-failure',

        // deterministic options
        timezoneId: 'UTC',
        locale: 'en-US',
        viewport: { width: 1280, height: 720 },

        actionTimeout: 10 * 1000,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: 'npm run dev:renderer',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
