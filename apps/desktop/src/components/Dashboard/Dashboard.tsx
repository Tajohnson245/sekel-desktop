import { LayoutDashboard, BookOpen, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useDecks } from '../../hooks/useDecks';
import { useReviewHistory, useGlobalDashboardStats } from '../../hooks/useSessions';
import type { Deck } from '../../lib/types';
import { Button, ReviewHeatmap } from '@sekel/components';
import type { ReviewDayCount } from '@sekel/components';
import './Dashboard.css';

/** Count consecutive days ending today (or yesterday) that have at least 1 review. */
function computeStreak(history: ReviewDayCount[]): number {
    if (history.length === 0) return 0;

    const dateSet = new Set(history.map((r) => r.date));
    let streak = 0;
    const cursor = new Date();

    // Allow the streak to start from today or yesterday
    const todayStr = cursor.toISOString().slice(0, 10);
    if (!dateSet.has(todayStr)) {
        cursor.setDate(cursor.getDate() - 1);
    }

    while (true) {
        const key = cursor.toISOString().slice(0, 10);
        if (!dateSet.has(key)) break;
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

interface DashboardProps {
    onSelectDeck: (deckId: string) => void;
    onNavigate: (view: string) => void;
}

export default function Dashboard({ onSelectDeck, onNavigate }: DashboardProps) {
    const { data: decks = [], isLoading: decksLoading } = useDecks();
    const { user } = useAuthStore();
    const { profile, fetchProfile, isLoading: profileLoading } = useProfileStore();
    const { data: reviewHistory = [] } = useReviewHistory(user?.id);
    const { dueCount, retention, isLoading: statsLoading } = useGlobalDashboardStats(user?.id);
    const { t } = useTranslation();

    const streak = useMemo(() => computeStreak(reviewHistory), [reviewHistory]);

    useEffect(() => {
        if (user?.id && !profile) {
            fetchProfile(user.id);
        }
    }, [user?.id, profile, fetchProfile]);

    const totalDecks = decks.length;
    const firstName = profile?.first_name || t('common.user');

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h2>{t('nav.dashboard')}</h2>
                <p className="text-muted">{t('dashboard.welcome', { name: firstName })}</p>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                        <LayoutDashboard size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{totalDecks}</span>
                        <span className="stat-label">{t('dashboard.total_decks')}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                        <BookOpen size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{dueCount}</span>
                        <span className="stat-label">{t('dashboard.due_reviews')}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">
                            {retention !== null ? `${retention}%` : '--'}
                        </span>
                        <span className="stat-label">{t('dashboard.retention')}</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                        <Zap size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{streak}</span>
                        <span className="stat-label">{t('dashboard.day_streak')}</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="section">
                <h3>{t('dashboard.quick_actions')}</h3>
                <div className="quick-actions">
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={() => onNavigate('study')}
                        data-testid="start-studying-btn"
                        icon={<BookOpen size={18} />}
                    >
                        {t('dashboard.start_studying')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => onNavigate('decks')}
                        data-testid="view-decks-btn"
                        icon={<LayoutDashboard size={18} />}
                    >
                        {t('dashboard.view_all_decks')}
                    </Button>
                </div>
            </div>

            {/* 50 / 50 split: Review Heatmap + Active Decks */}
            <div className="dashboard-split">
                {/* Left: Review Heatmap */}
                <div className="section">
                    <h3>{t('dashboard.review_activity')}</h3>
                    <ReviewHeatmap data={reviewHistory} />
                </div>

                {/* Right: Recent Decks */}
                <div className="section">
                    <h3>{t('dashboard.recent_activity')}</h3>
                    {decks.length > 0 ? (
                        <div className="recent-decks">
                            {decks.slice(0, 3).map((deck: Deck) => (
                                <div
                                    key={deck.id}
                                    className="recent-deck-item"
                                    onClick={() => onSelectDeck(deck.id)}
                                    data-testid={`deck-${deck.id}`}
                                >
                                    <span className="deck-name">
                                        {deck.name === 'Testing Deck' ? t('decks.demo_deck_name') : deck.name}
                                    </span>
                                    <span className="deck-meta">
                                        {deck.description === 'This is a test deck'
                                            ? t('decks.demo_deck_description')
                                            : (deck.description || t('dashboard.no_description'))
                                        }
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted">{t('decks.no_decks')}</p>
                    )}
                </div>
            </div>

            {(decksLoading || profileLoading || statsLoading) && (
                <div className="loading">{t('common.loading')}</div>
            )}
        </div>
    );
}

