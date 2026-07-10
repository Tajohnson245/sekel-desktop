import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDecks, useDueCardsCrossDeck, useDueCardsFocusedCrossDeck } from '../../hooks/useDecks';
import { useCreateStudySession } from '../../hooks/useSessions';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useActivePlan } from '../../hooks/usePlan';
import { useDeckDueCounts } from '../../hooks/useDeckDueCounts';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useTranslation } from 'react-i18next';
import StudyPlayer from './StudyPlayer';
import type { StudySource } from './studySource';

/**
 * Cross-deck study (SEKEL-137) — pools due (Review All) or weak-system (Focused)
 * cards across decks and drives the shared StudyPlayer engine. Query grammar:
 *   ?mode=due                         — Review All
 *   &focus=intelligence&systems=k1,k2 — Focused (weak blueprint systems)
 *   &scope=plan|all                   — plan-scoped decks vs every deck
 */
export default function CrossDeckStudySession() {
    const [searchParams] = useSearchParams();
    const focusMode = searchParams.get('focus');
    const systemsParam = searchParams.get('systems');
    const scope: 'plan' | 'all' = searchParams.get('scope') === 'all' ? 'all' : 'plan';
    const systemKeys = focusMode === 'intelligence' && systemsParam
        ? systemsParam.split(',').filter(Boolean)
        : [];
    const isFocused = systemKeys.length > 0;

    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { t } = useTranslation();
    const { goToStudyHub } = useAppNavigation();
    const { data: decks = [] } = useDecks();
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;
    const { data: activePlan } = useActivePlan(examKey);
    const { topDueDeckId } = useDeckDueCounts();

    // Resolve the scope toggle to a deck-id set: 'all' → null (every owned deck);
    // 'plan' → the active plan's deckFilter (itself null when the plan is unscoped,
    // which also means "all decks"). Kept identical to the StudyHub's resolution.
    const planDeckIds = activePlan?.plan.deckFilter ?? null;
    const deckIds = scope === 'all' ? null : planDeckIds;

    const dueResult = useDueCardsCrossDeck(deckIds, examKey, !isFocused);
    const focusedResult = useDueCardsFocusedCrossDeck(deckIds, systemKeys, examKey, isFocused);
    const { data: cards = [], isLoading, refetch } = isFocused ? focusedResult : dueResult;

    const createStudySession = useCreateStudySession();

    // Per-card algorithm map so a mixed FSRS / SM-2 pool shows the right rating UI.
    const algoByDeck = useMemo(
        () => new Map(decks.map((d) => [d.id, d.algorithm])),
        [decks],
    );

    const source: StudySource = { kind: 'cross-deck', scope, deckIds, mode: 'due', systemKeys };
    const title = isFocused
        ? t('study.focused_title', { defaultValue: 'Focused Session' })
        : t('study.review_all_title', { defaultValue: 'Review All' });

    return (
        <StudyPlayer
            source={source}
            title={title}
            cards={cards}
            isLoading={isLoading}
            refetch={() => { void refetch(); }}
            createSession={() => {
                // Store a representative deck (deck_id is NOT NULL): prefer the first
                // in-scope card's deck, else the busiest deck, else any owned deck.
                const representativeDeckId = cards[0]?.note.deck_id ?? topDueDeckId ?? decks[0]?.id ?? '';
                return createStudySession
                    .mutateAsync({
                        userId,
                        kind: isFocused ? 'focused' : 'review_all',
                        representativeDeckId,
                        scope,
                        systemKeys: isFocused ? systemKeys : null,
                    })
                    .then((s) => s.id);
            }}
            resolveFsrs={(card) => algoByDeck.get(card.note.deck_id) === 'fsrs'}
            onExit={() => goToStudyHub()}
        />
    );
}
