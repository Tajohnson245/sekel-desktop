import { useParams, useSearchParams } from 'react-router-dom';
import { useDueCards, useDueCardsFocused, useAllCardsForStudy, useDeck } from '../../hooks/useDecks';
import { useCreateSession } from '../../hooks/useSessions';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import StudyPlayer from './StudyPlayer';
import type { StudySource } from './studySource';

/**
 * Per-deck study — the thin wrapper that owns single-deck hook wiring and hands
 * the resolved queue to the shared StudyPlayer engine. Behaviour is unchanged
 * from the pre-SEKEL-137 StudySession; the cross-deck flows live in
 * CrossDeckStudySession, which drives the same engine.
 */
export default function StudySession() {
    const { deckId: deckIdParam } = useParams<{ deckId: string }>();
    const deckId = deckIdParam!;
    const [searchParams] = useSearchParams();
    const mode = (searchParams.get('mode') as 'due' | 'all') || 'due';
    const focusMode = searchParams.get('focus');
    const systemsParam = searchParams.get('systems');
    const focusSystemKeys = focusMode === 'intelligence' && systemsParam
        ? systemsParam.split(',').filter(Boolean)
        : [];

    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { goToDeck } = useAppNavigation();
    const { data: deck } = useDeck(deckId);
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;

    const dueCardsResult = useDueCards(mode === 'due' && focusSystemKeys.length === 0 ? deckId : null);
    const allCardsResult = useAllCardsForStudy(mode === 'all' ? deckId : null);
    const focusedCardsResult = useDueCardsFocused(
        mode === 'due' && focusSystemKeys.length > 0 ? deckId : null,
        focusSystemKeys,
        examKey,
    );

    const { data: cards = [], isLoading, refetch } = focusSystemKeys.length > 0
        ? focusedCardsResult
        : mode === 'due' ? dueCardsResult : allCardsResult;

    const createSession = useCreateSession();

    const source: StudySource = { kind: 'deck', deckId, mode, systemKeys: focusSystemKeys };

    return (
        <StudyPlayer
            source={source}
            title={deck?.name ?? ''}
            cards={cards}
            isLoading={isLoading}
            refetch={() => { void refetch(); }}
            createSession={() => createSession.mutateAsync({ userId, deckId }).then((s) => s.id)}
            resolveFsrs={() => deck?.algorithm === 'fsrs'}
            onExit={() => goToDeck(deckId)}
        />
    );
}
