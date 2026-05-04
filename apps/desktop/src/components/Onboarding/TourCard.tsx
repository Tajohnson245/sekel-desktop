import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Minus, X } from 'lucide-react';
import { Button } from '../UI';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { findStep, type TourStep } from './tourSteps';
import { Spotlight } from './Spotlight';

function expectedPathname(step: TourStep): string {
    switch (step.route.kind) {
        case 'dashboard': return '/';
        case 'documents': return '/documents';
        case 'plan': return '/plan';
        case 'decks': return '/decks';
        case 'imageOcclusion': return '/image-occlusion';
        case 'drafts': return '/drafts';
        case 'profile': return '/profile';
    }
}

export function TourCard() {
    const { t } = useTranslation();
    const stepIndex = useOnboardingStore((s) => s.stepIndex);
    const visibleStepIds = useOnboardingStore((s) => s.visibleStepIds);
    const next = useOnboardingStore((s) => s.next);
    const back = useOnboardingStore((s) => s.back);
    const minimize = useOnboardingStore((s) => s.minimize);
    const requestSkip = useOnboardingStore((s) => s.requestSkip);

    const nav = useAppNavigation();
    const location = useLocation();

    const stepId = visibleStepIds[stepIndex];
    const step = stepId ? findStep(stepId) : undefined;
    const totalSteps = visibleStepIds.length;

    if (!step) return null;

    const targetPath = expectedPathname(step);
    const onTargetRoute = location.pathname === targetPath;

    useEffect(() => {
        switch (step.route.kind) {
            case 'dashboard': nav.goToDashboard(); break;
            case 'documents': nav.goToDocuments(); break;
            case 'plan': nav.goToPlan(); break;
            case 'decks': nav.goToDecks(); break;
            case 'imageOcclusion': nav.goToImageOcclusion(); break;
            case 'drafts': nav.goToDrafts(); break;
            case 'profile': nav.goToProfile(step.route.tab); break;
        }
    }, [stepIndex]);

    const isLast = stepIndex === totalSteps - 1;
    const isFirst = stepIndex === 0;

    return (
        <>
            {step.targetSelector && onTargetRoute && (
                <Spotlight selector={step.targetSelector} />
            )}
            {!step.targetSelector && (
                <div className="onboarding-backdrop onboarding-backdrop-soft" aria-hidden="true" />
            )}

            <div
                className="onboarding-tour-card"
                role="dialog"
                aria-modal="false"
                aria-labelledby="onboarding-tour-title"
            >
                <div className="onboarding-tour-card-header">
                    <span className="onboarding-tour-step-label">
                        {t('onboarding.step_label', { current: stepIndex + 1, total: totalSteps })}
                    </span>
                    <div className="onboarding-tour-card-controls">
                        <button
                            type="button"
                            className="onboarding-tour-icon-btn"
                            onClick={minimize}
                            aria-label={t('onboarding.minimize_tour')}
                            title={t('onboarding.minimize')}
                        >
                            <Minus size={14} />
                        </button>
                        <button
                            type="button"
                            className="onboarding-tour-icon-btn"
                            onClick={requestSkip}
                            aria-label={t('onboarding.skip_tour')}
                            title={t('onboarding.skip_tour')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <h3 id="onboarding-tour-title" className="onboarding-tour-card-title">
                    {t(`onboarding.steps.${step.id}.title`)}
                </h3>
                <p className="onboarding-tour-card-body">
                    {t(`onboarding.steps.${step.id}.body`)}
                </p>

                <div className="onboarding-tour-progress" aria-hidden="true">
                    {visibleStepIds.map((id, i) => (
                        <span
                            key={id}
                            className={`onboarding-tour-progress-dot ${i === stepIndex ? 'is-active' : ''} ${i < stepIndex ? 'is-done' : ''}`}
                        />
                    ))}
                </div>

                <div className="onboarding-tour-card-actions">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={back}
                        disabled={isFirst}
                    >
                        {t('onboarding.back')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={next}>
                        {isLast ? t('onboarding.finish') : t('onboarding.next')}
                    </Button>
                </div>
            </div>
        </>
    );
}
