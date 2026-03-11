import { useMutation } from '@tanstack/react-query';
import { generateCards } from '../lib/ai';
export type { GeneratedCard, AIGenerationOptions } from '../lib/ai';
import type { AIGenerationOptions } from '../lib/ai';

export function useGenerateCards() {
    return useMutation({
        mutationFn: ({ text, count, language, options }: { text: string; count?: number; language?: string; options?: AIGenerationOptions }) =>
            generateCards(text, count, language, options)
    });
}