import { useLayoutEffect } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { ToastProvider, ErrorBoundary } from './components/UI';
import { useProfileStore } from './stores/profileStore';
import './index.css';

const VISUAL_CARD_SIZE_CLASSES = ['vcs-compact', 'vcs-default', 'vcs-large', 'vcs-full'] as const;

// Side-effect-only component: applies the user's visual_card_size preference
// as a class on <html> so .occlusion-card can read the matching CSS variable.
// Independent of Electron renderer zoom (Ctrl+/-/0) — that scales everything,
// this scales only image-occlusion card width.
function VisualCardSizeClass() {
    const profile = useProfileStore((s) => s.profile);
    const size = profile?.visual_card_size ?? 'default';
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.classList.remove(...VISUAL_CARD_SIZE_CLASSES);
        root.classList.add(`vcs-${size}`);
    }, [size]);
    return null;
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
        },
    },
});

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <VisualCardSizeClass />
                <ToastProvider>
                    <ProtectedRoute>
                        <ErrorBoundary variant="page" onReset={() => window.location.reload()}>
                            <RouterProvider router={router} />
                        </ErrorBoundary>
                    </ProtectedRoute>
                </ToastProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
