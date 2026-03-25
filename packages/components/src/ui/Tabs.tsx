import { createContext, useContext, useState, useCallback, useRef, type ReactNode, type KeyboardEvent } from 'react';
import './Tabs.css';

interface TabsContextValue {
    activeTab: string;
    setActiveTab: (id: string) => void;
    registerTab: (id: string) => void;
    tabs: string[];
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>');
    return ctx;
}

// ── Tabs (root) ──────────────────────────────────────────────────────────────

interface TabsProps {
    defaultTab: string;
    children: ReactNode;
}

export function Tabs({ defaultTab, children }: TabsProps) {
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [tabs, setTabs] = useState<string[]>([]);

    const registerTab = useCallback((id: string) => {
        setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }, []);

    return (
        <TabsContext.Provider value={{ activeTab, setActiveTab, registerTab, tabs }}>
            {children}
        </TabsContext.Provider>
    );
}

// ── TabList ──────────────────────────────────────────────────────────────────

interface TabListProps {
    children: ReactNode;
}

export function TabList({ children }: TabListProps) {
    const { tabs, activeTab, setActiveTab } = useTabsContext();
    const listRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

        const currentIdx = tabs.indexOf(activeTab);
        if (currentIdx === -1) return;

        let nextIdx: number;
        if (e.key === 'ArrowRight') {
            nextIdx = (currentIdx + 1) % tabs.length;
        } else {
            nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        }

        setActiveTab(tabs[nextIdx]);

        // Focus the newly active tab button
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[nextIdx]?.focus();
    };

    return (
        <div className="tabs-list" role="tablist" ref={listRef} onKeyDown={handleKeyDown}>
            {children}
        </div>
    );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

interface TabProps {
    id: string;
    children: ReactNode;
}

export function Tab({ id, children }: TabProps) {
    const { activeTab, setActiveTab, registerTab } = useTabsContext();
    const isActive = activeTab === id;

    // Register on first render
    useState(() => { registerTab(id); });

    return (
        <button
            className="tab-button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={isActive}
            aria-controls={`panel-${id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveTab(id)}
        >
            {children}
        </button>
    );
}

// ── TabPanel ─────────────────────────────────────────────────────────────────

interface TabPanelProps {
    id: string;
    children: ReactNode;
}

export function TabPanel({ id, children }: TabPanelProps) {
    const { activeTab } = useTabsContext();
    const isActive = activeTab === id;

    return (
        <div
            className="tab-panel"
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={!isActive}
        >
            {children}
        </div>
    );
}
