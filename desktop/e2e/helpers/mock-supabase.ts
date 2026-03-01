import { Page } from '@playwright/test';

/**
 * Mock all Supabase API calls to return empty/default data
 * This allows UI tests to run without a real database connection
 */
export async function mockSupabaseAPI(page: Page) {
    // Mock Supabase REST API calls
    await page.route('**/rest/v1/**', async (route) => {
        const url = route.request().url();
        console.log(`Mocking Supabase request: ${url}`);

        // Return empty arrays for all GET requests
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
                headers: {
                    'Content-Range': '0-0/0',
                },
            });
        }
        // Return success for POST/PATCH/DELETE
        else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        }
    });

    // Mock Supabase auth calls
    await page.route('**/auth/v1/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: null, session: null }),
        });
    });
}

/**
 * Mock Supabase with sample deck data for testing deck UI
 */
export async function mockSupabaseWithDecks(page: Page) {
    await page.route('**/rest/v1/decks**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'deck-1',
                        name: 'Test Deck',
                        description: 'A test deck',
                        user_id: '00000000-0000-0000-0000-000000000001',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                ]),
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        }
    });

    // Mock other endpoints with empty data
    await page.route('**/rest/v1/**', async (route) => {
        if (!route.request().url().includes('/decks')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        }
    });

    await page.route('**/auth/v1/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: null, session: null }),
        });
    });
}
