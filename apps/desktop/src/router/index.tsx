import { createMemoryRouter, Navigate, type RouteObject } from 'react-router-dom';
import AppLayout from './AppLayout';
import ErrorBoundaryRoute from './ErrorBoundaryRoute';
import RouteErrorScreen from './RouteErrorScreen';
import Dashboard from '../components/Dashboard/Dashboard';
import DeckList from '../components/Deck/DeckList';
import DeckDetail from '../components/Deck/DeckDetail';
import StudySession from '../components/Study/StudySession';
import StudyHub from '../components/Study/StudyHub';
import CrossDeckStudySession from '../components/Study/CrossDeckStudySession';
import DraftsPage from '../components/Drafts/DraftsPage';
import ImageOcclusionEditor from '../components/ImageOcclusion/ImageOcclusionEditor';
import StatisticsPage from '../components/Statistics/StatisticsPage';
import { UserProfilePage } from '../components/Profile/UserProfilePage';
import AdminDashboard from '../components/Admin/AdminDashboard';
import PlanPage from '../components/Plan/PlanPage';

export const routes: RouteObject[] = [
    {
        path: '/',
        element: <AppLayout />,
        // Last resort: the layout itself failed to render.
        errorElement: <RouteErrorScreen />,
        children: [
            {
                // Pathless wrapper so a crashing page renders its error screen
                // inside the layout (sidebar stays usable) instead of replacing it.
                errorElement: <RouteErrorScreen inline />,
                children: [
                    { index: true, element: <Dashboard /> },
                    { path: 'plan', element: <PlanPage /> },
                    { path: 'decks', element: <DeckList /> },
                    { path: 'decks/:deckId', element: <DeckDetail /> },
                    { path: 'study', element: <StudyHub /> },
                    {
                        path: 'study/session',
                        element: (
                            <ErrorBoundaryRoute variant="inline" resetPath="/study">
                                <CrossDeckStudySession />
                            </ErrorBoundaryRoute>
                        ),
                    },
                    {
                        path: 'decks/:deckId/study',
                        element: (
                            <ErrorBoundaryRoute variant="inline" resetPath="/decks">
                                <StudySession />
                            </ErrorBoundaryRoute>
                        ),
                    },
                    { path: 'documents', element: null },
                    { path: 'drafts', element: <DraftsPage /> },
                    {
                        path: 'image-occlusion',
                        element: (
                            <ErrorBoundaryRoute variant="inline" resetPath="/image-occlusion">
                                <ImageOcclusionEditor />
                            </ErrorBoundaryRoute>
                        ),
                    },
                    { path: 'statistics', element: <StatisticsPage /> },
                    { path: 'admin', element: <AdminDashboard /> },
                    { path: 'profile', element: <UserProfilePage /> },
                    { path: '*', element: <Navigate to="/" replace /> },
                ],
            },
        ],
    },
];

export const router = createMemoryRouter(routes);
