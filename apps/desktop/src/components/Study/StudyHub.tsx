import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Calendar, Layers, BookOpen, Target, Clock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useActivePlan } from '../../hooks/usePlan';
import { useDecks } from '../../hooks/useDecks';
import { useDeckDueCounts } from '../../hooks/useDeckDueCounts';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import type { Deck } from '../../lib/types';
import './StudyHub.css';

// Rough queue-length → minutes estimate for the pre-session summary. Deliberately
// conservative; the real pace varies per user and the timer tracks the truth.
const SECONDS_PER_CARD = 15;

function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
}

function weightLabel(min: number, max: number): string {
    return `${Math.round(min)}–${Math.round(max)}%`;
}

function accuracyColor(accuracy: number): string {
    if (accuracy < 0.70) return 'var(--danger)';
    if (accuracy < 0.85) return 'var(--warning)';
    return 'var(--teal)';
}

/**
 * The routed /study hub (SEKEL-137) — the pre-session summary that launches the
 * two cross-deck modes. It adapts to whether the user's cards are classified:
 * Review All always works; Focused unlocks once SEKEL Intelligence has weak
 * systems to target.
 */
export default function StudyHub() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const emphasizeFocused = searchParams.get('intent') === 'focused';

    const userId = useAuthStore((s) => s.user?.id);
    const { data: intelligence } = useSekelIntelligence(userId);
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;
    const { data: activePlan } = useActivePlan(examKey);
    const { data: decks = [] } = useDecks();
    const { byDeck } = useDeckDueCounts();
    const { goToCrossDeckSession } = useAppNavigation();

    // Scope: default to the active plan's decks when a plan exists, else all decks.
    // The user can override with the toggle; the override sticks until they leave.
    const hasPlan = !!activePlan;
    const [scopePref, setScopePref] = useState<'plan' | 'all' | null>(null);
    const scope: 'plan' | 'all' = scopePref ?? (hasPlan ? 'plan' : 'all');

    const planDeckIds = activePlan?.plan.deckFilter ?? null;
    const scopeDeckIds = scope === 'all' ? null : planDeckIds;
    const scopedDecks: Deck[] = scopeDeckIds === null
        ? decks
        : decks.filter((d) => scopeDeckIds.includes(d.id));

    // Per-deck actionable counts (new + learning + review), already daily-limit
    // capped by useDeckDueCounts → matches what the session will actually serve.
    let totalNew = 0, totalLearning = 0, totalReview = 0;
    const perDeck = scopedDecks.map((deck) => {
        const s = byDeck.get(deck.id);
        const nw = s?.newCount ?? 0;
        const lr = s?.learningCount ?? 0;
        const rv = s?.reviewCount ?? 0;
        totalNew += nw; totalLearning += lr; totalReview += rv;
        return { deck, actionable: nw + lr + rv };
    });
    const reviewAllCount = totalNew + totalLearning + totalReview;
    const estMinutes = Math.max(1, Math.round((reviewAllCount * SECONDS_PER_CARD) / 60));

    // Weak-system (Focused) targeting from SEKEL Intelligence.
    const hasClassifications = intelligence?.hasClassifications ?? false;
    const breakdown = intelligence?.systemBreakdown ?? [];
    type Tested = typeof breakdown[number] & { accuracy: number };
    const weakSystems = breakdown
        .filter((s): s is Tested => s.accuracy !== null && s.accuracy < 0.80)
        .sort((a, b) => {
            const scoreA = (1 - a.accuracy) * ((a.blueprintWeightMin + a.blueprintWeightMax) / 2);
            const scoreB = (1 - b.accuracy) * ((b.blueprintWeightMin + b.blueprintWeightMax) / 2);
            return scoreB - scoreA;
        });
    const weakSystemKeys = weakSystems.map((s) => s.systemKey);
    const focusedCount = intelligence?.focusedDueCountAllDecks ?? 0;
    const focusedAvailable = hasClassifications && weakSystemKeys.length > 0;

    const daysUntilExam = intelligence?.daysUntilExam ?? null;
    const examLabel = intelligence?.examLabel ?? null;

    const beginReviewAll = () => goToCrossDeckSession({ scope });
    const beginFocused = () => goToCrossDeckSession({ scope, focus: true, systemKeys: weakSystemKeys });

    return (
        <div className="study-hub" data-testid="study-hub">
            <div className="study-hub__header">
                <div>
                    <h1 className="page-title">{t('nav.study', { defaultValue: 'Study' })}</h1>
                    <p className="study-hub__subtitle">
                        {t('studyHub.subtitle', { defaultValue: 'Review across your decks — everything due, or just your weak systems.' })}
                    </p>
                </div>
                {daysUntilExam !== null && examLabel && (
                    <div className="study-hub__exam-chip">
                        <Calendar size={14} />
                        <span>{daysUntilExam} {t('studyHub.days_until', { defaultValue: 'days until' })} {examLabel}</span>
                    </div>
                )}
            </div>

            {/* Scope toggle — only meaningful when a plan scopes a subset of decks */}
            {hasPlan && planDeckIds && planDeckIds.length > 0 && (
                <div className="study-hub__scope" role="tablist" aria-label={t('studyHub.scope_label', { defaultValue: 'Deck scope' })}>
                    <button
                        role="tab"
                        aria-selected={scope === 'plan'}
                        className={`study-hub__scope-btn ${scope === 'plan' ? 'is-active' : ''}`}
                        onClick={() => setScopePref('plan')}
                    >
                        {t('studyHub.scope_plan', { defaultValue: 'Plan decks' })}
                    </button>
                    <button
                        role="tab"
                        aria-selected={scope === 'all'}
                        className={`study-hub__scope-btn ${scope === 'all' ? 'is-active' : ''}`}
                        onClick={() => setScopePref('all')}
                    >
                        {t('studyHub.scope_all', { defaultValue: 'All decks' })}
                    </button>
                </div>
            )}

            {/* Summary triad */}
            <div className="study-hub__summary">
                <div className="study-hub__stat">
                    <span className="study-hub__stat-value" style={{ color: 'var(--teal)' }}>{reviewAllCount}</span>
                    <span className="study-hub__stat-label">{t('studyHub.total_due', { defaultValue: 'cards due' })}</span>
                </div>
                <div className="study-hub__stat study-hub__stat--split">
                    <span className="study-hub__split-item"><em>{totalNew}</em> {t('studyHub.split_new', { defaultValue: 'new' })}</span>
                    <span className="study-hub__split-item"><em>{totalLearning}</em> {t('studyHub.split_learning', { defaultValue: 'learning' })}</span>
                    <span className="study-hub__split-item"><em>{totalReview}</em> {t('studyHub.split_review', { defaultValue: 'review' })}</span>
                </div>
                <div className="study-hub__stat">
                    <span className="study-hub__stat-value study-hub__stat-value--sm">
                        <Clock size={16} /> {t('studyHub.est_time', { defaultValue: '~{{min}} min', min: estMinutes })}
                    </span>
                    <span className="study-hub__stat-label">{t('studyHub.est_label', { defaultValue: 'estimated' })}</span>
                </div>
            </div>

            <div className="study-hub__modes">
                {/* Review All */}
                <div className="study-hub__mode-card">
                    <div className="study-hub__mode-head">
                        <BookOpen size={18} className="study-hub__mode-icon" />
                        <div>
                            <h3 className="study-hub__mode-title">{t('study.review_all_title', { defaultValue: 'Review All' })}</h3>
                            <p className="study-hub__mode-desc">
                                {t('studyHub.review_all_desc', { defaultValue: 'Every due card across your decks, interleaved.' })}
                            </p>
                        </div>
                    </div>

                    {perDeck.length > 0 && (
                        <div className="study-hub__per-deck">
                            {perDeck.map(({ deck, actionable }) => (
                                <div key={deck.id} className="study-hub__per-deck-row">
                                    <span className="study-hub__per-deck-name">{deck.name}</span>
                                    <span className={`study-hub__per-deck-count ${actionable === 0 ? 'is-zero' : ''}`}>{actionable}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        className="study-hub__begin study-hub__begin--primary"
                        onClick={beginReviewAll}
                        disabled={reviewAllCount === 0}
                        data-testid="begin-review-all"
                    >
                        {t('studyHub.begin_review_all', { defaultValue: 'Begin Review All ({{count}}) →', count: reviewAllCount })}
                    </button>
                </div>

                {/* Focused (SEKEL Intelligence) */}
                <div className={`study-hub__mode-card ${!focusedAvailable ? 'is-locked' : ''} ${emphasizeFocused && focusedAvailable ? 'is-emphasized' : ''}`}>
                    <div className="study-hub__mode-head">
                        <Sparkles size={18} className="study-hub__mode-icon study-hub__mode-icon--teal" />
                        <div>
                            <h3 className="study-hub__mode-title">{t('study.focused_title', { defaultValue: 'Focused Session' })}</h3>
                            <p className="study-hub__mode-desc">
                                {t('studyHub.focused_desc', { defaultValue: 'Due cards in the blueprint systems you are weakest in.' })}
                            </p>
                        </div>
                    </div>

                    {focusedAvailable ? (
                        <>
                            <div className="study-hub__weak-systems">
                                {weakSystems.map((s) => (
                                    <div key={s.systemKey} className="study-hub__weak-row">
                                        <span className="study-hub__weak-name">{s.label}</span>
                                        <div className="study-hub__weak-bar-wrap">
                                            <div
                                                className="study-hub__weak-bar"
                                                style={{ width: pct(s.accuracy), background: accuracyColor(s.accuracy) }}
                                            />
                                        </div>
                                        <span className="study-hub__weak-pct" style={{ color: accuracyColor(s.accuracy) }}>{pct(s.accuracy)}</span>
                                        <span className="study-hub__weak-meta">
                                            <Layers size={11} /> {weightLabel(s.blueprintWeightMin, s.blueprintWeightMax)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <button
                                className="study-hub__begin study-hub__begin--teal"
                                onClick={beginFocused}
                                disabled={focusedCount === 0}
                                data-testid="begin-focused"
                            >
                                {t('studyHub.begin_focused', { defaultValue: 'Begin Focused ({{count}}) →', count: focusedCount })}
                            </button>
                        </>
                    ) : (
                        <div className="study-hub__locked">
                            <Target size={16} />
                            <p>{t('studyHub.classify_to_unlock', { defaultValue: 'Classify your cards to unlock focused weak-system sessions.' })}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
