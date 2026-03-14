import { test, expect } from './fixtures';

/**
 * Smoke tests: verify the app launches and presents its main UI.
 *
 * These tests intentionally test nothing more than the happy-path boot
 * sequence. They catch crashes, white-screen failures, and broken builds
 * before any feature-level E2E tests run.
 */

test('app launches without crashing', async ({ app }) => {
    const windows = app.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);
});

test('main window is visible', async ({ window }) => {
    await expect(window).toHaveTitle(/.+/); // any non-empty title
    expect(await window.isVisible('body')).toBe(true);
});

test('window has expected dimensions', async ({ app }) => {
    const win = await app.firstWindow();
    const size = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return w.getSize();
    });
    expect(size[0]).toBeGreaterThan(400);
    expect(size[1]).toBeGreaterThan(300);
});
