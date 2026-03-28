import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Library, FileText, Plus, Inbox, Layers, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useDocsWorkStore } from '../stores/docsWorkStore';
import { useDrafts } from '../hooks/useDrafts';
import { useExamProfile } from '../hooks/useExamProfile';
import { UserProfile } from '../components/UserProfile';
import DocumentsPage from '../components/AIStudy/DocumentsPage';
import { ExamOnboardingModal } from '../components/ExamOnboarding/ExamOnboardingModal';
import { DeckEditorProvider } from '../contexts/DeckEditorContext';
import { useDeckEditor } from '../contexts/DeckEditorContext';

function NavBar() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { data: drafts = [] } = useDrafts();
    const hasUnfinishedDocsWork = useDocsWorkStore((s) => s.hasUnfinishedWork);

    const navItems = [
        { id: 'dashboard', path: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
        { id: 'decks', path: '/decks', label: t('nav.decks'), icon: Library },
        { id: 'documents', path: '/documents', label: t('nav.generate'), icon: FileText },
        { id: 'image-occlusion', path: '/image-occlusion', label: t('nav.image_occlusion'), icon: Layers },
        { id: 'drafts', path: '/drafts', label: t('nav.drafts'), icon: Inbox },
        { id: 'statistics', path: '/statistics', label: t('nav.statistics'), icon: BarChart3 },
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
                        data-testid={`nav-${item.id}`}
                    >
                        <Icon size={18} />
                        {item.label}
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
                    data-testid="header-new-deck-btn"
                >
                    <Plus size={16} />
                    {t('nav.new_deck')}
                </button>
                <UserProfile />
            </div>
        </header>
    );
}

export default function AppLayout() {
    const { user } = useAuthStore();
    const { profile } = useProfileStore();
    const userId = user?.id || '';
    const backgroundUrl = profile?.background_url;
    const location = useLocation();
    const isDocumentsRoute = location.pathname === '/documents';

    // Exam onboarding auto-show
    const { data: examProfile, isLoading: examProfileLoading } = useExamProfile();
    const [showExamOnboarding, setShowExamOnboarding] = useState(false);
    const [onboardingDismissed, setOnboardingDismissed] = useState(false);

    useEffect(() => {
        if (!examProfileLoading && examProfile === null && !onboardingDismissed) {
            setShowExamOnboarding(true);
        }
    }, [examProfile, examProfileLoading, onboardingDismissed]);

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

                <main className="main-content" data-testid="main-content">
                    {/* Always mounted so generated cards survive navigation */}
                    <div style={{ display: isDocumentsRoute ? 'contents' : 'none' }}>
                        <DocumentsPage userId={userId} />
                    </div>
                    {!isDocumentsRoute && <Outlet />}
                </main>

                <ExamOnboardingModal
                    isOpen={showExamOnboarding}
                    onClose={() => {
                        setShowExamOnboarding(false);
                        setOnboardingDismissed(true);
                    }}
                    onComplete={() => {
                        setShowExamOnboarding(false);
                        setOnboardingDismissed(true);
                    }}
                />
            </div>
        </DeckEditorProvider>
    );
}
