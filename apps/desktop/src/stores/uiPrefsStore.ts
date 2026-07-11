import { create } from 'zustand';

/**
 * Local UI preferences that don't need to sync across devices (pure display
 * choices). Persisted to localStorage so they survive restarts/logins on the
 * same machine. If cross-device sync is ever wanted, these can be promoted to
 * user_profiles columns like the other study prefs.
 */
const MINIMAL_STUDY_VIEW_KEY = 'sekel-minimal-study-view';

function readBool(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

interface UiPrefsState {
    /** Hide the study session chrome (footer stats + shortcut hints + the
     *  top-right timer/status chips) for a distraction-free view. */
    minimalStudyView: boolean;
    setMinimalStudyView: (value: boolean) => void;
}

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
    minimalStudyView: readBool(MINIMAL_STUDY_VIEW_KEY),
    setMinimalStudyView: (value) => {
        try {
            localStorage.setItem(MINIMAL_STUDY_VIEW_KEY, value ? '1' : '0');
        } catch {
            /* ignore */
        }
        set({ minimalStudyView: value });
    },
}));
