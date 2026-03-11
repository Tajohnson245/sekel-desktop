/**
 * TanStack Query hooks for note operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchNotesByDeck,
    createNoteWithCards,
    updateNote,
    deleteNote,
    fetchNoteTypes,
    createNoteType,
} from '../lib/queries';
import type { Note, NoteInsert, NoteUpdate, NoteType, NoteTypeInsert } from '../lib/types';
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
        },
    });
}

export function useDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id }: { id: string; deckId: string }) => deleteNote(id),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: noteKeys.byDeck(variables.deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.stats(variables.deckId) });
            queryClient.invalidateQueries({ queryKey: deckKeys.dueCards(variables.deckId) });
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
