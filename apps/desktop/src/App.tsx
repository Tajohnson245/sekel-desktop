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
// as a class on <html> so .card-viewer / .flashcard-container / .occlusion-card
// can read the matching CSS variables. Independent of Electron renderer zoom
// (Ctrl+/-/0) — that scales everything, this scales only the styled card box.
function VisualCardSizeClass() {
    const profile = useProfileStore((s) => s.profile);
    const size = profile?.visual_card_size ?? 'default';
    useLayoutEffect(() => {
        const root = document.documentElement;
        const before = [...root.classList].filter((c) => c.startsWith('vcs-'));
        root.classList.remove(...VISUAL_CARD_SIZE_CLASSES);
        root.classList.add(`vcs-${size}`);

        // Diagnostic logging — verify the profile value, the applied class,
        // and the resolved CSS variables. Paste this output back if something
        // looks off.
        const cs = getComputedStyle(root);
        // eslint-disable-next-line no-console
        console.log('[VisualCardSize]', {
            from_profile: profile?.visual_card_size,
            resolved_size: size,
            html_classes_before: before,
            html_classes_after: [...root.classList].filter((c) => c.startsWith('vcs-')),
            css_max_width:        cs.getPropertyValue('--visual-card-max-width').trim(),
            css_min_height:       cs.getPropertyValue('--visual-card-min-height').trim(),
            css_max_image_height: cs.getPropertyValue('--visual-card-max-image-height').trim(),
        });
    }, [profile?.visual_card_size, size]);
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
