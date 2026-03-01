import { contextBridge, ipcRenderer } from 'electron';
import type { AIGenerationOptions } from './types/electron';

contextBridge.exposeInMainWorld('electronAPI', {
    generateCards: (text: string, count?: number, language?: string, options?: AIGenerationOptions) => ipcRenderer.invoke('generate-cards', text, count, language, options),
    generateCardsFromContext: (summary: string, content: string, count: number, language?: string, options?: AIGenerationOptions) => ipcRenderer.invoke('generate-cards-from-context', { summary, content, count, language, options }),
    parseDocument: (file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => ipcRenderer.invoke('parse-document', file),
    generateSummary: (documents: Record<string, string>, language?: string) => ipcRenderer.invoke('generate-summary', documents, language),
    getSupabaseConfig: () => ipcRenderer.invoke('get-supabase-config'),
});
