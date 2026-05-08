import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
    const envDir = path.resolve(__dirname, '../..');
    // Merge filesystem .env files AND process.env so CI runners (which have no
    // .env files; values come from GitHub Secrets via the workflow's env:
    // block) can supply build-time substitutions for the main-process bundle.
    const fileEnv = loadEnv(mode, envDir, ['VITE_', 'OPENAI_', 'ADMIN_', 'SUPABASE_']);
    const env = { ...fileEnv, ...process.env };
    // Renderer + preload don't have access to electron's app.getVersion(),
    // so we inline the version at build time for Sentry's release tag and
    // for any other renderer-side metadata that needs it.
    const appVersion = JSON.stringify(pkg.version);


    return {
        main: {
            plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@sekel/observability'] })],
            define: {
                // Electron does not set NODE_ENV in packaged builds; inline it
                // here so Sentry's environment tag resolves correctly.
                'process.env.NODE_ENV': JSON.stringify(mode),
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
            // BrowserWindow uses sandbox:true — only a small allowlist of modules
            // (electron, events, timers, url) is available via require() at runtime.
            // Bundle @sentry/electron into preload.js so its renderer entry can load.
            plugins: [externalizeDepsPlugin({ exclude: ['@sentry/electron'] })],
            define: {
                'process.env.NODE_ENV': JSON.stringify(mode),
                __APP_VERSION__: appVersion,
            },
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
            envDir,
            define: {
                __APP_VERSION__: appVersion,
            },
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
