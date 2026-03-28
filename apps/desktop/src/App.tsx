import { ThemeProvider } from './components/ThemeProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { ToastProvider, ErrorBoundary } from './components/UI';
import './index.css';

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
