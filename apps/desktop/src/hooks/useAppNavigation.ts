import { useNavigate } from 'react-router-dom';

export function useAppNavigation() {
    const navigate = useNavigate();

    return {
        goToDashboard: () => navigate('/'),
        goToDecks: () => navigate('/decks'),
        goToDeck: (deckId: string) => navigate(`/decks/${deckId}`),
        goToStudy: (deckId: string, mode: 'due' | 'all' = 'due') =>
            navigate(`/decks/${deckId}/study?mode=${mode}`),
        goToDocuments: (deckId?: string) =>
            navigate(deckId ? `/documents?deckId=${deckId}` : '/documents'),
        goToDrafts: () => navigate('/drafts'),
        goToImageOcclusion: () => navigate('/image-occlusion'),
        goToStatistics: () => navigate('/statistics'),
        goToAdmin: () => navigate('/admin'),
        goToProfile: () => navigate('/profile'),
        goBack: () => navigate(-1),
    };
}
