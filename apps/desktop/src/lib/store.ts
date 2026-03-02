import { create } from 'zustand';

interface AppState {
    currentDeckId: string | null;
    setCurrentDeckId: (id: string | null) => void;
    sidebarOpen: boolean;
    toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    currentDeckId: null,
    setCurrentDeckId: (id) => set({ currentDeckId: id }),
    sidebarOpen: true,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
