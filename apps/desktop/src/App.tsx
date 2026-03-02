import { useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, Library, FileText, Plus, Inbox, Layers } from 'lucide-react';
import { useTranslation } from '../node_modules/react-i18next';
import Dashboard from './components/Dashboard/Dashboard';
import DeckList from './components/Deck/DeckList';
import DeckDetail from './components/Deck/DeckDetail';
import DeckEditor from './components/Deck/DeckEditor';
import StudySession from './components/Study/StudySession';
import DocumentsPage from './components/AIStudy/DocumentsPage';
import DraftsPage from './components/Drafts/DraftsPage';
import ImageOcclusionEditor from './components/ImageOcclusion/ImageOcclusionEditor';
import './index.css';
import './components/Layout/AppShell.css';
import './components/Dashboard/Dashboard.css';
import './components/Deck/DeckList.css';
import './components/Deck/DeckCard.css';
import './components/Deck/DeckDetail.css';
import './components/Card/CardList.css';
import './components/Card/CardViewer.css';
import './components/Study/StudySession.css';
import './components/Study/RatingButtons.css';
import './components/AIStudy/DocumentUpload.css';
import './components/AIStudy/DocumentsPage.css';
import './components/AIStudy/AICardGenerator.css';
import './components/Drafts/DraftsPage.css';
import './components/ImageOcclusion/ImageOcclusionEditor.css';
import './components/Auth/Auth.css';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { UserProfile } from './components/UserProfile';
import { UserProfilePage } from './components/Profile/UserProfilePage';
import { useAuthStore } from './stores/authStore';
import { useDrafts } from './hooks/useDrafts';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
        },
    },
});



function AppContent() {
    const { user } = useAuthStore();
    const userId = user?.id || '';
    const [activeView, setActiveView] = useState('dashboard');
    const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
    const [studyMode, setStudyMode] = useState<'due' | 'all'>('due');
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [isStudying, setIsStudying] = useState(false);
    const [hasUnfinishedDocsWork, setHasUnfinishedDocsWork] = useState(false);
    const { t } = useTranslation();
    const { data: drafts = [] } = useDrafts();

    const navItems = [
        { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { id: 'decks', label: t('nav.decks'), icon: Library },
        { id: 'documents', label: t('nav.generate'), icon: FileText },
        { id: 'image-occlusion', label: t('nav.image_occlusion'), icon: Layers },
        { id: 'drafts', label: t('nav.drafts'), icon: Inbox },
    ];

    const handleSelectDeck = (deckId: string) => {
        setSelectedDeckId(deckId);
        setIsStudying(false);
        setActiveView('deck-detail');
    };

    const handleStartStudy = (mode: 'due' | 'all' = 'due') => {
        setStudyMode(mode);
        setIsStudying(true);
    };

    const handleNavigate = (view: string) => {
        setActiveView(view);
        if (view !== 'deck-detail' && view !== 'study') {
            setSelectedDeckId(null);
            setIsStudying(false);
        }
    };

    const renderView = () => {
        switch (activeView) {
            case 'dashboard':
                return (
                    <Dashboard
                        onSelectDeck={handleSelectDeck}
                        onNavigate={handleNavigate}
                    />
                );
            case 'decks':
                return (
                    <DeckList
                        onSelectDeck={handleSelectDeck}
                        onCreateDeck={() => setShowDeckEditor(true)}
                    />
                );
            case 'deck-detail':
                if (selectedDeckId) {
                    if (isStudying) {
                        return (
                            <StudySession
                                deckId={selectedDeckId}
                                userId={userId}
                                mode={studyMode}
                                onBack={() => setIsStudying(false)}
                            />
                        );
                    }
                    return (
                        <DeckDetail
                            deckId={selectedDeckId}
                            userId={userId}
                            onBack={() => handleNavigate('decks')}
                            onStudy={handleStartStudy}
                            onNavigate={handleNavigate}
                        />
                    );
                }
                return (
                    <DeckList
                        onSelectDeck={handleSelectDeck}
                        onCreateDeck={() => setShowDeckEditor(true)}
                    />
                );
            case 'study':
                if (selectedDeckId) {
                    return (
                        <StudySession
                            deckId={selectedDeckId}
                            userId={userId}
                            mode={studyMode}
                            onBack={() => handleNavigate('decks')}
                        />
                    );
                }
                return (
                    <DeckList
                        onSelectDeck={handleSelectDeck}
                        onCreateDeck={() => setShowDeckEditor(true)}
                    />
                );
            case 'documents':
                // Handled by always-mounted DocumentsPage below
                return null;
            case 'drafts':
                return <DraftsPage userId={userId} />;
            case 'image-occlusion':
                return <ImageOcclusionEditor userId={userId} />;
            case 'profile':
                return <UserProfilePage />;
            default:
                return null;
        }
    };

    return (
        <div className="app-shell">
            <header className="header">
                <div className="header-left">
                    <h1>Sekel</h1>
                    <nav className="top-nav">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isDrafts = item.id === 'drafts';
                            const isDocs = item.id === 'documents';
                            return (
                                <div
                                    key={item.id}
                                    className={`nav-link ${activeView === item.id ? 'active' : ''}`}
                                    onClick={() => handleNavigate(item.id)}
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
                                </div>
                            );
                        })}
                    </nav>
                </div>

                <div className="header-right">
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowDeckEditor(true)}
                        data-testid="header-new-deck-btn"
                    >
                        <Plus size={16} />
                        {t('nav.new_deck')}
                    </button>
                    <UserProfile onNavigate={handleNavigate} />
                </div>
            </header>

            <main className="main-content" data-testid="main-content">
                {/* Always mounted so generated cards survive navigation */}
                <div style={{ display: activeView === 'documents' ? 'contents' : 'none' }}>
                    <DocumentsPage
                        userId={userId}
                        initialDeckId={selectedDeckId || undefined}
                        onUnfinishedWorkChange={setHasUnfinishedDocsWork}
                    />
                </div>
                {activeView !== 'documents' && renderView()}
            </main>

            {showDeckEditor && (
                <DeckEditor
                    userId={userId}
                    onClose={() => setShowDeckEditor(false)}
                />
            )}
        </div>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <ProtectedRoute>
                    <AppContent />
                </ProtectedRoute>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
