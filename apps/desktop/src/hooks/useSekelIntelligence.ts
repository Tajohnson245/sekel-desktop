import { useQuery } from '@tanstack/react-query';
import { getIntelligenceSummary } from '../lib/queries';
import type { IntelligenceSummary } from '../lib/queries';

export type { IntelligenceSummary };

export const intelligenceKeys = {
    summary: (userId: string) => ['intelligence', 'summary', userId] as const,
};

export function useSekelIntelligence(userId: string | undefined) {
    return useQuery<IntelligenceSummary>({
        queryKey: intelligenceKeys.summary(userId ?? ''),
        queryFn:  () => getIntelligenceSummary(userId!),
        enabled:  !!userId,
        staleTime: 5 * 60 * 1000,
        gcTime:    10 * 60 * 1000,
    });
}
