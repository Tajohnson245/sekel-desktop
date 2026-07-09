import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useExamProfile, useUpdateExamProfile } from '../hooks/useExamProfile';
import { useActivePlan, usePlanRebalance, useClearPlanOverride, useUpdatePlanRate } from '../hooks/usePlan';
import { useToast } from '../components/UI';
import DocumentsPage from '../components/AIStudy/DocumentsPage';
import { DeckEditorProvider } from '../contexts/DeckEditorContext';
import UpdateAvailableModal from '../components/Update/UpdateAvailableModal';
import { OnboardingTour } from '../components/Onboarding/OnboardingTour';
import { useVisibleTourStepIds } from '../components/Onboarding/useVisibleTourStepIds';
import { useOnboardingStore, ONBOARDING_LOCALSTORAGE_KEY } from '../stores/onboardingStore';
import { useGlobalKeyboard } from '../hooks/useGlobalKeyboard';
import Sidebar from './Sidebar';

/**
 * Rebalance notice — surfaces Plan Mode's silent morning rebalance (spec §9.1).
 * Kept functionally intact; restyled onto v2 tokens in index.css.
 */
function RebalanceBanner() {
    const { user } = useAuthStore();
    const userId = user?.id ?? '';
    const { t } = useTranslation();
    const { showToast } = useToast();

    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key ?? null;

    const { data: activePlanResult } = useActivePlan();
    const { data: delta } = usePlanRebalance(examKey);
    const clearOverride = useClearPlanOverride();
    const updateRate = useUpdatePlanRate();
    const updateExam = useUpdateExamProfile();

    const [dismissed, setDismissed] = useState(false);

    // One-time DB cleanup: if an override's expiry has passed, clear it so the
    // mirrored daily_new_limit doesn't linger.
    useEffect(() => {
        if (!userId) return;
        const expires = activePlanResult?.overrideExpiresAt;
        if (expires && new Date(expires) < new Date()) {
            clearOverride.mutate();
        }
    }, [userId, activePlanResult?.overrideExpiresAt]);

    // Per-device acknowledgement (spec: don't re-pop every launch). Stores the
    // highest daysMissed the user has already acted on; the banner only returns
    // when they miss MORE days than that. Both actions below also mutate the
    // plan so the detector itself stops firing — this is the belt-and-suspenders.
    const ackKey = userId && examKey ? `sekel-rebalance-ack-${userId}-${examKey}` : null;
    const ackDaysMissed = (() => {
        if (!ackKey) return -1;
        try { const v = localStorage.getItem(ackKey); return v == null ? -1 : parseInt(v, 10); }
        catch { return -1; }
    })();
    const recordAck = (days: number) => {
        if (!ackKey) return;
        try { localStorage.setItem(ackKey, String(days)); } catch { /* ignore */ }
    };

    const busy = updateRate.isPending || updateExam.isPending;

    if (!delta || dismissed) return null;
    // Already acknowledged this many (or fewer) missed days — stay hidden.
    if (delta.daysMissed <= ackDaysMissed) return null;

    // "Got it" — accept the recomputed higher rate and commit it to the plan.
    const handleAccept = () => {
        if (!examKey) return;
        recordAck(delta.daysMissed);
        setDismissed(true);
        updateRate.mutate(
            { examKey, newRate: delta.newNewPerDay },
            {
                onSuccess: () => showToast(t('plan.rebalance_accepted', { defaultValue: 'Plan updated' }), 'success'),
                onError: () => { setDismissed(false); showToast(t('errors.generic', { defaultValue: 'Something went wrong' }), 'error'); },
            },
        );
    };

    // "Extend timeline instead" — push the exam date out just enough to keep the
    // current daily pace, then recompute from there.
    const handleExtend = () => {
        if (!examKey || !examProfile?.exam_date) return;
        const ratio = delta.previousNewPerDay > 0 ? delta.newNewPerDay / delta.previousNewPerDay : 1;
        const extraDays = Math.max(1, Math.ceil(delta.availableDaysRemaining * (ratio - 1)));
        const base = new Date(examProfile.exam_date);
        base.setDate(base.getDate() + extraDays);
        const newExamDate = base.toISOString().slice(0, 10);
        recordAck(delta.daysMissed);
        setDismissed(true);
        updateExam.mutate(
            { exam_date: newExamDate },
            {
                onSuccess: () => showToast(t('plan.timeline_extended', { defaultValue: 'Timeline extended' }), 'success'),
                onError: () => { setDismissed(false); showToast(t('errors.generic', { defaultValue: 'Something went wrong' }), 'error'); },
            },
        );
    };

    return (
        <div className="rebalance-banner">
            <span className="rebalance-banner-text">
                {t('plan.rebalance_banner', {
                    days: delta.daysMissed,
                    rate: delta.newNewPerDay,
                })}
            </span>
            <div className="rebalance-banner-actions">
                {delta.canExtendTimeline && (
                    <button className="btn btn-ghost btn-sm" onClick={handleExtend} disabled={busy}>
                        {t('plan.extend_timeline')}
                    </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={handleAccept} disabled={busy}>
                    {t('plan.got_it')}
                </button>
            </div>
        </div>
    );
}

export default function AppLayout() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { profile } = useProfileStore();
    const userId = user?.id || '';
    const backgroundUrl = profile?.background_url;
    const location = useLocation();
    const isDocumentsRoute = location.pathname === '/documents';

    const onboardingPhase = useOnboardingStore((s) => s.phase);
    const startOnboarding = useOnboardingStore((s) => s.start);
    const visibleTourStepIds = useVisibleTourStepIds();
    const isProfileLoading = useProfileStore((s) => s.isLoading);
    const hasAttemptedProfileFetch = useProfileStore((s) => s.hasAttemptedFetch);
    const fetchProfile = useProfileStore((s) => s.fetchProfile);

    useGlobalKeyboard();

    // Collapsible sidebar (persisted).
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sekel-sidebar-collapsed') === '1'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('sekel-sidebar-collapsed', sidebarCollapsed ? '1' : '0'); } catch { /* ignore */ }
    }, [sidebarCollapsed]);

    // Help → Replay Tour from the native app menu.
    useEffect(() => {
        if (typeof window.electronAPI?.tour?.onReplay !== 'function') return;
        return window.electronAPI.tour.onReplay(() => {
            try { localStorage.removeItem(ONBOARDING_LOCALSTORAGE_KEY); } catch { /* ignore */ }
            if (visibleTourStepIds.length > 0) startOnboarding(visibleTourStepIds);
        });
    }, [startOnboarding, visibleTourStepIds]);

    // Fetch the profile as soon as we have a user, regardless of route.
    useEffect(() => {
        if (user?.id && !profile && !isProfileLoading && !hasAttemptedProfileFetch) {
            fetchProfile(user.id);
        }
    }, [user?.id, profile, isProfileLoading, hasAttemptedProfileFetch, fetchProfile]);

    useEffect(() => {
        if (!user) return;
        if (!hasAttemptedProfileFetch || isProfileLoading) return;
        if (onboardingPhase !== 'idle') return;
        const completedLocally = (() => {
            try { return localStorage.getItem(ONBOARDING_LOCALSTORAGE_KEY) === '1'; }
            catch { return false; }
        })();
        const needsTour = !profile || !profile.onboarded_at;
        if (needsTour && !completedLocally && visibleTourStepIds.length > 0) {
            startOnboarding(visibleTourStepIds);
        }
    }, [user, profile, hasAttemptedProfileFetch, isProfileLoading, onboardingPhase, startOnboarding, visibleTourStepIds]);

    return (
        <DeckEditorProvider>
            <div
                className={`app-shell ${backgroundUrl ? 'has-background' : ''}`}
                style={backgroundUrl ? {
                    backgroundImage: `url(${backgroundUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: 'fixed',
                } : undefined}
            >
                <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

                <div className="app-main">
                    {sidebarCollapsed && (
                        <button
                            className="sidebar-reopen"
                            onClick={() => setSidebarCollapsed(false)}
                            aria-label={t('nav.open_sidebar', { defaultValue: 'Open sidebar' })}
                            title={t('nav.open_sidebar', { defaultValue: 'Open sidebar' })}
                        >
                            <ChevronsRight size={16} />
                        </button>
                    )}
                    <RebalanceBanner />
                    <main className="main-content" data-testid="main-content">
                        {/* Always mounted so generated cards survive navigation */}
                        <div style={{ display: isDocumentsRoute ? 'contents' : 'none' }}>
                            <DocumentsPage userId={userId} />
                        </div>
                        {!isDocumentsRoute && <Outlet />}
                    </main>
                </div>

                <OnboardingTour />
                <UpdateAvailableModal />
            </div>
        </DeckEditorProvider>
    );
}
