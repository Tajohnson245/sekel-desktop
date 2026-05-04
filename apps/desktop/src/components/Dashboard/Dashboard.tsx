import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Zap, CalendarDays, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useActivePlan, usePlanProgress } from '../../hooks/usePlan';
import { useGlobalDashboardStats, useReviewHistory } from '../../hooks/useSessions';
import { useTodaySummary, useCardCountsByMaturity } from '../../hooks/useStatistics';
import { useDecks, useDeckStats, useDeckClassificationCount } from '../../hooks/useDecks';
import { isExamDateSet } from '../../lib/queries';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import type { Deck } from '../../lib/types';
import type { ReviewDayCount } from '../../lib/queries';
import SekelIntelligencePanel, { IntelligenceHiddenBar } from './SekelIntelligencePanel';
import PreSessionBriefing from './PreSessionBriefing';
import { FeedbackSection } from '../Profile/FeedbackSection';
import './Dashboard.css';

// ── Streak helper — mirrors calculateStreak in notifications.ts ──────────────

function computeStreak(history: ReviewDayCount[]): number {
    if (history.length === 0) return 0;
    const reviewDates = new Set(history.map(r => r.date));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i <= 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        if (reviewDates.has(dateStr)) {
            streak++;
        } else if (i === 0) {
            // Today has no reviews yet — still check yesterday
            continue;
        } else {
            break;
        }
    }
    return streak;
}

// ── Zone 1 — Hero stat card ──────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: string | number | null;
    unit?: string;
    sub?: string | null;
    emptyPrompt?: string;
    onEmptyClick?: () => void;
    highlight?: 'warn' | 'success';
}

function StatCard({ label, value, unit, sub, emptyPrompt, onEmptyClick, highlight }: StatCardProps) {
    if (value === null && emptyPrompt) {
        return (
            <div className="db-stat-card db-stat-card--empty">
                <span className="db-stat-card__label">{label}</span>
                <button className="db-stat-card__empty-prompt" onClick={onEmptyClick}>
                    {emptyPrompt} →
                </button>
            </div>
        );
    }
    return (
        <div className={`db-stat-card${highlight ? ` db-stat-card--${highlight}` : ''}`}>
            <span className="db-stat-card__label">{label}</span>
            <div className="db-stat-card__value-row">
                <span className="db-stat-card__value">{value ?? '—'}</span>
                {unit && <span className="db-stat-card__unit">{unit}</span>}
            </div>
            {sub && <span className="db-stat-card__sub">{sub}</span>}
        </div>
    );
}

// ── Zone 3 — Exam readiness indicator ───────────────────────────────────────

type ReadinessLevel = 'strong' | 'ok' | 'needs-work' | 'no-data';

function readinessLevel(accuracy: number | null, hasData: boolean): ReadinessLevel {
    if (!hasData || accuracy === null) return 'no-data';
    if (accuracy >= 0.85) return 'strong';
    if (accuracy >= 0.70) return 'ok';
    return 'needs-work';
}

const READINESS_LABELS: Record<ReadinessLevel, string> = {
    strong:       '✓ Strong',
    ok:           '~ OK',
    'needs-work': '↓ Needs Work',
    'no-data':    '— No Data',
};

// ── Zone 4 — Per-deck health row ─────────────────────────────────────────────

interface DeckHealthRowProps {
    deck: Deck;
    userId: string;
    examKey?: string;
}

