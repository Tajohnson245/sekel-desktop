import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['e2e/**'],
        coverage: {
            provider: 'v8',
            include: ['src/lib/**', 'src/main/db/**'],
            reporter: ['text', 'html'],
        },
    },
});
