import { create } from 'zustand';
import { useProfileStore } from './profileStore';
import { getUiValue, readLocal, setUiValue, writeLocal } from '../lib/uiState';

/**
 * Display preferences. They follow the user between computers through
 * user_profiles.ui_state (lib/uiState.ts); localStorage keeps them available
 * before the profile loads and offline.
 */
const MINIMAL_STUDY_VIEW_KEY = 'sekel-minimal-study-view';

interface UiPrefsState {
    /** Hide the study session chrome (footer stats + shortcut hints + the
     *  top-right timer/status chips) for a distraction-free view. */
    minimalStudyView: boolean;
    setMinimalStudyView: (value: boolean) => void;
}

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
    minimalStudyView: readLocal(MINIMAL_STUDY_VIEW_KEY) === '1',
    setMinimalStudyView: (value) => {
        writeLocal(MINIMAL_STUDY_VIEW_KEY, value ? '1' : '0');
        setUiValue('minimal_study_view', undefined, value);
        set({ minimalStudyView: value });
    },
}));

// When the profile loads (or another device changed it), adopt its value.
useProfileStore.subscribe((state, prev) => {
    if (state.profile === prev.profile) return;
    const v = getUiValue('minimal_study_view');
    if (typeof v === 'boolean' && v !== useUiPrefsStore.getState().minimalStudyView) {
        writeLocal(MINIMAL_STUDY_VIEW_KEY, v ? '1' : '0');
        useUiPrefsStore.setState({ minimalStudyView: v });
    }
});
