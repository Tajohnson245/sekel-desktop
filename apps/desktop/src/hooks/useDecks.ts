/**
 * TanStack Query hooks for deck operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchDecks,
    fetchDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    deleteDecks,
    fetchDeckStats,
    fetchDueCards,
    fetchDueCardsFocused,
    fetchDueCardsCrossDeck,
    fetchDueCardsFocusedCrossDeck,
    fetchAllCardsForStudy,
    fetchAllCardsForDeck,
    updateCardAfterReview,
    createDeckFromMissedCards,
    type DeckStats,
    type CardWithNote,
} from '../lib/queries';
import type { Deck, DeckInsert, DeckUpdate, Card } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useEffectivePlan } from './usePlan';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const deckKeys = {
    all: ['decks'] as const,
    detail: (id: string) => ['decks', id] as const,
    stats: (id: string) => ['decks', id, 'stats'] as const,
    dueCards: (id: string) => ['decks', id, 'due-cards'] as const,
    allCards: (id: string) => ['decks', id, 'all-cards'] as const,
    cards: (id: string) => ['decks', id, 'cards'] as const,
    classificationCount: (id: string, examKey: string) => ['decks', id, 'classification-count', examKey] as const,
};

/** Stable cache key for a cross-deck scope: null → every deck, else the sorted id set. */
function scopeKey(deckIds: string[] | null): string {
    return deckIds === null ? 'all' : [...deckIds].sort().join(',');
}

// Query keys for cross-deck study (SEKEL-137). Rooted at ['study', …] so the
// per-deck ['decks', …] invalidation in useUpdateCard never clobbers an
// in-progress cross-deck queue (nothing re-reads the card list mid-session).
export const studyKeys = {
    crossDeckDue: (deckIds: string[] | null) => ['study', 'due-cross-deck', scopeKey(deckIds)] as const,
    crossDeckFocused: (deckIds: string[] | null) => ['study', 'focused-cross-deck', scopeKey(deckIds)] as const,
};

// ─────────────────────────────────────────────────────────────────
// Deck Queries
// ─────────────────────────────────────────────────────────────────

export function useDecks() {
    const userId = useAuthStore((s) => s.user?.id);
    return useQuery<Deck[]>({
        queryKey: deckKeys.all,
        queryFn: () => fetchDecks(userId!),
        enabled: !!userId,
    });
}

export function useDeck(id: string | null) {
    return useQuery<Deck | null>({
        queryKey: deckKeys.detail(id ?? ''),
        queryFn: () => (id ? fetchDeck(id) : null),
        enabled: !!id,
    });
}

export function useDeckStats(deckId: string | null) {
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    // An active plan's rate caps new cards (same precedence as useDueCards), so the
    // deck-list badge matches what the study session will actually serve.
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;
    return useQuery<DeckStats>({
        queryKey: [...deckKeys.stats(deckId ?? ''), newLimit, reviewLimit],
        queryFn: () => fetchDeckStats(deckId!, userId, newLimit, reviewLimit),
        enabled: !!deckId && !!userId,
    });
}

export function useDueCards(deckId: string | null) {
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    // Plan limit takes precedence over Supabase profile when a plan is active
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;
    return useQuery<CardWithNote[]>({
        queryKey: [...deckKeys.dueCards(deckId ?? ''), newLimit, reviewLimit],
        queryFn: () => fetchDueCards(deckId!, userId, newLimit, reviewLimit),
        enabled: !!deckId && !!userId,
    });
}

export function useDueCardsFocused(deckId: string | null, systemKeys: string[], examKey: string | undefined) {
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;
    return useQuery<CardWithNote[]>({
        queryKey: ['decks', deckId, 'due-cards-focused', systemKeys, newLimit, reviewLimit],
        queryFn: () => fetchDueCardsFocused(deckId!, systemKeys, examKey!, userId, newLimit, reviewLimit),
        enabled: !!deckId && !!userId && !!examKey && systemKeys.length > 0,
    });
}

/**
 * Due cards pooled across decks (Review All). `deckIds = null` → every deck the
 * user owns; a non-null array scopes to those decks (e.g. the active plan's
 * deckFilter). Same daily-limit precedence as useDueCards; the main process
 * applies those limits per deck, so counts reconcile with the sidebar pills.
 */
export function useDueCardsCrossDeck(deckIds: string[] | null, examKey: string | undefined, enabled = true) {
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;
    return useQuery<CardWithNote[]>({
        queryKey: [...studyKeys.crossDeckDue(deckIds), newLimit, reviewLimit, examKey ?? ''],
        queryFn: () => fetchDueCardsCrossDeck(userId!, deckIds, newLimit, reviewLimit, examKey),
        enabled: !!userId && enabled,
    });
}

