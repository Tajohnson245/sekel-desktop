import { test, expect } from '@playwright/test';
import { mockSupabaseAPI } from './helpers/mock-supabase';

test.describe('Deck Management', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Supabase before navigating
        await mockSupabaseAPI(page);
        await page.goto('/');
        // Wait for the app to fully load
        await page.waitForSelector('[data-testid="sidebar"]', { timeout: 15000 });
        await page.getByTestId('nav-decks').click();
    });

    test('should show empty state when no decks exist', async ({ page }) => {
        // With mocked empty Supabase response, should always show empty state
        const emptyState = page.getByTestId('empty-decks');
        await expect(emptyState).toBeVisible({ timeout: 5000 });
    });

    test('should open deck editor modal from header button', async ({ page }) => {
        await page.getByTestId('header-new-deck-btn').click();

        const modal = page.getByTestId('deck-editor-modal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('h2')).toHaveText('Create New Deck');
    });

    test('should open deck editor modal from decks page', async ({ page }) => {
        await page.getByTestId('create-deck-btn').click();

        const modal = page.getByTestId('deck-editor-modal');
        await expect(modal).toBeVisible();
    });

    test('should close modal when clicking cancel', async ({ page }) => {
        await page.getByTestId('create-deck-btn').click();

        const modal = page.getByTestId('deck-editor-modal');
        await expect(modal).toBeVisible();

        await modal.getByRole('button', { name: 'Cancel' }).click();
        await expect(modal).not.toBeVisible();
    });

    test('should close modal when clicking overlay', async ({ page }) => {
        await page.getByTestId('create-deck-btn').click();

        const modal = page.getByTestId('deck-editor-modal');
        await expect(modal).toBeVisible();

        // Click outside the modal
        await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
        await expect(modal).not.toBeVisible();
    });

    test('should show error when submitting empty deck name', async ({ page }) => {
        await page.getByTestId('create-deck-btn').click();

        await page.getByTestId('deck-editor-submit').click();

        const error = page.getByTestId('deck-editor-error');
        await expect(error).toHaveText('Deck name is required');
    });

    test('should have functional form inputs', async ({ page }) => {
        await page.getByTestId('create-deck-btn').click();

        const nameInput = page.getByTestId('deck-name-input');
        const descInput = page.getByTestId('deck-description-input');

        await nameInput.fill('Test Deck');
        await descInput.fill('A test description');

        await expect(nameInput).toHaveValue('Test Deck');
        await expect(descInput).toHaveValue('A test description');
    });
});
