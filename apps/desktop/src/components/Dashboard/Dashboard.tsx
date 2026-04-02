import { LayoutDashboard, BookOpen, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useDecks } from '../../hooks/useDecks';
import { useReviewHistory, useGlobalDashboardStats } from '../../hooks/useSessions';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useExamProfile } from '../../hooks/useExamProfile';
import { computeTier, daysUntilNextShift } from '../Study/UrgencyChip';
import { isExamDateSet } from '../../lib/queries';
import SekelIntelligencePanel, { IntelligenceHiddenBar } from './SekelIntelligencePanel';
import PreSessionBriefing from './PreSessionBriefing';
import type { Deck } from '../../lib/types';
import { Button } from '@sekel/components';
import type { ReviewDayCount } from '@sekel/components';
import './Dashboard.css';

/** Count consecutive days ending today (or yesterday) that have at least 1 review. */
function computeStreak(history: ReviewDayCount[]): number {
    if (history.length === 0) return 0;

    const dateSet = new Set(history.map((r) => r.date));
    let streak = 0;
    const cursor = new Date();

    const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Allow the streak to start from today or yesterday
    const todayStr = localDate(cursor);
    if (!dateSet.has(todayStr)) {
        cursor.setDate(cursor.getDate() - 1);
    }

    while (true) {
        const key = localDate(cursor);
        if (!dateSet.has(key)) break;
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { goToDeck, goToDecks, goToProfile } = useAppNavigation();
    const { data: decks = [], isLoading: decksLoading } = useDecks();
    const { user } = useAuthStore();
    const { profile, fetchProfile, updateProfile, isLoading: profileLoading } = useProfileStore();
    const { data: reviewHistory = [] } = useReviewHistory(user?.id);
    const { dueCount, retention, isLoading: statsLoading } = useGlobalDashboardStats(user?.id);
    const { data: intelligence } = useSekelIntelligence(user?.id);
    const { t } = useTranslation();

    const [showBriefing, setShowBriefing] = useState(false);

    const streak = useMemo(() => computeStreak(reviewHistory), [reviewHistory]);

    useEffect(() => {
        if (user?.id && !profile) {
            fetchProfile(user.id);
        }
    }, [user?.id, profile, fetchProfile]);

    const totalDecks = decks.length;
    const firstName = profile?.first_name || t('common.user');
    const intelligenceEnabled = profile?.intelligence_enabled ?? true;
    const { data: examProfile } = useExamProfile();

    const modeChip = (() => {
        if (!examProfile || !isExamDateSet(examProfile.exam_date)) return null;
        if (examProfile.session_mode === 'triage') {
            return { label: 'Final Sprint', sub: 'Max urgency', color: 'var(--danger, #ef4444)' };
        }
        if (examProfile.session_mode === 'mixed') {
            return { label: 'Standard Mode', sub: 'Fixed schedule', color: 'var(--success, #22c55e)' };
        }
        const days = Math.floor((new Date(examProfile.exam_date).getTime() - Date.now()) / 86_400_000);
        const tier = computeTier(days);
        const shift = daysUntilNextShift(days);
        const label = t(tier.labelKey);
        const sub = shift !== null ? `Next shift in ${shift}d` : 'Max urgency';
        const color = tier.emoji === '🟢' ? 'var(--success, #22c55e)' : tier.emoji === '🟡' ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)';
        return { label, sub, color };
    })();

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div>
                    <h2>{t('nav.dashboard')}</h2>
                    <p className="text-muted">{t('dashboard.welcome', { name: firstName })}</p>
                </div>
                {modeChip && (
                    <div className="dashboard-mode-chip" style={{ borderColor: modeChip.color }}>
                        <span className="dashboard-mode-chip__label" style={{ color: modeChip.color }}>{modeChip.label}</span>
                        <span className="dashboard-mode-chip__sub">{modeChip.sub}</span>
                    </div>
                )}
            </div>

            {/* Intelligence + Stats side by side */}
            <div className="dashboard-top">
                {/* Left: SEKEL Intelligence */}
                <div className="dashboard-top__intel">
                    {intelligence && (
                        intelligenceEnabled ? (
                            <SekelIntelligencePanel
                                intelligence={intelligence}
                                onStartFocused={() => setShowBriefing(true)}
                                onHide={() => user?.id && updateProfile(user.id, { intelligence_enabled: false })}
                                onGoToProfile={() => goToProfile()}
                                onGoToDecks={() => goToDecks()}
                            />
                        ) : (
                            <IntelligenceHiddenBar
                                onShow={() => user?.id && updateProfile(user.id, { intelligence_enabled: true })}
                            />
                        )
                    )}
                </div>

                {/* Right: Stats Grid */}
                <div className="dashboard-top__stats">
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
                </div>
            </div>

            {showBriefing && intelligence && (
                <PreSessionBriefing
                    intelligence={intelligence}
                    onDismiss={() => setShowBriefing(false)}
                    onBegin={(deckId) => {
                        setShowBriefing(false);
                        const weakKeys = intelligence.systemBreakdown
                            .filter(s => s.accuracy < 0.80)
                            .map(s => s.systemKey);
                        const systemsParam = weakKeys.length > 0 ? `&systems=${weakKeys.join(',')}` : '';
                        navigate(`/decks/${deckId}/study?mode=due&focus=intelligence${systemsParam}`);
                    }}
                />
            )}

            {/* Quick Actions */}
            <div className="section">
                <h3>{t('dashboard.quick_actions')}</h3>
                <div className="quick-actions">
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={() => goToDecks()}
                        data-testid="start-studying-btn"
                        icon={<BookOpen size={18} />}
                    >
                        {t('dashboard.start_studying')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => goToDecks()}
                        data-testid="view-decks-btn"
                        icon={<LayoutDashboard size={18} />}
                    >
                        {t('dashboard.view_all_decks')}
                    </Button>
                </div>
            </div>

            {/* Recent Decks */}
            <div className="section">
                <h3>{t('dashboard.recent_activity')}</h3>
                {decks.length > 0 ? (
                    <div className="recent-decks">
                        {decks.slice(0, 3).map((deck: Deck) => (
                            <button
                                key={deck.id}
                                className="recent-deck-item"
                                onClick={() => goToDeck(deck.id)}
                                aria-label={deck.name === 'Testing Deck' ? t('decks.demo_deck_name') : deck.name}
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
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">{t('decks.no_decks')}</p>
                )}
            </div>

            {(decksLoading || profileLoading || statsLoading) && (
                <div className="loading">{t('common.loading')}</div>
            )}
        </div>
    );
}

