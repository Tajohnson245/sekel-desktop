/**
 * TanStack Query hooks for note operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchNotesByDeck,
    createNoteWithCards,
    updateNote,
    deleteNote,
    deleteAllCardsInDeck,
    fetchNoteTypes,
    createNoteType,
} from '../lib/queries';
import type { Note, NoteInsert, NoteUpdate, NoteType, NoteTypeInsert } from '../lib/types';
import type { CardWithNote } from '../lib/queries';
import { deckKeys } from './useDecks';

// ─────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────

export const noteKeys = {
    all: ['notes'] as const,
    byDeck: (deckId: string) => ['notes', 'deck', deckId] as const,
};

export const noteTypeKeys = {
    all: ['note-types'] as const,
    byUser: (userId: string) => ['note-types', userId] as const,
};

// ─────────────────────────────────────────────────────────────────
// Note Queries
// ─────────────────────────────────────────────────────────────────

export function useNotesByDeck(deckId: string | null) {
    return useQuery<Note[]>({
        queryKey: noteKeys.byDeck(deckId ?? ''),
        queryFn: () => fetchNotesByDeck(deckId!),
        enabled: !!deckId,
    });
}

// ─────────────────────────────────────────────────────────────────
// Note Mutations
// ─────────────────────────────────────────────────────────────────

export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ note, templateCount = 1 }: { note: NoteInsert; templateCount?: number }) =>
            createNoteWithCards(note, templateCount),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: noteKeys.byDeck(variables.note.deck_id) });
            queryClient.invalidateQueries({ queryKey: deckKeys.stats(variables.note.deck_id) });
            queryClient.invalidateQueries({ queryKey: deckKeys.dueCards(variables.note.deck_id) });
            queryClient.invalidateQueries({ queryKey: deckKeys.cards(variables.note.deck_id) });
        },
    });
}

export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: NoteUpdate; deckId: string }) =>
            updateNote(id, updates),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: noteKeys.byDeck(variables.deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.cards(variables.deckId) });
        },
    });
}

export function useDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id }: { id: string; deckId: string }) => deleteNote(id),

        // Optimistically yank the row from the visible lists before the IPC call
        // returns so the click feels instant. Rollback if the mutation fails.
        onMutate: async ({ id, deckId }) => {
            const notesKey = noteKeys.byDeck(deckId);
            const cardsKey = deckKeys.cards(deckId);

            await queryClient.cancelQueries({ queryKey: notesKey });
            await queryClient.cancelQueries({ queryKey: cardsKey });

            const prevNotes = queryClient.getQueryData<Note[]>(notesKey);
            const prevCards = queryClient.getQueryData<CardWithNote[]>(cardsKey);

            if (prevNotes) {
                queryClient.setQueryData<Note[]>(notesKey, prevNotes.filter(n => n.id !== id));
            }
            if (prevCards) {
                queryClient.setQueryData<CardWithNote[]>(cardsKey, prevCards.filter(c => c.note.id !== id));
            }

            return { prevNotes, prevCards };
        },

        onError: (_err, { deckId }, context) => {
            const notesKey = noteKeys.byDeck(deckId);
            const cardsKey = deckKeys.cards(deckId);
            if (context?.prevNotes) queryClient.setQueryData(notesKey, context.prevNotes);
            if (context?.prevCards) queryClient.setQueryData(cardsKey, context.prevCards);
        },

        // Counts (stats / due-cards) come from the server; refetch them in the
        // background. Notes/cards lists are already in sync from onMutate.
        onSettled: (_data, _err, { deckId }) => {
            queryClient.invalidateQueries({ queryKey: deckKeys.stats(deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.dueCards(deckId) });
        },
    });
}

export function useDeleteAllCardsInDeck() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (deckId: string) => deleteAllCardsInDeck(deckId),
        onSuccess: (_data, deckId) => {
            // Drop all per-deck caches in one pass — no per-card refetch storm.
            queryClient.setQueryData(noteKeys.byDeck(deckId), []);
            queryClient.setQueryData(deckKeys.cards(deckId), []);
            queryClient.invalidateQueries({ queryKey: noteKeys.byDeck(deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.stats(deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.dueCards(deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.cards(deckId) });
        },
    });
}

// ─────────────────────────────────────────────────────────────────
// Note Type Queries
// ─────────────────────────────────────────────────────────────────

export function useNoteTypes(userId: string | null) {
    return useQuery<NoteType[]>({
        queryKey: noteTypeKeys.byUser(userId ?? ''),
        queryFn: () => fetchNoteTypes(userId!),
        enabled: !!userId,
    });
}

export function useCreateNoteType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (noteType: NoteTypeInsert) => createNoteType(noteType),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: noteTypeKeys.byUser(variables.user_id) });
        },
    });
}
