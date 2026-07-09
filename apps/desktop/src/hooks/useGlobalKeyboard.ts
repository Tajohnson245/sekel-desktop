import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcuts (spec §8). Mounted once in the app shell. Screen-
 * scoped shortcuts (Study: Space/1-4/U/Esc/E; Decks: N // ) live in their own
 * single consolidated listener inside each screen — this hook owns only the
 * app-wide bindings so there is exactly one document listener per concern.
 *
 *   ⌘K / Ctrl+K → search surface (Decks)
 *   ⌘, / Ctrl+, → Settings
 */
export function useGlobalKeyboard() {
    const navigate = useNavigate();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            const tag = document.activeElement?.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (e.key.toLowerCase() === 'k') {
                if (typing) return;
                e.preventDefault();
                navigate('/decks');
            } else if (e.key === ',') {
                e.preventDefault();
                navigate('/profile');
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [navigate]);
}
