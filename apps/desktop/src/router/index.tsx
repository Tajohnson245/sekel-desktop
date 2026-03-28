import { createMemoryRouter, Navigate } from 'react-router-dom';
import AppLayout from './AppLayout';
import ErrorBoundaryRoute from './ErrorBoundaryRoute';
import Dashboard from '../components/Dashboard/Dashboard';
import DeckList from '../components/Deck/DeckList';
import DeckDetail from '../components/Deck/DeckDetail';
import StudySession from '../components/Study/StudySession';
import DraftsPage from '../components/Drafts/DraftsPage';
import ImageOcclusionEditor from '../components/ImageOcclusion/ImageOcclusionEditor';
import StatisticsPage from '../components/Statistics/StatisticsPage';
import { UserProfilePage } from '../components/Profile/UserProfilePage';
import AdminDashboard from '../components/Admin/AdminDashboard';

export const router = createMemoryRouter([
    {
        path: '/',
        element: <AppLayout />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: 'decks', element: <DeckList /> },
            { path: 'decks/:deckId', element: <DeckDetail /> },
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
]);
