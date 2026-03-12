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
    fetchAllCardsForStudy,
    updateCardAfterReview,
    type DeckStats,
    type CardWithNote,
} from '../lib/queries';
import type { Deck, DeckInsert, DeckUpdate, Card } from '../lib/types';
import { useAuthStore } from '../stores/authStore';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const deckKeys = {
    all: ['decks'] as const,
    detail: (id: string) => ['decks', id] as const,
    stats: (id: string) => ['decks', id, 'stats'] as const,
    dueCards: (id: string) => ['decks', id, 'due-cards'] as const,
    allCards: (id: string) => ['decks', id, 'all-cards'] as const,
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
    return useQuery<DeckStats>({
        queryKey: deckKeys.stats(deckId ?? ''),
        queryFn: () => fetchDeckStats(deckId!),
        enabled: !!deckId,
    });
}

export function useDueCards(deckId: string | null) {
    return useQuery<CardWithNote[]>({
        queryKey: deckKeys.dueCards(deckId ?? ''),
        queryFn: () => fetchDueCards(deckId!),
        enabled: !!deckId,
    });
}

export function useAllCardsForStudy(deckId: string | null) {
    return useQuery<CardWithNote[]>({
        queryKey: deckKeys.allCards(deckId ?? ''),
        queryFn: () => fetchAllCardsForStudy(deckId!),
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
        onSuccess: () => {
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