function DeckHealthRow({ deck, userId, examKey }: DeckHealthRowProps) {
    const { data: stats } = useDeckStats(deck.id);
    const { data: maturity } = useCardCountsByMaturity(userId, deck.id);
    // Classified count is only queryable when an exam is set
    const { data: classCount } = useDeckClassificationCount(examKey ? deck.id : null, examKey);

    const totalCards = maturity != null
        ? maturity.newCount + maturity.learningCount + maturity.youngCount + maturity.matureCount
        : null;

    const dueCards = stats != null
        ? stats.newCount + stats.learningCount + stats.reviewCount
        : null;

    // NOTE: A per-deck "3+ days overdue" indicator is not available from existing IPC handlers.
    // It would require a new query: SELECT COUNT(*) FROM cards WHERE state='review' AND due < datetime('now','-3 days').
    // Excluded here per the constraint to not create new backend logic.

    return (
        <div className="db-deck-row">
            <span className="db-deck-row__name">{deck.name}</span>
            <div className="db-deck-row__pills">
                {totalCards != null && (
                    <span className="db-deck-row__pill">{totalCards} cards</span>
                )}
                {examKey && classCount != null && (
                    <span className="db-deck-row__pill db-deck-row__pill--muted">
                        {classCount.classified} classified
                    </span>
                )}
                {dueCards != null && dueCards > 0 && (
                    <span className="db-deck-row__pill db-deck-row__pill--due">
                        {dueCards} due
                    </span>
                )}
                {dueCards === 0 && (
                    <span className="db-deck-row__pill db-deck-row__pill--done">all caught up</span>
                )}
            </div>
        </div>
    );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
    const navigate = useNavigate();
    const { goToProfile, goToDecks } = useAppNavigation();

    const { user } = useAuthStore();
    const userId = user?.id;
    const { profile, fetchProfile, updateProfile } = useProfileStore();

    const [showBriefing, setShowBriefing] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);

    useEffect(() => {
        if (userId && !profile) fetchProfile(userId);
    }, [userId, profile, fetchProfile]);

    // ── Data fetching — all in parallel ──────────────────────────────────────
    const { data: intelligence }                          = useSekelIntelligence(userId);
    const { data: examProfile }                           = useExamProfile();
    // Scope the plan to the current exam so a plan left over from a previous
    // exam doesn't surface here. Treat "no exam profile" as "no plan" too.
    const { data: rawActivePlan, isLoading: planLoad }    = useActivePlan(examProfile?.exam_key);
    const activePlanResult                                = examProfile === null ? null : rawActivePlan;
    const { data: planProgress }                          = usePlanProgress(activePlanResult?.plan);
    const { dueCount }                                    = useGlobalDashboardStats(userId);
    const { data: todaySummary }                          = useTodaySummary(userId);
    const { data: decks = [] }                            = useDecks();
    const { data: reviewHistory = [] }                    = useReviewHistory(userId);

    // ── Derived values ────────────────────────────────────────────────────────
    const intelligenceEnabled = profile?.intelligence_enabled ?? true;

    const hasExamDate = examProfile != null && isExamDateSet(examProfile.exam_date);
    const daysUntilExam = hasExamDate
        ? Math.floor((new Date(examProfile!.exam_date).getTime() - Date.now()) / 86_400_000)
        : null;

    const streak = computeStreak(reviewHistory);
    const completedToday = todaySummary?.totalReviews ?? 0;

    const hasActivePlan = activePlanResult != null;
    const studiedToday  = planProgress?.studiedToday ?? 0;
    const planTarget    = activePlanResult?.plan.cardsPerDay ?? 0;
    const onPace        = !hasActivePlan || studiedToday >= planTarget;

    const todayRetention = todaySummary && todaySummary.totalReviews > 0
        ? Math.round(((todaySummary.totalReviews - todaySummary.againCount) / todaySummary.totalReviews) * 100)
        : null;

    // Zone 3 — systems sorted by blueprint weight midpoint descending
    const readinessSystems = (intelligence?.systemBreakdown ?? [])
        .slice()
        .sort((a, b) => {
            const midA = (a.blueprintWeightMin + a.blueprintWeightMax) / 2;
            const midB = (b.blueprintWeightMin + b.blueprintWeightMax) / 2;
            return midB - midA;
        });

    const showReadiness = hasExamDate && !!intelligence?.hasClassifications && readinessSystems.length > 0;

    // Exam countdown sub-label
    const countdownSub = hasExamDate
        ? (hasActivePlan
            ? (onPace ? `On pace · ${examProfile!.exam_label}` : `Behind plan · ${examProfile!.exam_label}`)
            : examProfile!.exam_label)
        : null;

    return (
        <div className="dashboard">

            {/* ── Zone 1: Hero Row ──────────────────────────────────────────── */}
            <div className="db-hero" data-tour-id="dashboard-hero-row">
                <StatCard
                    label="Cards Due Today"
                    value={dueCount}
                    sub={completedToday > 0 ? `${completedToday} completed today` : 'None completed yet'}
                />
                <StatCard
                    label="Today's Activity"
                    value={todaySummary && todaySummary.totalReviews > 0 ? todaySummary.totalReviews : null}
                    unit={todaySummary && todaySummary.totalReviews === 1 ? 'card' : 'cards'}
                    sub={todaySummary && todaySummary.totalReviews > 0
                        ? [
                            todayRetention !== null ? `${todayRetention}% retention` : null,
                            todaySummary.totalTimeMs > 0 ? `${Math.round(todaySummary.totalTimeMs / 60000)}m study` : null,
                            todaySummary.newCount > 0 ? `${todaySummary.newCount} new` : null,
                        ].filter(Boolean).join(' · ')
                        : null}
                    emptyPrompt="No reviews yet today"
                    onEmptyClick={() => goToDecks()}
                />
                <StatCard
                    label="Study Streak"
                    value={streak > 0 ? streak : null}
                    unit={streak !== 1 ? 'days' : 'day'}
                    sub={streak > 0 ? 'consecutive' : null}
                    emptyPrompt={streak === 0 ? 'Start your streak today' : undefined}
                    onEmptyClick={() => goToDecks()}
                />
                <StatCard
                    label="Exam Countdown"
                    value={daysUntilExam !== null ? daysUntilExam : null}
                    unit="days"
                    sub={countdownSub}
                    emptyPrompt="Set your exam date"
                    onEmptyClick={() => goToProfile('study')}
                    highlight={hasActivePlan && !onPace ? 'warn' : undefined}
                />
            </div>

            {/* ── Zone 2: SEKEL Intelligence ────────────────────────────────── */}
            <div className="db-section" data-tour-id="dashboard-intelligence">
                {intelligence ? (
                    intelligenceEnabled ? (
                        <SekelIntelligencePanel
                            intelligence={intelligence}
                            onStartFocused={() => setShowBriefing(true)}
                            onHide={() => userId && updateProfile(userId, { intelligence_enabled: false })}
                            onGoToProfile={() => goToProfile('study')}
                            onGoToDecks={() => goToDecks()}
                        />
                    ) : (
                        <IntelligenceHiddenBar
                            onShow={() => userId && updateProfile(userId, { intelligence_enabled: true })}
                        />
                    )
                ) : null}
            </div>

            {/* Soft plan nudge — only when exam date set but no active plan */}
            {!planLoad && !hasActivePlan && hasExamDate && (
                <p className="dashboard-plan-nudge">
                    No study plan yet —{' '}
                    <button className="dashboard-plan-nudge__link" onClick={() => navigate('/plan')}>
                        build one to get daily targets →
                    </button>
                </p>
            )}

            {/* ── Plan Overview ───────────────────────────────────────────── */}
            <section className="dash-section" data-tour-id="dashboard-plan-overview">
                <div className="dash-section__row">
                    {/* Plan Overview */}
                    <div className="db-card">
                        <div className="db-card__header">
                            <h3 className="db-card__title">Plan Overview</h3>
                            {activePlanResult && (
                                <button
                                    className="db-card__subtitle-link"
                                    onClick={() => navigate('/plan')}
                                >
                                    View plan →
                                </button>
                            )}
                        </div>
                        {activePlanResult ? (
                            <div className="db-plan-overview">
                                <div className="db-plan-row">
                                    <span className="db-plan-row__label">Today's target</span>
                                    <span className="db-plan-row__value">
                                        {planProgress?.studiedToday ?? 0}
                                        <span className="db-plan-row__of"> / {activePlanResult.plan.cardsPerDay} new cards</span>
                                    </span>
                                </div>
                                <div className="db-plan-progress-bar">
                                    <div
                                        className="db-plan-progress-bar__fill"
                                        style={{
                                            width: `${Math.min(100, Math.round(((planProgress?.studiedToday ?? 0) / activePlanResult.plan.cardsPerDay) * 100))}%`,
                                        }}
                                    />
                                </div>
                                <div className="db-plan-stats">
                                    {planProgress != null && (
                                        <div className="db-plan-stat">
                                            <span className="db-plan-stat__value">{planProgress.studiedSincePlanStart}</span>
                                            <span className="db-plan-stat__label">introduced</span>
                                        </div>
                                    )}
                                    {planProgress != null && (
                                        <div className="db-plan-stat">
                                            <span className="db-plan-stat__value">{planProgress.currentUnseen}</span>
                                            <span className="db-plan-stat__label">unseen</span>
                                        </div>
                                    )}
                                    <div className="db-plan-stat">
                                        <span className="db-plan-stat__value">
                                            {Math.round(activePlanResult.plan.snapshot.projectedCoverage * 100)}%
                                        </span>
                                        <span className="db-plan-stat__label">proj. coverage</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                className="db-stat-card__empty-prompt"
                                onClick={() => navigate('/plan')}
                            >
                                Start a plan →
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* ── Your Decks ────────────────────────────────────────────────── */}
            {decks.length > 0 && (
                <section className="dash-section" data-tour-id="dashboard-deck-health">
                    <h3 className="dash-section__title">Your Decks</h3>
                    <div className="db-card">
                        <div className="db-card__header">
                            <h3 className="db-card__title">Deck Health</h3>
                            {!hasExamDate && (
                                <span className="db-card__subtitle">Set an exam date to see classification coverage</span>
                            )}
                        </div>
                        <div className="db-deck-list">
                            {decks.map(deck => (
                                <DeckHealthRow
                                    key={deck.id}
                                    deck={deck}
                                    userId={userId!}
                                    examKey={examProfile?.exam_key}
                                />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Exam Readiness ────────────────────────────────────────────── */}
            {showReadiness && (
                <section className="dash-section" data-tour-id="dashboard-exam-readiness">
                    <h3 className="dash-section__title">Exam Readiness</h3>
                    <div className="db-card db-card--readiness">
                        <div className="db-card__header">
                            <h3 className="db-card__title">By blueprint weight</h3>
                            <span className="db-card__subtitle">
                                {examProfile!.exam_label}
                            </span>
                        </div>
                        <div className="db-readiness-table">
                            <div className="db-readiness-header">
                                <span>System</span>
                                <span>Blueprint</span>
                                <span>Retention</span>
                                <span>Status</span>
                            </div>
                            {readinessSystems.map(system => {
                                const hasData = system.totalReviewsInWindow > 0;
                                const level   = readinessLevel(system.accuracy, hasData);
                                return (
                                    <div key={system.systemKey} className="db-readiness-row">
                                        <span className="db-readiness-row__name">{system.label}</span>
                                        <span className="db-readiness-row__weight">
                                            {Math.round(system.blueprintWeightMin)}–{Math.round(system.blueprintWeightMax)}%
                                        </span>
                                        <span className="db-readiness-row__pct">
                                            {hasData && system.accuracy !== null ? `${Math.round(system.accuracy * 100)}%` : '—'}
                                        </span>
                                        <span className={`db-readiness-row__indicator db-readiness-row__indicator--${level}`}>
                                            {READINESS_LABELS[level]}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Quick Actions ─────────────────────────────────────────────── */}
            <section className="dash-section" data-tour-id="dashboard-quick-actions">
                <h3 className="dash-section__title">Quick Actions</h3>
                <div className="dash-quick-actions__grid">
                    <button
                        className="db-action-btn"
                        onClick={() => {
                            const deckId = intelligence?.suggestedDeckId;
                            if (deckId) {
                                navigate(`/decks/${deckId}/study?mode=due`);
                            } else {
                                navigate('/decks');
                            }
                        }}
                    >
                        <BookOpen size={15} />
                        Start Today's Session
                    </button>
                    <button
                        className="db-action-btn"
                        onClick={() => navigate('/documents')}
                    >
                        <Zap size={15} />
                        Generate Flashcards
                    </button>
                    <button
                        className="db-action-btn"
                        onClick={() => navigate('/plan')}
                    >
                        <CalendarDays size={15} />
                        Go to Plan
                    </button>
                    <button
                        className="db-action-btn"
                        onClick={() => setShowFeedback(true)}
                    >
                        <MessageSquare size={15} />
                        Send Feedback
                    </button>
                </div>
            </section>

            {/* Feedback Modal */}
            {showFeedback && (
                <FeedbackSection isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
            )}

            {/* Pre-Session Briefing Modal */}
            {showBriefing && intelligence && (
                <PreSessionBriefing
                    intelligence={intelligence}
                    planDeckIds={activePlanResult?.plan.deckFilter ?? null}
                    onDismiss={() => setShowBriefing(false)}
                    onBegin={(deckId) => {
                        setShowBriefing(false);
                        const weakKeys = intelligence.systemBreakdown
                            .filter(s => s.accuracy !== null && s.accuracy < 0.80)
                            .map(s => s.systemKey);
                        const systemsParam = weakKeys.length > 0 ? `&systems=${weakKeys.join(',')}` : '';
                        navigate(`/decks/${deckId}/study?mode=due&focus=intelligence${systemsParam}`);
                    }}
                />
            )}
        </div>
    );
}
