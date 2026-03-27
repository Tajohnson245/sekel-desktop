import { useQuery } from '@tanstack/react-query';
import { getYieldScores, getYieldExplanation } from '../lib/queries';
import type { YieldScoreRow } from '../lib/queries';

export const yieldKeys = {
    scores:      (examKey: string, cardIds?: string[]) => ['yield', 'scores', examKey, cardIds] as const,
    explanation: (cardId: string, examKey: string)     => ['yield', 'explanation', cardId, examKey] as const,
};

export function useYieldScores(examKey: string | undefined, cardIds?: string[]) {
    return useQuery<YieldScoreRow[]>({
        queryKey: yieldKeys.scores(examKey ?? '', cardIds),
        queryFn:  () => getYieldScores(examKey!, cardIds),
        enabled:  !!examKey && !!cardIds && cardIds.length > 0,
        staleTime: 5 * 60 * 1000,
    });
}

export function useYieldExplanation(cardId: string | undefined, examKey: string | undefined, enabled = false) {
    return useQuery<string>({
        queryKey: yieldKeys.explanation(cardId ?? '', examKey ?? ''),
        queryFn:  () => getYieldExplanation(cardId!, examKey!),
        enabled:  enabled && !!cardId && !!examKey,
        staleTime: 10 * 60 * 1000,
    });
}
