import { ThemeProvider } from './components/ThemeProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { ToastProvider, ErrorBoundary } from './components/UI';
import './index.css';
import './components/Layout/AppShell.css';
import './components/Dashboard/Dashboard.css';
import './components/Deck/DeckList.css';
import './components/Deck/DeckCard.css';
import './components/Deck/DeckDetail.css';
import './components/Card/CardList.css';
import './components/Card/CardViewer.css';
import './components/Study/StudySession.css';
import './components/Study/RatingButtons.css';
import './components/AIStudy/DocumentUpload.css';
import './components/AIStudy/DocumentsPage.css';
import './components/AIStudy/AICardGenerator.css';
import './components/Drafts/DraftsPage.css';
import './components/ImageOcclusion/ImageOcclusionEditor.css';
import './components/Statistics/StatisticsPage.css';
import './components/Auth/Auth.css';
import './components/UI/ErrorBoundary.css';

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
