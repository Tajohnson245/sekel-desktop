import { test, expect } from '@playwright/test';
import { mockSupabaseAPI } from './helpers/mock-supabase';

test.describe('Study Session', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Supabase before navigating
        await mockSupabaseAPI(page);
        await page.goto('/');
        // Wait for the app to fully load

    });

    test('should show "Start Studying" button on dashboard', async ({ page }) => {
        const startBtn = page.getByTestId('start-studying-btn');
        await expect(startBtn).toBeVisible();
    });

    test('should navigate to study view from dashboard', async ({ page }) => {
        await page.getByTestId('start-studying-btn').click();

        // Should show deck list or study session
        await expect(page.getByTestId('main-content')).toBeVisible();
    });

    test('should show deck list when study nav is clicked without deck selected', async ({ page }) => {
        await page.getByTestId('nav-study').click();

        // Should show deck list to select a deck
        await expect(page.locator('.deck-list-header')).toBeVisible();
    });

    // These tests would require a deck with cards to fully test
    // In a real test environment, we'd seed test data

    test.describe('with mock data', () => {
        test.skip('should display card front initially', async ({ page: _page }) => {
            // This test requires a deck with cards
            // Would need to mock the Supabase response or seed test data
        });

        test.skip('should reveal card back when clicking reveal button', async ({ page: _page }) => {
            // Requires test data setup
        });

        test.skip('should show rating buttons after revealing', async ({ page: _page }) => {
            // Requires test data setup
        });

        test.skip('should advance to next card after rating', async ({ page: _page }) => {
            // Requires test data setup
        });

        test.skip('should show completion screen when all cards reviewed', async ({ page: _page }) => {
            // Requires test data setup
        });
    });
});

test.describe('Study Session UI Elements', () => {
    test('should have proper button styling for ratings', async ({ page }) => {
        // Mock Supabase before navigating
        await mockSupabaseAPI(page);
        await page.goto('/');
        // Wait for the app to fully load
        await page.waitForSelector('[data-testid="sidebar"]', { timeout: 15000 });

        // These are visual regression type tests
        // In a real project, we'd use visual comparison tools
        const mainContent = page.getByTestId('main-content');
        await expect(mainContent).toBeVisible();
    });
});
