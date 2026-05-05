import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Library, FileText, Plus, Inbox, Layers, BarChart3, Activity, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useDocsWorkStore } from '../stores/docsWorkStore';
import { useDrafts } from '../hooks/useDrafts';
import { useExamProfile } from '../hooks/useExamProfile';
import { useActivePlan, usePlanRebalance, useClearPlanOverride } from '../hooks/usePlan';
import { usePlanStore } from '../stores/planStore';
import { UserProfile } from '../components/UserProfile';
import DocumentsPage from '../components/AIStudy/DocumentsPage';
import { DeckEditorProvider } from '../contexts/DeckEditorContext';
import { useDeckEditor } from '../contexts/DeckEditorContext';
import UpdateAvailableModal from '../components/Update/UpdateAvailableModal';
import { OnboardingTour } from '../components/Onboarding/OnboardingTour';
import { useVisibleTourStepIds } from '../components/Onboarding/useVisibleTourStepIds';
import { useOnboardingStore, ONBOARDING_LOCALSTORAGE_KEY } from '../stores/onboardingStore';

function useIsAdmin() {
    const { user } = useAuthStore();
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        if (user?.email) {
            window.electronAPI.obs.isAdmin(user.email).then(setIsAdmin);
        } else {
            setIsAdmin(false);
        }
    }, [user?.email]);
    return isAdmin;
}

function NavBar() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { data: drafts = [] } = useDrafts();
    const hasUnfinishedDocsWork = useDocsWorkStore((s) => s.hasUnfinishedWork);
    const isAdmin = useIsAdmin();

    const navItems = [
        { id: 'dashboard', path: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
        { id: 'plan', path: '/plan', label: t('nav.plan'), icon: CalendarDays },
        { id: 'decks', path: '/decks', label: t('nav.decks'), icon: Library },
        { id: 'documents', path: '/documents', label: t('nav.generate'), icon: FileText },
        { id: 'image-occlusion', path: '/image-occlusion', label: t('nav.image_occlusion'), icon: Layers },
        { id: 'drafts', path: '/drafts', label: t('nav.drafts'), icon: Inbox },
        { id: 'statistics', path: '/statistics', label: t('nav.statistics'), icon: BarChart3 },
        ...(isAdmin ? [{ id: 'admin', path: '/admin', label: 'Diagnostics', icon: Activity }] : []),
    ];

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <nav className="top-nav">
            {navItems.map((item) => {
                const Icon = item.icon;
                const isDrafts = item.id === 'drafts';
                const isDocs = item.id === 'documents';
                return (
                    <button
                        key={item.id}
                        className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                        aria-current={isActive(item.path) ? 'page' : undefined}
                        aria-label={item.label}
                        title={item.label}
                        data-testid={`nav-${item.id}`}
                    >
                        <Icon size={18} />
                        <span className="nav-link__label">{item.label}</span>
                        {isDrafts && drafts.length > 0 && (
                            <span className="nav-draft-badge">{drafts.length}</span>
                        )}
                        {isDocs && hasUnfinishedDocsWork && (
                            <span className="nav-alert-badge" title="Unfinished work">!</span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
}

function HeaderBar() {
    const { t } = useTranslation();
    const { openDeckEditor } = useDeckEditor();

    return (
        <header className="header">
            <div className="header-left">
                <h1>Sekel</h1>
                <NavBar />
            </div>
            <div className="header-right">
                <button
                    className="btn btn-primary"
                    onClick={openDeckEditor}
                    aria-label={t('nav.new_deck')}
                    title={t('nav.new_deck')}
                    data-testid="header-new-deck-btn"
                >
                    <Plus size={16} />
                    <span className="header-cta__label">{t('nav.new_deck')}</span>
                </button>
                <UserProfile />
            </div>
        </header>
    );
}

function RebalanceBanner() {
    const { user }  = useAuthStore();
    const userId    = user?.id ?? '';
    const { t }     = useTranslation();

    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key ?? null;

    // useActivePlan seeds planStore on every app mount (no examKey = any active plan)
    const { data: activePlanResult } = useActivePlan();
    const { data: delta }            = usePlanRebalance(examKey);
    const clearOverride              = useClearPlanOverride();
    const overrideExpiresAt          = usePlanStore(s => s.overrideExpiresAt);

    const [dismissed, setDismissed] = useState(false);

    // On mount: clear a stale one-session override if it has passed midnight
    useEffect(() => {
        if (!userId) return;
        const expires = activePlanResult?.overrideExpiresAt ?? overrideExpiresAt;
        if (expires && new Date(expires) < new Date()) {
            clearOverride.mutate();
        }
    }, [userId, activePlanResult?.overrideExpiresAt]);

    if (!delta || dismissed) return null;

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
                    <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)}>
                        {t('plan.extend_timeline')}
                    </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)}>
                    {t('plan.got_it')}
                </button>
            </div>
        </div>
    );
}

export default function AppLayout() {
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

    // Make sure the profile fetch runs as soon as we have a user, regardless
    // of which route they land on. A brand-new user has no user_profiles row
    // yet (Supabase returns 406 / PGRST116) and the fetch settles with null.
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
        // Brand-new user with no user_profiles row OR existing user whose
        // onboarded_at is still null both count as first-time.
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
                <HeaderBar />
                <RebalanceBanner />

                <main className="main-content" data-testid="main-content">
                    {/* Always mounted so generated cards survive navigation */}
                    <div style={{ display: isDocumentsRoute ? 'contents' : 'none' }}>
                        <DocumentsPage userId={userId} />
                    </div>
                    {!isDocumentsRoute && <Outlet />}
                </main>

                <OnboardingTour />
                <UpdateAvailableModal />
            </div>
        </DeckEditorProvider>
    );
}
