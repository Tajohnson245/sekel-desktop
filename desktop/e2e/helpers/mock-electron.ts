import { Page } from '@playwright/test';

/**
 * Mocks the electronAPI on the window object.
 * This should be called before navigating to the page.
 */
export async function mockElectronAPI(page: Page) {
  await page.addInitScript(() => {
    window.electronAPI = {
      generateCards: async () => [],
      generateCardsFromContext: async () => [],
      parseDocument: async (file) => ({ filename: file.name, content: 'Mock content' }),
      generateSummary: async () => 'Mock summary',
      getSupabaseConfig: async () => ({ url: 'mock-url', anonKey: 'mock-key' }),
    };
  });
}
