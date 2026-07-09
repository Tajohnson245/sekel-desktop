import { create } from 'zustand';

export type OnboardingPhase = 'idle' | 'slides' | 'tour' | 'minimized' | 'done';

export const ONBOARDING_LOCALSTORAGE_KEY = 'sekel:onboarding:completed';

export const TOTAL_SLIDES = 3;

interface OnboardingState {
    phase: OnboardingPhase;
    slideIndex: number;
    stepIndex: number;
    /** IDs of steps to show this run, snapshotted when the tour starts so the
     *  step list stays stable even if the user creates data mid-tour. */
    visibleStepIds: string[];
    skipConfirmOpen: boolean;
    start: (visibleStepIds: string[]) => void;
    /** Start a targeted feature tour directly in the tour phase (no welcome
     *  slides) — used when a feature like Plan Mode or Intelligence unlocks. */
    startFeatureTour: (stepIds: string[]) => void;
    nextSlide: () => void;
    prevSlide: () => void;
    startTour: () => void;
    next: () => void;
    back: () => void;
    goToStep: (index: number) => void;
    minimize: () => void;
    resume: () => void;
    requestSkip: () => void;
    cancelSkip: () => void;
    confirmSkip: () => void;
    finish: () => void;
    reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
    phase: 'idle',
    slideIndex: 0,
    stepIndex: 0,
    visibleStepIds: [],
    skipConfirmOpen: false,

    start: (visibleStepIds) => {
        if (visibleStepIds.length === 0) return;
        set({ phase: 'slides', slideIndex: 0, stepIndex: 0, skipConfirmOpen: false, visibleStepIds });
    },

    startFeatureTour: (stepIds) => {
        if (stepIds.length === 0) return;
        set({ phase: 'tour', slideIndex: 0, stepIndex: 0, skipConfirmOpen: false, visibleStepIds: stepIds });
    },

    nextSlide: () => {
        const { slideIndex } = get();
        if (slideIndex < TOTAL_SLIDES - 1) {
            set({ slideIndex: slideIndex + 1 });
        } else {
            set({ phase: 'tour', stepIndex: 0 });
        }
    },

    prevSlide: () => {
        const { slideIndex } = get();
        if (slideIndex > 0) set({ slideIndex: slideIndex - 1 });
    },

    startTour: () => set({ phase: 'tour', stepIndex: 0 }),

    next: () => {
        const { stepIndex, visibleStepIds } = get();
        if (stepIndex < visibleStepIds.length - 1) {
            set({ stepIndex: stepIndex + 1 });
        } else {
            set({ phase: 'done' });
        }
    },

    back: () => {
        const { stepIndex } = get();
        if (stepIndex > 0) set({ stepIndex: stepIndex - 1 });
    },

    goToStep: (index) => set({ stepIndex: index }),

    minimize: () => set({ phase: 'minimized' }),

    resume: () => set({ phase: 'tour' }),

    requestSkip: () => set({ skipConfirmOpen: true }),

    cancelSkip: () => set({ skipConfirmOpen: false }),

    confirmSkip: () => set({ phase: 'done', skipConfirmOpen: false }),

    finish: () => set({ phase: 'done' }),

    reset: () => set({ phase: 'idle', slideIndex: 0, stepIndex: 0, skipConfirmOpen: false, visibleStepIds: [] }),
}));
