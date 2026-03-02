import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';

const THEME_STORAGE_KEY = 'sekel-theme';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: Theme;
}

interface ThemeProviderState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
    theme: 'system',
    setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function getStoredTheme(): Theme {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
        /* ignore */
    }
    return 'system';
}

export function ThemeProvider({
    children,
    defaultTheme = 'system',
}: ThemeProviderProps) {
    const { profile } = useProfileStore();
    const [theme, setTheme] = useState<Theme>(() => {
        const fromProfile = profile?.theme_preference as Theme | undefined;
        const fromStorage = getStoredTheme();
        return fromProfile || fromStorage || defaultTheme;
    });

    useEffect(() => {
        if (profile?.theme_preference) {
            setTheme(profile.theme_preference as Theme);
        }
    }, [profile?.theme_preference]);

    const setThemeAndPersist = (newTheme: Theme) => {
        setTheme(newTheme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        } catch {
            /* ignore */
        }
    };

    useLayoutEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove('light', 'dark');

        const resolved = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme;

        root.classList.add(resolved);
    }, [theme]);

    return (
        <ThemeProviderContext.Provider value={{ theme, setTheme: setThemeAndPersist }}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined)
        throw new Error('useTheme must be used within a ThemeProvider');

    return context;
};
