import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useActivePlan } from '../../hooks/usePlan';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useDecks } from '../../hooks/useDecks';
import { useOnboardingStore, ONBOARDING_LOCALSTORAGE_KEY } from '../../stores/onboardingStore';
import { visibleStepIdsFor, FEATURE_TOUR_STEP_IDS } from './tourSteps';

const FLAGS = {
    intelligence: 'sekel:tour:intelligence',
    plan: 'sekel:tour:plan',
} as const;

function isShown(key: string): boolean {
    try { return localStorage.getItem(key) === 'shown'; } catch { return false; }
}
function markShown(key: string): void {
    try { localStorage.setItem(key, 'shown'); } catch { /* ignore */ }
}

/**
 * Auto-launches a targeted mini-tour the moment the user first unlocks a
 * feature — Plan Mode (their first active plan) or SEKEL Intelligence (their
 * first classified cards) — instead of waiting for a manual replay.
 *
 * How it avoids false positives:
 *  - It only acts once each feature query has *settled*, then captures a
 *    per-feature baseline. If the feature was already unlocked at that first
 *    settle (an existing user, or a returning session), it's seeded as "seen"
 *    without firing — so we never retro-tour someone who already has it.
 *  - Only a genuine locked→unlocked transition during the session fires, and a
 *    localStorage flag makes it fire at most once, ever, per feature.
 *  - Feature tours wait until the main onboarding is finished and nothing else
 *    is on screen (phase === 'idle').
 */
export function FeatureUnlockTours() {
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const profile = useProfileStore((s) => s.profile);

    const { data: decks = [] } = useDecks();
    const { data: activePlan, isSuccess: planSettled } = useActivePlan();
    const { data: intelligence, isSuccess: intelSettled } = useSekelIntelligence(userId);
    const { data: examProfile } = useExamProfile();

    const phase = useOnboardingStore((s) => s.phase);
    const startFeatureTour = useOnboardingStore((s) => s.startFeatureTour);

    const planBaselineCaptured = useRef(false);
    const intelBaselineCaptured = useRef(false);

    const mainDone =
        !!profile?.onboarded_at ||
        (() => { try { return localStorage.getItem(ONBOARDING_LOCALSTORAGE_KEY) === '1'; } catch { return false; } })();

    const ctx = useMemo(() => ({
        hasDecks: decks.length > 0,
        hasActivePlan: !!activePlan,
        hasIntelligence: !!intelligence,
        hasExamReadiness:
            !!examProfile?.exam_date &&
            !!intelligence?.hasClassifications &&
            (intelligence?.systemBreakdown?.length ?? 0) > 0,
        hasSystemCoverage: (activePlan?.plan?.snapshot?.systemCoverage?.length ?? 0) > 0,
    }), [decks.length, activePlan, intelligence, examProfile?.exam_date]);

    // Only keep the feature's steps whose preconditions currently pass.
    const planSteps = useMemo(
        () => FEATURE_TOUR_STEP_IDS.plan.filter((id) => visibleStepIdsFor(ctx).includes(id)),
        [ctx],
    );
    const intelSteps = useMemo(
        () => FEATURE_TOUR_STEP_IDS.intelligence.filter((id) => visibleStepIdsFor(ctx).includes(id)),
        [ctx],
    );

    // ── SEKEL Intelligence — unlocked when insights first have data ──────────
    const intelUnlocked = !!intelligence?.hasClassifications;
    useEffect(() => {
        if (!intelSettled) return;
        if (!intelBaselineCaptured.current) {
            intelBaselineCaptured.current = true;
            if (intelUnlocked) markShown(FLAGS.intelligence); // already had it → don't retro-tour
            return;
        }
        if (!intelUnlocked || isShown(FLAGS.intelligence) || !mainDone || phase !== 'idle') return;
        if (intelSteps.length === 0) return;
        markShown(FLAGS.intelligence);
        startFeatureTour(intelSteps);
    }, [intelSettled, intelUnlocked, mainDone, phase, intelSteps, startFeatureTour]);

    // ── Plan Mode — unlocked when the first active plan is created ───────────
    const planUnlocked = !!activePlan;
    useEffect(() => {
        if (!planSettled) return;
        if (!planBaselineCaptured.current) {
            planBaselineCaptured.current = true;
            if (planUnlocked) markShown(FLAGS.plan);
            return;
        }
        if (!planUnlocked || isShown(FLAGS.plan) || !mainDone || phase !== 'idle') return;
        if (planSteps.length === 0) return;
        markShown(FLAGS.plan);
        startFeatureTour(planSteps);
    }, [planSettled, planUnlocked, mainDone, phase, planSteps, startFeatureTour]);

    return null;
}
