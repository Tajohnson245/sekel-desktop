import { useMemo } from 'react';
import { useDecks } from '../../hooks/useDecks';
import { useActivePlan } from '../../hooks/usePlan';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useAuthStore } from '../../stores/authStore';
import { visibleStepIdsFor } from './tourSteps';

/**
 * Returns the IDs of tour steps relevant to the current user's data.
 * Steps for features the user hasn't set up yet (no decks, no plan,
 * no intelligence) are filtered out so we never spotlight an empty UI.
 */
export function useVisibleTourStepIds(): string[] {
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { data: decks = [] } = useDecks();
    const { data: activePlan } = useActivePlan();
    const { data: intelligence } = useSekelIntelligence(userId);

    return useMemo(
        () =>
            visibleStepIdsFor({
                hasDecks: decks.length > 0,
                hasActivePlan: !!activePlan,
                hasIntelligence: !!intelligence,
            }),
        [decks.length, activePlan, intelligence],
    );
}
