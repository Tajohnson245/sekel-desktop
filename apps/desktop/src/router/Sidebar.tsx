import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings as SettingsIcon, User as UserIcon, ChevronsLeft } from 'lucide-react';
import sekelLogo from '../../assets/sekel_logo_draft.png';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useDrafts } from '../hooks/useDrafts';
import { useDecks } from '../hooks/useDecks';
import { useDeckDueCounts, deckDueTotal } from '../hooks/useDeckDueCounts';
import { useIsAdmin } from '../hooks/useIsAdmin';

interface NavItemDef {
    id: string;
    path: string;
    label: string;
}

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

/** Extract the deck id from /decks/:id or /decks/:id/study. */
function activeDeckIdFrom(pathname: string): string | null {
    const m = pathname.match(/^\/decks\/([^/]+)/);
    return m ? m[1] : null;
}

/**
 * Ink v2 app rail — 260px, SIDE background (spec §5.1). Dot-bullet nav, a
 * contextual DECKS section on deck-related screens, a pinned tier card, and a
 * quiet identity footer. The spec's "Study"/"Browse" are per-deck activities in
 * this app, reached from deck rows (§7.3) and the Dashboard hero (§9.1), so the
 * rail exposes the app's real destinations rather than inventing routes.
 */
export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { user, signOut } = useAuthStore();
    const profile = useProfileStore((s) => s.profile);
    const { data: drafts = [] } = useDrafts();
    const { data: decks = [] } = useDecks();
    const { byDeck } = useDeckDueCounts();
    const isAdmin = useIsAdmin();

    const navItems: NavItemDef[] = useMemo(() => {
        const items: NavItemDef[] = [
            { id: 'dashboard', path: '/', label: t('nav.dashboard') },
            { id: 'decks', path: '/decks', label: t('nav.decks') },
            { id: 'documents', path: '/documents', label: t('nav.generate') },
            { id: 'image-occlusion', path: '/image-occlusion', label: t('nav.image_occlusion') },
            { id: 'drafts', path: '/drafts', label: t('nav.drafts') },
            { id: 'plan', path: '/plan', label: t('nav.plan') },
            { id: 'statistics', path: '/statistics', label: t('nav.statistics') },
            { id: 'profile', path: '/profile', label: t('profile.settings') },
        ];
        if (isAdmin) items.push({ id: 'admin', path: '/admin', label: 'Diagnostics' });
        return items;
    }, [t, isAdmin]);

    const isActive = (path: string) =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

    const showDecks = location.pathname.startsWith('/decks');
    const activeDeckId = activeDeckIdFrom(location.pathname);
    const isStudying = /^\/decks\/[^/]+\/study/.test(location.pathname);

    return (
        <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} data-testid="app-sidebar">
            {/* Logo mark + collapse toggle */}
            <div className="sidebar-brand-row">
                <button className="sidebar-brand" onClick={() => navigate('/')} aria-label="SEKEL — Dashboard">
                    <img src={sekelLogo} alt="SEKEL" className="sidebar-logo-img" />
                </button>
                <button
                    className="sidebar-collapse-btn"
                    onClick={onToggle}
                    aria-label={t('nav.collapse_sidebar', { defaultValue: 'Collapse sidebar' })}
                    title={t('nav.collapse_sidebar', { defaultValue: 'Collapse sidebar' })}
                >
                    <ChevronsLeft size={16} />
                </button>
            </div>

            <nav className="sidebar-nav" aria-label="Primary">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <button
                            key={item.id}
                            className={`nav-item ${active ? 'is-active' : ''}`}
                            onClick={() => navigate(item.path)}
                            aria-current={active ? 'page' : undefined}
                            data-testid={`nav-${item.id}`}
                        >
                            <span className="nav-dot" aria-hidden="true" />
                            <span className="nav-item__label">{item.label}</span>
                            {item.id === 'drafts' && drafts.length > 0 && (
                                <span className="nav-count-pill">{drafts.length}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Contextual DECKS section (spec §5.1.3) */}
            {showDecks && decks.length > 0 && (
                <div className="sidebar-decks" aria-label="Decks">
                    <div className="sidebar-section-label">{t('nav.decks')}</div>
                    <div className="sidebar-deck-list">
                        {decks.slice(0, 12).map((deck) => {
                            const due = deckDueTotal(byDeck.get(deck.id));
                            const inSession = activeDeckId === deck.id;
                            return (
                                <button
                                    key={deck.id}
                                    className={`sidebar-deck-row ${inSession ? 'in-session' : ''}`}
                                    onClick={() =>
                                        navigate(
                                            due > 0 && (inSession || isStudying)
                                                ? `/decks/${deck.id}/study?mode=due`
                                                : `/decks/${deck.id}`,
                                        )
                                    }
                                    title={deck.name}
                                >
                                    <span className="sidebar-deck-name">{deck.name}</span>
                                    <span
                                        className={`deck-due-pill ${inSession ? 'is-solid' : ''} ${
                                            due === 0 ? 'is-zero' : ''
                                        }`}
                                    >
                                        {due}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="sidebar-spacer" />

            {/* Identity footer */}
            {user && (
                <div className="sidebar-user">
                    <button
                        className="sidebar-user__id"
                        onClick={() => navigate('/profile')}
                        title={user.email ?? ''}
                    >
                        <span className="sidebar-avatar">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" />
                            ) : (
                                <UserIcon size={15} />
                            )}
                        </span>
                        <span className="sidebar-user__email">{user.email}</span>
                    </button>
                    <button
                        className="sidebar-icon-btn"
                        onClick={() => navigate('/profile')}
                        aria-label={t('profile.settings')}
                        title={t('profile.settings')}
                    >
                        <SettingsIcon size={16} />
                    </button>
                    <button
                        className="sidebar-icon-btn sidebar-icon-btn--danger"
                        onClick={signOut}
                        aria-label={t('auth.logout')}
                        title={t('auth.logout')}
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            )}
        </aside>
    );
}
