import { test, expect, Page } from '@playwright/test';
import { mockSupabaseAPI } from './helpers/mock-supabase';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Navigate to the app and wait for the sidebar to be ready. */
async function loadDashboard(page: Page) {
    await page.goto('/');
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 15000 });
    // Make sure we are on the dashboard view
    await page.getByTestId('nav-dashboard').click();
}

/**
 * Set up Supabase mocks to return pre-defined stat data.
 *
 * - 3 due cards (1 new, 1 learning, 1 review-due)
 * - 10 reviews in the last 30 days, 8 of them non-Again  → 80% retention
 * - 5 consecutive days of reviews ending today           → streak of 5
 */
async function mockSupabaseWithStats(page: Page) {
    const today = new Date();
    const buildDateStr = (daysAgo: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString();
    };

    // 5 consecutive days of review history (today, -1, -2, -3, -4)
    const reviewTimes = [0, 1, 2, 3, 4].map((d) => ({ review_time: buildDateStr(d) }));

    // 10 reviews: 8 'good', 2 'again'  →  80% retention
    const ratingRows = [
        ...Array(8).fill({ rating: 'good' }),
        ...Array(2).fill({ rating: 'again' }),
    ];

    // Intercept decks (user has one deck)
    await page.route('**/rest/v1/decks**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 'deck-1', name: 'Test Deck', user_id: 'user-1', created_at: today.toISOString() }]),
                headers: { 'Content-Range': '0-1/1' },
            });
        } else {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }
    });

    // Intercept notes for note IDs lookup
    await page.route('**/rest/v1/notes**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: 'note-1', deck_id: 'deck-1' }]),
        });
    });

    // Intercept cards — 3 due cards (new, learning, review-due), plus HEAD count
    await page.route('**/rest/v1/cards**', async (route) => {
        const method = route.request().method();
        if (method === 'HEAD') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '',
                headers: { 'Content-Range': '0-3/3' },
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 'card-1', note_id: 'note-1', state: 'new', due: new Date().toISOString() },
                    { id: 'card-2', note_id: 'note-1', state: 'learning', due: new Date().toISOString() },
                    { id: 'card-3', note_id: 'note-1', state: 'review', due: buildDateStr(1) },
                ]),
            });
        }
    });

    // Intercept reviews — serve both retention ratings and review_time history
    await page.route('**/rest/v1/reviews**', async (route) => {
        const url = route.request().url();
        // review_time select is for the heatmap / history
        if (url.includes('select=review_time')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(reviewTimes),
            });
        } else {
            // rating select is for retention
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(ratingRows),
            });
        }
    });

    // Auth stub
    await page.route('**/auth/v1/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: null, session: null }),
        });
    });

    // Catch-all for any other Supabase endpoints
    await page.route('**/rest/v1/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
        });
    });
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

test.describe('Dashboard stat cards', () => {
    test('zero state — cards render without crashing', async ({ page }) => {
        await mockSupabaseAPI(page);
        await loadDashboard(page);

        const statValues = page.locator('.stat-value');
        await expect(statValues).toHaveCount(4);

        // Total decks and due reviews both 0, streak 0, retention '--'
        await expect(statValues.nth(0)).toHaveText('0');  // total decks
        await expect(statValues.nth(1)).toHaveText('0');  // due reviews
        await expect(statValues.nth(2)).toHaveText('--'); // retention
        await expect(statValues.nth(3)).toHaveText('0');  // streak
    });

    test('with review data — stat cards show real values', async ({ page }) => {
        await mockSupabaseWithStats(page);
        await loadDashboard(page);

        const statValues = page.locator('.stat-value');
        await expect(statValues).toHaveCount(4);

        // Due reviews: 3 cards
        await expect(statValues.nth(1)).toHaveText('3');
        // Retention: 80%
        await expect(statValues.nth(2)).toHaveText('80%');
        // Streak: 5 consecutive days
        await expect(statValues.nth(3)).toHaveText('5');
    });
});
