/**
 * Per-deck retention and yield-mix for the decks page (SEKEL-138), each fetched
 * once as a batched query keyed on the current deck set. Mirrors
 * useDeckClassificationCounts: retention is always available; yield mix is
 * exam-scoped (hasExam === false without an exam profile).
 */
import { useQuery } from '@tanstack/react-query';
import { fetchDeckRetentionBatch } from '../lib/queries';
import type { DeckRetentionRow, DeckYieldMix } from '../lib/queries';
import { useDecks } from './useDecks';
import { useExamProfile } from './useExamProfile';
import { useAuthStore } from '../stores/authStore';

const RETENTION_WINDOW_DAYS = 30;

/** Stable cache key for the current deck set. */
function deckSetKey(deckIds: string[]): string {
    return [...deckIds].sort().join(',');
}

export interface DeckRetention {
    nonAgain: number;
    total: number;
}

export function useDeckRetention(days = RETENTION_WINDOW_DAYS): Map<string, DeckRetention> {
    const { data: decks = [] } = useDecks();
    const userId = useAuthStore((s) => s.user?.id);
    const deckIds = decks.map((d) => d.id);

    const { data = [] } = useQuery<DeckRetentionRow[]>({
        queryKey: ['deckRetention', userId ?? '', deckSetKey(deckIds), days],
        queryFn: () => fetchDeckRetentionBatch(deckIds, userId!, days),
        enabled: !!userId && deckIds.length > 0,
        staleTime: 60 * 1000,
    });

    const byDeck = new Map<string, DeckRetention>();
    data.forEach((r) => byDeck.set(r.deckId, { nonAgain: r.nonAgain, total: r.total }));
    return byDeck;
}

export interface DeckYield {
    high: number;
    medium: number;
    low: number;
}

export interface DeckYieldMixResult {
    byDeck: Map<string, DeckYield>;
    hasExam: boolean;
}

export function useDeckYieldMix(): DeckYieldMixResult {
    const { data: decks = [] } = useDecks();
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;
    const deckIds = decks.map((d) => d.id);

    const { data = [] } = useQuery<DeckYieldMix[]>({
        queryKey: ['deckYieldMix', examKey ?? '', deckSetKey(deckIds)],
        queryFn: () => window.electronAPI.yield.getDeckYieldMix(deckIds, examKey!),
        enabled: !!examKey && deckIds.length > 0,
        staleTime: 60 * 1000,
    });

    const byDeck = new Map<string, DeckYield>();
    data.forEach((r) => byDeck.set(r.deckId, { high: r.high, medium: r.medium, low: r.low }));
    return { byDeck, hasExam: !!examKey };
}
