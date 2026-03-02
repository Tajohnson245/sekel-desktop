import type { GeneratedCard, AIGenerationOptions } from '../types/electron';

export type { GeneratedCard, AIGenerationOptions };

export async function generateCards(text: string, count: number = 5, language?: string, options?: AIGenerationOptions): Promise<GeneratedCard[]> {
    if (window.electronAPI && window.electronAPI.generateCards) {
        return window.electronAPI.generateCards(text, count, language, options);
    }

    console.error('Electron API not found. Are you running in the browser?');
    return [];
}

