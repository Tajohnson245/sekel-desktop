import { test, expect } from '@playwright/test';
import { mockElectronAPI } from './helpers/mock-electron';

test('should allow adding images to cards', async ({ page }) => {
    await mockElectronAPI(page);

    // Mock Supabase storage upload
    await page.route('**/storage/v1/object/card-media/*', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ Key: 'card-media/mock-user/mock-image.png' }),
            });
        } else {
            await route.continue();
        }
    });

    // Mock getting public URL - return a placeholder image or just a valid URL
    // Note: The storage implementation calls `getPublicUrl` synchronously (it just constructs string), 
    // unless it makes a network request? 
    // `supabase.storage.from(...).getPublicUrl(...)` is synchronous in JS SDK usually.
    // If it's synchronous, we don't need to mock a network request for it.
    // But `upload` definitely triggers a POST.

    // 1. Login
    await page.goto('/');
    await page.getByTestId('auth-submit').click(); // Mock auth login

    // 2. Go to a deck (assuming one exists from mock data)
    await page.getByText('Spanish Verification').click();

    // 3. Click "Add Card"
    await page.getByTestId('add-card-btn').click();

    // 4. Find the file input and upload a file
    // We need to trigger the hidden file input. 
    // The ImageUpload component has a file input. We can locate it by "Add Image to Front" button's sibling input?
    // Or just use setInputFiles on the hidden input if we can select it.

    // Create a dummy file
    const buffer = Buffer.from('fake image content');

    // Trigger upload for Front
    // The input is hidden, so we might need to make it visible or just dispatch?
    // Playwright can handle hidden inputs usually if we select by locator.
    // In ImageUpload.tsx: type="file" style={{ display: 'none' }}
    // We can target it via the container?

    // We can rely on the label "Add Image to Front" to find the button, then finding the previous sibling input?
    // Or simpler: The input is inside `div.image-upload-container`.

    // Let's rely on the order. First one is front, second is back.
    const frontFileInput = page.locator('input[type="file"]').first();
    await frontFileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer,
    });

    // 5. Verify image tag appears in Front input
    const frontInput = page.getByTestId('card-front-input');
    await expect(frontInput).toContainText('<img src="');

    // 6. Save card
    await page.getByTestId('save-close-btn').click();

    // 7. Verify card in list
    // The card list should show the content.
    // Depending on how CardList renders HTML, we might see the tag or the image.
    // Let's just check if the text contains the image tag.
    await expect(page.locator('.card-item').first()).toContainText('<img src="');
});
