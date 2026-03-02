export interface GeneratedCard {
    front: string;
    back: string;
}

export interface AIGenerationOptions {
    cardFormat: 'basic' | 'cloze' | 'reversed';
    difficulty: 'essential' | 'detailed';
    customInstructions?: string;
}

interface ElectronAPI {
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions) => Promise<GeneratedCard[]>;
    parseDocument: (file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => Promise<{ filename: string, content: string }>;
    generateSummary: (documents: Record<string, string>, language?: string) => Promise<string>;
    getSupabaseConfig: () => Promise<{ url: string; anonKey: string }>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export { };
