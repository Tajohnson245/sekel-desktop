import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock react-i18next — components like Modal use useTranslation.
// The mock returns the fallback string if provided, otherwise the key.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        i18n: { language: 'en' },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
}));
