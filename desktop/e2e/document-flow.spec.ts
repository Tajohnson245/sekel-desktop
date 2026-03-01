
import { test, expect } from '@playwright/test';

test('Document Upload and Flashcard Generation Flow', async ({ page }) => {
    // Mock Electron API
    await page.addInitScript(() => {
        window.electronAPI = {
            // Mock parseDocument
            parseDocument: async (file) => {
                return {
                    filename: file.name,
                    content: `Parsed content for ${file.name}. This is a mock document content.`
                };
            },
            // Mock generateSummary
            generateSummary: async (_docs) => {
                return "## Mock Summary\n\nThis is a summary of the uploaded documents. Key concepts include React, Testing, and Playwright.";
            },
            // Mock generateCardsFromContext
            generateCardsFromContext: async (_summary, _content, count) => {
                return Array(count).fill(0).map((_, i) => ({
                    front: `Mock Question ${i + 1}`,
                    back: `Mock Answer ${i + 1}`,
                    difficulty: 1,
                    source: 'Mock Source'
                }));
            },
            // Mock generateCards (fallback)
            generateCards: async (_text, _count) => {
                return [];
            },
            getSupabaseConfig: async () => ({ url: '', anonKey: '' })
        };
    });

    await page.goto('/');

    // Navigate to Documents page (assuming there's a link or we start there)
    // For now, if default page is dashboard, we might need to click "Documents" or "AI Generator"
    // If not reachable, we might need to adjust test or app navigation.
    // Assuming Sidebar has "Documents" or similar.
    const docsLink = page.getByRole('link', { name: /Documents|AI Generator/i });
    if (await docsLink.count() > 0) {
        await docsLink.click();
    } else {
        // If we are on home and AI Generator is the main feature or accessible via button
        // Check if we are already on documents page
        await expect(page.getByText('AI Study Assistant')).toBeVisible();
    }

    // Upload File
    // We can't easily drag-drop with simple input hidden, but we can set input files.
    await page.setInputFiles('input[type="file"]', {
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('mock pdf content')
    });

    // Verify Parsing
    await expect(page.getByText('Processing Files...')).toBeVisible();
    await expect(page.getByText('test.pdf')).toBeVisible();
    await expect(page.getByText('Generating Context Summary...')).toBeVisible();

    // Verify Summary Review
    await expect(page.getByText('Review Context & Plan')).toBeVisible();
    await expect(page.locator('textarea')).toContainText('Mock Summary');

    // Confirm
    await page.click('button:has-text("Confirm & Generate Cards")');

    // Verify Generator
    await expect(page.getByText('Generated 5 flashcards!')).toBeVisible();
    await expect(page.getByText('Mock Question 1')).toBeVisible();

});
