/**
 * TanStack Query hooks for card_drafts operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchDrafts,
    saveDraft,
    updateDraft,
    deleteDraft,
    clearDrafts,
} from '../lib/draftQueries';
import { useCreateNote, useNoteTypes, useCreateNoteType } from './useNotes';
import { DEFAULT_NOTE_TYPES } from '../lib/types';
import type { DraftCardInsert } from '../lib/types';
import { useAuthStore } from '../stores/authStore';

export const DRAFT_LIMIT = 5;

const draftKeys = {
    all: ['drafts'] as const,
};

export function useDrafts() {
    const userId = useAuthStore((s) => s.user?.id);
    return useQuery({
        queryKey: draftKeys.all,
        queryFn: () => fetchDrafts(userId!),
        enabled: !!userId,
    });
}

export function useSaveDraft() {
    const queryClient = useQueryClient();
    const userId = useAuthStore((s) => s.user?.id);
    return useMutation({
        mutationFn: (draft: DraftCardInsert) => saveDraft(userId!, draft),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: draftKeys.all }),
    });
}

export function useUpdateDraft() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<{ front: string; back: string }> }) =>
            updateDraft(id, updates),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: draftKeys.all }),
    });
}

export function useDeleteDraft() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteDraft(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: draftKeys.all }),
    });
}

export function useClearDrafts() {
    const queryClient = useQueryClient();
    const userId = useAuthStore((s) => s.user?.id);
    return useMutation({
        mutationFn: () => clearDrafts(userId!),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: draftKeys.all }),
    });
}

/**
 * Promotes a draft to a real note in a deck, then deletes the draft.
 */
export function usePromoteDraftToDeck(userId: string) {
    const queryClient = useQueryClient();
    const createNote = useCreateNote();
    const { data: noteTypes = [] } = useNoteTypes(userId);
    const createNoteType = useCreateNoteType();

    const getOrCreateBasicNoteTypeId = async (): Promise<string> => {
        const existing = noteTypes.find(nt => nt.name === 'Basic');
        if (existing) return existing.id;
        const defaultType = DEFAULT_NOTE_TYPES[0];
        const created = await createNoteType.mutateAsync({
            user_id: userId,
            name: defaultType.name,
            fields: defaultType.fields,
            card_templates: defaultType.card_templates,
        });
        return created.id;
    };

    return useMutation({
        mutationFn: async ({ draftId, deckId, front, back }: {
            draftId: string;
            deckId: string;
            front: string;
            back: string;
        }) => {
            const noteTypeId = await getOrCreateBasicNoteTypeId();
            await createNote.mutateAsync({
                note: {
                    user_id: userId,
                    deck_id: deckId,
                    note_type_id: noteTypeId,
                    fields: { Front: front, Back: back },
                    tags: ['ai-generated', 'from-draft'],
                },
                templateCount: 1,
            });
            await deleteDraft(draftId);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: draftKeys.all }),
    });
}
