import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // .test.tsx files opt into jsdom per file (`// @vitest-environment jsdom`).
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['e2e/**'],
        coverage: {
            provider: 'v8',
            include: ['src/lib/**', 'src/main/db/**'],
            reporter: ['text', 'html'],
        },
    },
});
