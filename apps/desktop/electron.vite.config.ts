import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', ['VITE_', 'OPENAI_', 'ADMIN_', 'SUPABASE_']);

    return {
        main: {
            plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@sekel/observability'] })],
            define: {
                'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY ?? ''),
                'process.env.OPENAI_MODEL': JSON.stringify(env.OPENAI_MODEL ?? ''),
                'process.env.ADMIN_EMAIL': JSON.stringify(env.ADMIN_EMAIL ?? ''),
                'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
                'process.env.VITE_SUPABASE_PROJECT_URL': JSON.stringify(env.VITE_SUPABASE_PROJECT_URL ?? ''),
                'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
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
