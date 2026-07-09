/**
 * Per-deck yield-classification counts for the whole deck list, in one place.
 * Mirrors useDeckDueCounts: it reuses the exact query keys of
 * useDeckClassificationCount so caches are shared (no second fetch path).
 *
 * Classification is exam-scoped — the counts are only available once the user
 * has an exam profile (hasExam === false otherwise).
 */
import { useQueries } from '@tanstack/react-query';
import { deckKeys, useDecks } from './useDecks';
import { useExamProfile } from './useExamProfile';

export interface ClassificationCount {
    classified: number;
    total: number;
}

export interface DeckClassificationCounts {
    byDeck: Map<string, ClassificationCount>;
    hasExam: boolean;
}

export function useDeckClassificationCounts(): DeckClassificationCounts {
    const { data: decks = [] } = useDecks();
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;

    const results = useQueries({
        queries: decks.map((d) => ({
            queryKey: deckKeys.classificationCount(d.id, examKey ?? ''),
            queryFn: () => window.electronAPI.yield.getDeckClassificationCount(d.id, examKey!),
            enabled: !!examKey,
        })),
    });

    const byDeck = new Map<string, ClassificationCount>();
    decks.forEach((d, i) => {
        const data = results[i]?.data;
        if (data) byDeck.set(d.id, data);
    });

    return { byDeck, hasExam: !!examKey };
}
