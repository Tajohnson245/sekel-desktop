import { createContext, useContext, useState, useCallback } from 'react';
import DeckEditor from '../components/Deck/DeckEditor';
import { useAuthStore } from '../stores/authStore';

interface DeckEditorContextValue {
    openDeckEditor: () => void;
}

const DeckEditorContext = createContext<DeckEditorContextValue>({
    openDeckEditor: () => {},
});

export function useDeckEditor() {
    return useContext(DeckEditorContext);
}

export function DeckEditorProvider({ children }: { children: React.ReactNode }) {
    const [show, setShow] = useState(false);
    const userId = useAuthStore((s) => s.user?.id ?? '');

    const openDeckEditor = useCallback(() => setShow(true), []);

    return (
        <DeckEditorContext.Provider value={{ openDeckEditor }}>
            {children}
            {show && (
                <DeckEditor
                    userId={userId}
                    onClose={() => setShow(false)}
                />
            )}
        </DeckEditorContext.Provider>
    );
}
