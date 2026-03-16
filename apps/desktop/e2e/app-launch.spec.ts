import { test, expect } from './fixtures';

/**
 * Smoke tests: verify the app launches and presents its main UI.
 *
 * These tests intentionally test nothing more than the happy-path boot
 * sequence. They catch crashes, white-screen failures, and broken builds
 * before any feature-level E2E tests run.
 */

test('app launches without crashing', async ({ window }) => {
    // window fixture calls firstWindow(), which waits for BrowserWindow creation.
    // If we reach this line, the process launched and a window was created.
    expect(window).toBeTruthy();
});

test('main window is visible', async ({ window }) => {
    await expect(window).toHaveTitle(/.+/); // any non-empty title
    expect(await window.isVisible('body')).toBe(true);
});

test('window has expected dimensions', async ({ app }) => {
    const size = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return w.getSize();
    });
    expect(size[0]).toBeGreaterThan(400);
    expect(size[1]).toBeGreaterThan(300);
});
