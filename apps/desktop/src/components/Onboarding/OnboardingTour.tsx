import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useOnboardingStore, ONBOARDING_LOCALSTORAGE_KEY } from '../../stores/onboardingStore';
import { WelcomeSlides } from './WelcomeSlides';
import { TourCard } from './TourCard';
import './OnboardingTour.css';

function ResumeChip() {
    const { t } = useTranslation();
    const resume = useOnboardingStore((s) => s.resume);
    const stepIndex = useOnboardingStore((s) => s.stepIndex);
    const total = useOnboardingStore((s) => s.visibleStepIds.length);
    return (
        <button type="button" className="onboarding-resume-chip" onClick={resume}>
            {t('onboarding.resume', { current: stepIndex + 1, total })}
        </button>
    );
}

function SkipConfirm() {
    const { t } = useTranslation();
    const cancelSkip = useOnboardingStore((s) => s.cancelSkip);
    const confirmSkip = useOnboardingStore((s) => s.confirmSkip);
    return (
        <div className="onboarding-skip-confirm-overlay" role="dialog" aria-modal="true">
            <div className="onboarding-skip-confirm">
                <h3>{t('onboarding.skip_confirm_title')}</h3>
                <p>{t('onboarding.skip_confirm_body')}</p>
                <div className="onboarding-skip-confirm-actions">
                    <Button variant="secondary" size="sm" onClick={cancelSkip}>
                        {t('onboarding.skip_confirm_keep')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={confirmSkip}>
                        {t('onboarding.skip_tour')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function OnboardingTour() {
    const phase = useOnboardingStore((s) => s.phase);
    const skipConfirmOpen = useOnboardingStore((s) => s.skipConfirmOpen);
    const requestSkip = useOnboardingStore((s) => s.requestSkip);
    const reset = useOnboardingStore((s) => s.reset);

    const user = useAuthStore((s) => s.user);
    const upsertProfile = useProfileStore((s) => s.upsertProfile);

    const persistedRef = useRef(false);

    // Esc handler — only active during slides/tour.
    useEffect(() => {
        if (phase !== 'slides' && phase !== 'tour') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                requestSkip();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [phase, requestSkip]);

    // Persistence on completion or skip.
    useEffect(() => {
        if (phase !== 'done' || persistedRef.current) return;
        persistedRef.current = true;
        try {
            localStorage.setItem(ONBOARDING_LOCALSTORAGE_KEY, '1');
        } catch {
            // ignore — localStorage unavailable
        }
        if (user?.id) {
            upsertProfile(user.id, { onboarded_at: new Date().toISOString() }).catch(() => {
                // Non-fatal: localStorage backup will keep the tour from re-firing.
            });
        }
        // Reset back to idle so the overlay unmounts cleanly.
        const t = window.setTimeout(() => reset(), 0);
        return () => window.clearTimeout(t);
    }, [phase, user?.id, upsertProfile, reset]);

    // Reset persistence guard when a fresh tour starts.
    useEffect(() => {
        if (phase === 'slides' || phase === 'tour') {
            persistedRef.current = false;
        }
    }, [phase]);

    if (phase === 'idle' || phase === 'done') return null;

    return (
        <>
            {phase === 'slides' && <WelcomeSlides />}
            {phase === 'tour' && <TourCard />}
            {phase === 'minimized' && <ResumeChip />}
            {skipConfirmOpen && <SkipConfirm />}
        </>
    );
}
