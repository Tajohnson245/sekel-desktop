import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    listExams, getExamProfile, upsertExamProfile,
    updateExamProfile, deleteExamProfile, fetchAllCardIds,
} from '../lib/queries';
import type { BlueprintExam, UserExamProfile } from '../lib/queries';
import { useAuthStore } from '../stores/authStore';

export const examKeys = {
    all:     ['exam'] as const,
    exams:   ['exam', 'list'] as const,
    profile: (userId: string) => ['exam', 'profile', userId] as const,
};

export function useExamList() {
    return useQuery<BlueprintExam[]>({
        queryKey: examKeys.exams,
        queryFn:  listExams,
    });
}

export function useExamProfile() {
    const userId = useAuthStore(s => s.user?.id);
    return useQuery<UserExamProfile | null>({
        queryKey: examKeys.profile(userId ?? ''),
        queryFn:  () => getExamProfile(userId!),
        enabled:  !!userId,
    });
}

export function useUpsertExamProfile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (args: { userId: string; examId: number; examDate: string | null; sessionMode?: string }) =>
            upsertExamProfile(args.userId, args.examId, args.examDate, args.sessionMode),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: examKeys.profile(vars.userId) });
        },
    });
}

export function useUpdateExamProfile() {
    const qc = useQueryClient();
    const userId = useAuthStore(s => s.user?.id);
    return useMutation({
        mutationFn: (updates: { exam_date?: string; session_mode?: string }) =>
            updateExamProfile(userId!, updates),
        onSuccess: () => {
            if (userId) qc.invalidateQueries({ queryKey: examKeys.profile(userId) });
        },
    });
}

export function useDeleteExamProfile() {
    const qc = useQueryClient();
    const userId = useAuthStore(s => s.user?.id);
    return useMutation({
        mutationFn: () => deleteExamProfile(userId!),
        onSuccess: () => {
            if (userId) {
                qc.setQueryData(examKeys.profile(userId), null);
                qc.invalidateQueries({ queryKey: examKeys.all });
            }
        },
    });
}

export { fetchAllCardIds };
export type { BlueprintExam, UserExamProfile };
