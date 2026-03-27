import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', ['VITE_', 'OPENAI_']);

    return {
        main: {
            plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
            define: {
                'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY ?? ''),
                'process.env.OPENAI_MODEL': JSON.stringify(env.OPENAI_MODEL ?? ''),
            },
            build: {
                outDir: 'dist/main',
                rollupOptions: {
                    input: 'src/main.ts',
                },
            },
        },
        preload: {
            plugins: [externalizeDepsPlugin()],
            build: {
                outDir: 'dist/preload',
                rollupOptions: {
                    input: 'src/preload.ts',
                },
            },
        },
        renderer: {
            plugins: [react()],
            root: '.',
            build: {
                outDir: 'dist/renderer',
                rollupOptions: {
                    input: 'index.html',
                },
            },
            resolve: {
                dedupe: ['react', 'react-dom', 'react-i18next', 'lucide-react', 'recharts'],
                alias: {
                    '@sekel/components': path.resolve(__dirname, '../../packages/components/src/index.ts'),
                    '@sekel/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
                },
            },
        },
    };
});