/**
 * Weak-system due cards pooled across decks (Focused / SEKEL Intelligence).
 * Mirrors useDueCardsFocused but spans the scope's decks. Disabled until an exam
 * key and at least one weak system are known — there is no focused queue without
 * classifications.
 */
export function useDueCardsFocusedCrossDeck(
    deckIds: string[] | null,
    systemKeys: string[],
    examKey: string | undefined,
    enabled = true,
) {
    const userId = useAuthStore((s) => s.user?.id);
    const profile = useProfileStore((s) => s.profile);
    const planNewPerDay = useEffectivePlan().effectiveNewPerDay;
    const limitsEnabled = profile?.daily_limits_enabled ?? true;
    const newLimit = planNewPerDay ?? (limitsEnabled ? (profile?.daily_new_limit ?? 20) : undefined);
    const reviewLimit = limitsEnabled ? (profile?.daily_review_limit ?? 200) : undefined;
    return useQuery<CardWithNote[]>({
        queryKey: [...studyKeys.crossDeckFocused(deckIds), systemKeys, examKey ?? '', newLimit, reviewLimit],
        queryFn: () => fetchDueCardsFocusedCrossDeck(userId!, deckIds, systemKeys, examKey!, newLimit, reviewLimit),
        enabled: !!userId && !!examKey && systemKeys.length > 0 && enabled,
    });
}

export function useAllCardsForStudy(deckId: string | null) {
    return useQuery<CardWithNote[]>({
        queryKey: deckKeys.allCards(deckId ?? ''),
        queryFn: () => fetchAllCardsForStudy(deckId!),
        enabled: !!deckId,
    });
}

export function useDeckClassificationCount(deckId: string | null, examKey: string | undefined) {
    return useQuery<{ classified: number; total: number }>({
        queryKey: deckKeys.classificationCount(deckId ?? '', examKey ?? ''),
        queryFn: () => window.electronAPI.yield.getDeckClassificationCount(deckId!, examKey!),
        enabled: !!deckId && !!examKey,
    });
}

export function useCardsByDeck(deckId: string | null) {
    return useQuery<CardWithNote[]>({
        queryKey: deckKeys.cards(deckId ?? ''),
        queryFn: () => fetchAllCardsForDeck(deckId!),
        enabled: !!deckId,
    });
}

// ─────────────────────────────────────────────────────────────────
// Deck Mutations
// ─────────────────────────────────────────────────────────────────

export function useCreateDeck() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (deck: DeckInsert) => createDeck(deck),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: deckKeys.all });
        },
    });
}

export function useCreateMissedCardsDeck() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, deckName, cardIds }: { userId: string; deckName: string; cardIds: string[] }) =>
            createDeckFromMissedCards(userId, deckName, cardIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: deckKeys.all });
        },
    });
}

export function useUpdateDeck() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: DeckUpdate }) =>
            updateDeck(id, updates),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: deckKeys.all });
            queryClient.invalidateQueries({ queryKey: deckKeys.detail(data.id) });
        },
    });
}

export function useDeleteDeck() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteDeck(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: deckKeys.all });
        },
    });
}

export function useBulkDeleteDecks() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: string[]) => deleteDecks(ids),

        // Yank the selected decks from the visible list before the IPC call returns.
        // Rollback if the mutation fails so the UI never lies about state.
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: deckKeys.all });
            const idSet = new Set(ids);
            const prevDecks = queryClient.getQueryData<Deck[]>(deckKeys.all);
            if (prevDecks) {
                queryClient.setQueryData<Deck[]>(
                    deckKeys.all,
                    prevDecks.filter((d) => !idSet.has(d.id)),
                );
            }
            return { prevDecks };
        },

        onError: (_err, _ids, context) => {
            if (context?.prevDecks) {
                queryClient.setQueryData(deckKeys.all, context.prevDecks);
            }
        },

        // Refetch after the mutation settles to reconcile any per-deck caches
        // (stats, due-cards, etc.) that were keyed off the now-deleted decks.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: deckKeys.all });
        },
    });
}

// ─────────────────────────────────────────────────────────────────
// Card Mutations
// ─────────────────────────────────────────────────────────────────

export function useUpdateCard() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cardId, updates }: { cardId: string; updates: Partial<Card> }) =>
            updateCardAfterReview(cardId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['decks'] });
        },
    });
}
