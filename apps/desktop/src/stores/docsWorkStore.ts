import { create } from 'zustand';

interface DocsWorkState {
    hasUnfinishedWork: boolean;
    setHasUnfinishedWork: (v: boolean) => void;
}

export const useDocsWorkStore = create<DocsWorkState>((set) => ({
    hasUnfinishedWork: false,
    setHasUnfinishedWork: (v) => set({ hasUnfinishedWork: v }),
}));
