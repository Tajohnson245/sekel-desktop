import { useNavigate } from 'react-router-dom';

export function useAppNavigation() {
    const navigate = useNavigate();

    return {
        goToDashboard: () => navigate('/'),
        goToPlan: () => navigate('/plan'),
        goToDecks: () => navigate('/decks'),
        goToDeck: (deckId: string) => navigate(`/decks/${deckId}`),
        goToStudy: (deckId: string, mode: 'due' | 'all' = 'due') =>
            navigate(`/decks/${deckId}/study?mode=${mode}`),
        goToIntelligenceStudy: (deckId: string) =>
            navigate(`/decks/${deckId}/study?mode=due&focus=intelligence`),
        goToDocuments: (deckId?: string) =>
            navigate(deckId ? `/documents?deckId=${deckId}` : '/documents'),
        goToDrafts: () => navigate('/drafts'),
        goToImageOcclusion: () => navigate('/image-occlusion'),
        goToStatistics: () => navigate('/statistics'),
        goToAdmin: () => navigate('/admin'),
        goToProfile: (tab?: string) => navigate('/profile' + (tab ? `#${tab}` : '')),
        goBack: () => navigate(-1),
    };
}
