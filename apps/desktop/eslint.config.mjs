import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'out/**',
            '.vite/**',
            'playwright-report/**',
            'test-results/**',
            '*.config.*',
            'forge.config.js',
            'renderer.js',
            'main.js',
            'preload.js',
        ],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
            },
            globals: {
                console: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                document: 'readonly',
                window: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'off',
            'no-console': 'off',
        },
    },
    {
        files: ['e2e/**/*.ts'],
        rules: {
            '@typescript-eslint/no-empty-function': 'off',
        },
    }
);
