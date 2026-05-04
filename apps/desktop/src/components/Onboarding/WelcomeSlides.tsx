import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import { useOnboardingStore, TOTAL_SLIDES } from '../../stores/onboardingStore';
import './OnboardingTour.css';

export function WelcomeSlides() {
    const { t } = useTranslation();
    const slideIndex = useOnboardingStore((s) => s.slideIndex);
    const nextSlide = useOnboardingStore((s) => s.nextSlide);
    const prevSlide = useOnboardingStore((s) => s.prevSlide);
    const requestSkip = useOnboardingStore((s) => s.requestSkip);

    const slideKey = String(slideIndex + 1);
    const isLast = slideIndex === TOTAL_SLIDES - 1;

    return (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-headline">
            <div className="onboarding-slide">
                <div className="onboarding-slide-eyebrow">
                    {t(`onboarding.slides.${slideKey}.eyebrow`)}
                </div>
                <h1 id="onboarding-headline" className="onboarding-slide-headline">
                    {t(`onboarding.slides.${slideKey}.headline`)}
                </h1>
                <p className="onboarding-slide-body">
                    {t(`onboarding.slides.${slideKey}.body`)}
                </p>

                <div
                    className="onboarding-dots"
                    aria-label={t('onboarding.slide_label', { current: slideIndex + 1, total: TOTAL_SLIDES })}
                >
                    {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                        <span
                            key={i}
                            className={`onboarding-dot ${i === slideIndex ? 'is-active' : ''}`}
                            aria-current={i === slideIndex ? 'step' : undefined}
                        />
                    ))}
                </div>

                <div className="onboarding-slide-actions">
                    <Button variant="ghost" onClick={requestSkip}>
                        {t('onboarding.skip')}
                    </Button>
                    <div className="onboarding-slide-actions-right">
                        {slideIndex > 0 && (
                            <Button variant="secondary" onClick={prevSlide}>
                                {t('onboarding.back')}
                            </Button>
                        )}
                        <Button variant="primary" onClick={nextSlide}>
                            {isLast ? t('onboarding.start_tour') : t('onboarding.next')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
