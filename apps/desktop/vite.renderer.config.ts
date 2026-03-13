import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', 'react-i18next', 'lucide-react', 'recharts'],
        alias: {
            '@sekel/components': path.resolve(__dirname, '../../packages/components/src/index.ts'),
        },
    },
});
