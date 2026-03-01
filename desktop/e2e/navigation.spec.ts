import { test, expect } from '@playwright/test';
import { mockSupabaseAPI } from './helpers/mock-supabase';

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Supabase before navigating to avoid connection issues
        await mockSupabaseAPI(page);
        await page.goto('/');
        // Wait for the app to fully load - sidebar should be visible
        await page.waitForSelector('[data-testid="sidebar"]', { timeout: 15000 });
    });

    test('should display the app header', async ({ page }) => {
        await expect(page.locator('.header h1')).toHaveText('Sekel');
    });

    test('should show sidebar navigation', async ({ page }) => {
        const sidebar = page.getByTestId('sidebar');
        await expect(sidebar).toBeVisible();

        await expect(page.getByTestId('nav-dashboard')).toBeVisible();
        await expect(page.getByTestId('nav-decks')).toBeVisible();
        await expect(page.getByTestId('nav-study')).toBeVisible();
        await expect(page.getByTestId('nav-documents')).toBeVisible();
    });

    test('should navigate to decks view', async ({ page }) => {
        await page.getByTestId('nav-decks').click();

        await expect(page.locator('.deck-list-header h2')).toHaveText('Your Decks');
    });

    test('should navigate to study view', async ({ page }) => {
        await page.getByTestId('nav-study').click();

        // Should show deck list when no deck is selected
        await expect(page.locator('.deck-list-header')).toBeVisible();
    });

    test('should navigate to documents view', async ({ page }) => {
        await page.getByTestId('nav-documents').click();

        await expect(page.locator('.documents-header h2')).toHaveText('AI Card Generator');
    });

    test('should highlight active nav item', async ({ page }) => {
        const dashboardNav = page.getByTestId('nav-dashboard');
        await expect(dashboardNav).toHaveClass(/active/);

        await page.getByTestId('nav-decks').click();

        const decksNav = page.getByTestId('nav-decks');
        await expect(decksNav).toHaveClass(/active/);
        await expect(dashboardNav).not.toHaveClass(/active/);
    });
});
