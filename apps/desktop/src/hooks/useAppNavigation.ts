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
        // Cross-deck study (SEKEL-137): the routed /study hub, and the player it launches.
        goToStudyHub: (intent?: 'focused' | 'review_all') =>
            navigate('/study' + (intent ? `?intent=${intent}` : '')),
        goToCrossDeckSession: (opts: { scope: 'plan' | 'all'; focus?: boolean; systemKeys?: string[] }) => {
            const params = new URLSearchParams({ mode: 'due', scope: opts.scope });
            if (opts.focus) {
                params.set('focus', 'intelligence');
                if (opts.systemKeys && opts.systemKeys.length > 0) params.set('systems', opts.systemKeys.join(','));
            }
            navigate(`/study/session?${params.toString()}`);
        },
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
