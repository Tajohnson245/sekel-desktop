import { test, expect } from '@playwright/test';

test.describe('Editor and Add Card Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Auth
        await page.route('**/auth/v1/user', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'test-user-id',
                    aud: 'authenticated',
                    role: 'authenticated',
                    email: 'test@example.com',
                }),
            });
        });

        await page.route('**/auth/v1/session', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    access_token: 'fake-token',
                    token_type: 'bearer',
                    user: {
                        id: 'test-user-id',
                        aud: 'authenticated',
                        role: 'authenticated',
                        email: 'test@example.com',
                    }
                }),
            });
        });

        // Mock Decks
        await page.route('**/rest/v1/decks*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'deck-1',
                            name: 'Test Deck',
                            description: 'A test deck',
                            user_id: 'test-user-id',
                            created_at: new Date().toISOString(),
                        },
                    ]),
                });
            } else {
                await route.fulfill({ status: 200, body: '{}' });
            }
        });

        // Mock Note Types
        await page.route('**/rest/v1/note_types*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'note-type-1',
                        name: 'Basic',
                        fields: { Front: 'text', Back: 'text' },
                        user_id: 'test-user-id'
                    },
                ]),
            });
        });

        // Mock Deck Stats
        await page.route('**/rest/v1/deck_stats*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        deck_id: 'deck-1',
                        total_cards: 5,
                        new_cards: 2,
                        learning_cards: 1,
                        review_cards: 2,
                        due_cards: 5
                    },
                ]),
            });
        });

        // Mock Notes (return existing notes for populated state)
        await page.route('**/rest/v1/notes*', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        { id: 'note-1', fields: { Front: 'Card 1', Back: 'Back 1' } },
                        { id: 'note-2', fields: { Front: 'Card 2', Back: 'Back 2' } },
                    ]),
                });
            } else if (method === 'POST') {
                // Return success for creation
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'new-note-id' }),
                });
            } else {
                await route.fulfill({ status: 200, body: '{}' });
            }
        });

        // Mock Storage (for image uploads)
        await page.route('**/storage/v1/object/card-media/*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ Key: 'card-media/test-image.jpg' }),
            });
        });

        // Mock Public Url generation
        await page.route('**/storage/v1/object/public/card-media/*', async (route) => {
            // This usually doesn't need a route if we mock the upload response to return a full URL or if logic constructs it.
            // But actually, uploadImage returns a key, and then we get publicUrl? 
            // Let's assume the component handles it. 
            // If the app does a request to Custom Storage URL, we might need to handle it.
            await route.continue();
        });


        await page.goto('/');
    });

    test('should allow adding cards via header button in non-empty deck', async ({ page }) => {
        // Navigate to deck
        await page.getByTestId('nav-decks').click();
        await page.getByText('Test Deck').click();

        // Check if we are on deck detail
        await expect(page.getByText('Test Deck')).toBeVisible();

        // Check for "Add Card" button in header (it should be visible because we mocked deck stats to have 5 cards)
        const headerAddBtn = page.getByTestId('add-card-header-btn');
        await expect(headerAddBtn).toBeVisible();

        // Open editor
        await headerAddBtn.click();
        await expect(page.getByTestId('note-editor-modal')).toBeVisible();

        // Check for Rich Text Editor presence (Quill class)
        await expect(page.locator('.quill')).toHaveCount(2); // Front and Back

        // Fill fields
        // Since it's a contenteditable div, we use fill on the editor class
        const frontEditor = page.locator('.ql-editor').first();
        const backEditor = page.locator('.ql-editor').nth(1);

        await frontEditor.fill('<b>Rich Text</b> Front');
        await backEditor.fill('Rich Text Back');

        // Save
        const saveBtn = page.getByTestId('save-close-btn');
        await expect(saveBtn).toBeEnabled();
        await saveBtn.click();

        // Verify modal closes
        await expect(page.getByTestId('note-editor-modal')).not.toBeVisible();
    });
});
