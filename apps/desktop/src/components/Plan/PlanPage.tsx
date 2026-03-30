import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Plus, ChevronDown, ChevronUp, RotateCcw, Archive, Trash2, BookOpen } from 'lucide-react';
import { useExamProfile } from '../../hooks/useExamProfile';
import {
    useComputedSuggestion,
    useActivePlan,
    usePlans,
    useCreatePlan,
    useArchivePlan,
    useDeletePlan,
    useReactivatePlan,
    useSetPlanOverride,
    useClearPlanOverride,
    useDeckUnseenCounts,
    usePlanProgress,
    type Plan,
    type DeckUnseenCount,
} from '../../hooks/usePlan';
import { usePlanStore } from '../../stores/planStore';
import type { SystemCoverageRow } from '../../lib/queries';
import './PlanPage.css';

// ── Cohort math (mirrored from planService for live creation-panel preview) ───

const WEEKLY_MULTIPLIERS = [0.5, 0.9, 1.2];
const STEADY_STATE       = 1.5;

function weekMultiplier(week: number): number {
    if (week <= 0) return 0;
    const idx = week - 1;
    return idx < WEEKLY_MULTIPLIERS.length ? WEEKLY_MULTIPLIERS[idx] : STEADY_STATE;
}

function cumulativeReviews(week: number): number {
    let sum = 0;
    for (let w = 1; w <= week; w++) sum += weekMultiplier(w);
    return sum;
}

function clientDailyMinutes(n: number, week: number): number {
    return n * 0.75 + (n * cumulativeReviews(week) / 7) * 0.33;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function performanceColor(need: number): string {
    if (need >= 0.6) return 'perf-high';
    if (need >= 0.3) return 'perf-medium';
    return 'perf-low';
}

function defaultPlanName(): string {
    return `Plan · ${new Date().toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ── Override affordance ───────────────────────────────────────────────────────

function OverrideControl({ currentNewPerDay }: { currentNewPerDay: number }) {
    const { t }       = useTranslation();
    const [open, setOpen]   = useState(false);
    const [value, setValue] = useState(String(currentNewPerDay));
    const setOverride       = useSetPlanOverride();
    const clearOverride     = useClearPlanOverride();
    const hasOverride       = usePlanStore(s => s.hasOverride);

    function handleConfirm() {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n) && n > 0) {
            setOverride.mutate(n);
            setOpen(false);
        }
    }

    if (hasOverride) {
        return (
            <div className="plan-override-notice">
                <span>{t('plan.override_active')}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => clearOverride.mutate()}>
                    {t('plan.undo_override')}
                </button>
            </div>
        );
    }

    if (!open) {
        return (
            <button className="btn btn-ghost btn-sm plan-override-trigger" onClick={() => setOpen(true)}>
                {t('plan.override_today')}
            </button>
        );
    }

    return (
        <div className="plan-override-input">
            <span>{t('plan.override_study')}</span>
            <input
                type="number" min={1} max={200}
                value={value}
                onChange={e => setValue(e.target.value)}
                className="plan-override-number"
                autoFocus
            />
            <span>{t('plan.override_instead')}</span>
            <button className="btn btn-primary btn-sm" onClick={handleConfirm}>{t('plan.override_confirm')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        </div>
    );
}

// ── System coverage row ───────────────────────────────────────────────────────

function SystemRow({ sys }: { sys: SystemCoverageRow }) {
    const pctDisplay    = sys.totalCards > 0 ? `${sys.coveragePct}%` : '—';
    const weightDisplay = `${sys.blueprintWeightMidpoint.toFixed(0)}%`;

    return (
        <tr>
            <td className="plan-sys-name">{sys.label}</td>
            <td className="plan-sys-weight">{weightDisplay}</td>
            <td className="plan-sys-cards">{sys.cardsInPlan} / {sys.totalCards}</td>
            <td className="plan-sys-coverage">
                <div className="plan-coverage-bar-wrap">
                    <div className="plan-coverage-bar-fill" style={{ width: `${sys.coveragePct}%` }} />
                </div>
                <span>{pctDisplay}</span>
            </td>
            <td>
                <span className={`plan-perf-badge ${performanceColor(sys.performanceNeed)}`}>
                    {sys.performanceNeed >= 0.6 ? 'High' : sys.performanceNeed >= 0.3 ? 'Med' : 'Low'}
                </span>
            </td>
        </tr>
    );
}

// ── Active plan detail (sections 1–3) ─────────────────────────────────────────

function ScopeBadge({ deckFilter }: { deckFilter: string[] | null }) {
    const { t } = useTranslation();
    const { data: deckCounts = [] } = useDeckUnseenCounts();

    if (!deckFilter) {
        return <span className="plan-scope-badge plan-scope-all">{t('plan.scope_all')}</span>;
    }

    const names = deckFilter
        .map(id => deckCounts.find(d => d.deckId === id)?.name ?? id)
        .join(', ');

    return (
        <span
            className="plan-scope-badge plan-scope-filtered"
            title={names}
        >
            {t('plan.scope_n_decks', { n: deckFilter.length })}
        </span>
    );
}

function ActivePlanDetail({ plan, examLabel }: { plan: Plan; examLabel: string }) {
    const { t } = useTranslation();
    const snapshot   = plan.snapshot;
    const coveragePct = Math.round(snapshot.projectedCoverage * 100);
    const diverged    = plan.cardsPerDay !== plan.suggestedPerDay;
    const { data: progress } = usePlanProgress(plan);
    const hasClassifiedCards = snapshot.systemCoverage.some(s => s.totalCards > 0);

    return (
        <>
            {/* ── Summary hero ──────────────────────────────────────────────── */}
            <section className="plan-card plan-summary">
                <div className="plan-summary-meta">
                    <span className="plan-exam-label">
                        {examLabel} · {snapshot.availableDays} {t('plan.days_away')}
                    </span>
                    <span className="plan-unseen-count">
                        {snapshot.unseenTotal.toLocaleString()} {t('plan.unseen_cards')}
                    </span>
                </div>

                <div className="plan-summary-hero">
                    <div className="plan-hero-number">
                        <span className="plan-big-number">{plan.cardsPerDay}</span>
                        <span className="plan-big-label">{t('plan.new_cards_per_day')}</span>
                        {diverged && (
                            <span className="plan-suggested-note">
                                {t('plan.suggested_was', { n: plan.suggestedPerDay })}
                            </span>
                        )}
                    </div>
                    <div className="plan-hero-meta">
                        <div className="plan-meta-row">
                            <span className="plan-meta-label">{t('plan.peak_daily_time')}</span>
                            <span className="plan-meta-value">{fmtMinutes(snapshot.projectedPeakDailyMinutes)}</span>
                        </div>
                        <div className="plan-meta-row">
                            <span className="plan-meta-label">{t('plan.daily_budget')}</span>
                            <span className="plan-meta-value">{fmtMinutes(snapshot.dailyTimeBudgetMinutes)}</span>
                        </div>
                        <div className="plan-meta-row">
                            <span className="plan-meta-label">{t('plan.committed_on')}</span>
                            <span className="plan-meta-value">{fmtDate(plan.createdAt)}</span>
                        </div>
                        <div className="plan-meta-row">
                            <span className="plan-meta-label">{t('plan.scope')}</span>
                            <ScopeBadge deckFilter={plan.deckFilter} />
                        </div>
                    </div>
                </div>

                <p className="plan-coverage-statement">
                    {t('plan.coverage_statement', {
                        covered: snapshot.projectedCoverageCount.toLocaleString(),
                        total:   snapshot.unseenTotal.toLocaleString(),
                        pct:     coveragePct,
                    })}
                </p>

                <div className="plan-coverage-progress">
                    <div className="plan-progress-bar">
                        <div className="plan-progress-fill" style={{ width: `${coveragePct}%` }} />
                    </div>
                    <span className="plan-progress-label">{coveragePct}%</span>
                </div>

                <div className="plan-yield-breakdown">
                    <span className="plan-yield-chip yield-high">{snapshot.unseenHighYield} {t('plan.yield_high')}</span>
                    <span className="plan-yield-chip yield-medium">{snapshot.unseenMediumYield} {t('plan.yield_medium')}</span>
                    <span className="plan-yield-chip yield-low">{snapshot.unseenLowYield} {t('plan.yield_low')}</span>
                    {snapshot.unseenUnclassified > 0 && (
                        <span className="plan-yield-chip yield-unclassified">{snapshot.unseenUnclassified} {t('plan.yield_unclassified')}</span>
                    )}
                </div>

                {/* ── Live progress ─────────────────────────────────────────── */}
                {progress != null && (
                    <div className="plan-progress-section">
                        <div className="plan-progress-header">
                            <span className="plan-progress-title">{t('plan.progress_title')}</span>
                            <span className="plan-progress-fraction">
                                {progress.studiedSincePlanStart.toLocaleString()} / {snapshot.unseenTotal.toLocaleString()}
                            </span>
                        </div>
                        <div className="plan-progress-track">
                            {(() => {
                                const pct = snapshot.unseenTotal > 0
                                    ? Math.min(100, Math.round((progress.studiedSincePlanStart / snapshot.unseenTotal) * 100))
                                    : 0;
                                const colorClass = pct >= 100 ? 'plan-progress-fill--complete'
                                    : pct >= 66  ? 'plan-progress-fill--good'
                                    : pct >= 33  ? 'plan-progress-fill--mid'
                                    :              'plan-progress-fill--early';
                                return (
                                    <div
                                        className={`plan-progress-track-fill ${colorClass}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                );
                            })()}
                        </div>
                        <div className="plan-progress-stats">
                            <div className="plan-progress-stat">
                                <span className="plan-progress-stat-value">{progress.studiedSincePlanStart.toLocaleString()}</span>
                                <span className="plan-progress-stat-label">{t('plan.progress_introduced')}</span>
                            </div>
                            <div className="plan-progress-stat">
                                <span className="plan-progress-stat-value">{progress.currentUnseen.toLocaleString()}</span>
                                <span className="plan-progress-stat-label">{t('plan.progress_remaining')}</span>
                            </div>
                            <div className="plan-progress-stat">
                                <span className="plan-progress-stat-value">
                                    {progress.studiedToday}
                                    <span className="plan-progress-stat-target"> / {plan.cardsPerDay}</span>
                                </span>
                                <span className="plan-progress-stat-label">{t('plan.progress_today')}</span>
                            </div>
                        </div>
                    </div>
                )}

                <OverrideControl currentNewPerDay={plan.cardsPerDay} />
            </section>

            {/* ── Weekly projection ─────────────────────────────────────────── */}
            <section className="plan-card">
                <h3 className="plan-section-title">{t('plan.weekly_projection_title')}</h3>
                <div className="plan-table-wrap">
                    <table className="plan-table">
                        <thead>
                            <tr>
                                <th>{t('plan.col_week')}</th>
                                <th>{t('plan.col_new_per_day')}</th>
                                <th>{t('plan.col_reviews_per_day')}</th>
                                <th>{t('plan.col_daily_time')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {snapshot.weeklyProjection.map(row => (
                                <tr key={row.week}>
                                    <td>{t('plan.week_n', { n: row.week })}</td>
                                    <td>{row.newCardsPerDay}</td>
                                    <td>{row.estimatedReviewsPerDay}</td>
                                    <td>{fmtMinutes(row.estimatedTotalMinutes)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── System coverage ───────────────────────────────────────────── */}
            {snapshot.systemCoverage.length > 0 && (
                <section className="plan-card">
                    <h3 className="plan-section-title">{t('plan.system_coverage_title')}</h3>
                    {hasClassifiedCards ? (
                        <div className="plan-table-wrap">
                            <table className="plan-table plan-sys-table">
                                <thead>
                                    <tr>
                                        <th>{t('plan.col_system')}</th>
                                        <th>{t('plan.col_blueprint_pct')}</th>
                                        <th>{t('plan.col_cards_in_plan')}</th>
                                        <th>{t('plan.col_coverage')}</th>
                                        <th>{t('plan.col_performance_need')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshot.systemCoverage.map(sys => (
                                        <SystemRow key={sys.systemKey} sys={sys} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="plan-coverage-empty">
                            <BookOpen size={32} className="plan-coverage-empty-icon" />
                            <p className="plan-coverage-empty-title">{t('plan.coverage_unclassified_title')}</p>
                            <p className="plan-coverage-empty-desc">{t('plan.coverage_unclassified_desc')}</p>
                        </div>
                    )}
                </section>
            )}
        </>
    );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ plan }: { plan: Plan }) {
    const { t }          = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const reactivate     = useReactivatePlan();
    const remove         = useDeletePlan();
    const snapshot       = plan.snapshot;
    const coveragePct    = Math.round(snapshot.projectedCoverage * 100);

    return (
        <div className="plan-history-row">
            <div className="plan-history-summary">
                <div className="plan-history-left">
                    <span className="plan-history-name">{plan.name}</span>
                    <span className="plan-history-meta">
                        {fmtDate(plan.createdAt)} · {plan.cardsPerDay} {t('plan.cards_day_short')} · {coveragePct}%
                    </span>
                </div>
                <div className="plan-history-actions">
                    <button
                        className="btn btn-ghost btn-sm"
                        title={t('plan.reactivate')}
                        onClick={() => reactivate.mutate(plan.id)}
                        disabled={reactivate.isPending}
                    >
                        <RotateCcw size={14} />
                        {t('plan.reactivate')}
                    </button>
                    <button
                        className="btn btn-ghost btn-sm plan-history-delete"
                        title={t('plan.delete_plan')}
                        onClick={() => remove.mutate(plan.id)}
                        disabled={remove.isPending}
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpanded(v => !v)}
                        aria-label={expanded ? t('plan.collapse') : t('plan.expand')}
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="plan-history-detail">
                    <div className="plan-history-stats">
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.committed_rate')}</span>
                            <span className="plan-history-stat-value">{plan.cardsPerDay}</span>
                        </div>
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.suggested_rate')}</span>
                            <span className="plan-history-stat-value">{plan.suggestedPerDay}</span>
                        </div>
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.coverage')}</span>
                            <span className="plan-history-stat-value">{coveragePct}%</span>
                        </div>
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.peak_daily_time')}</span>
                            <span className="plan-history-stat-value">{fmtMinutes(snapshot.projectedPeakDailyMinutes)}</span>
                        </div>
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.unseen_at_creation')}</span>
                            <span className="plan-history-stat-value">{snapshot.unseenTotal.toLocaleString()}</span>
                        </div>
                        <div className="plan-history-stat">
                            <span className="plan-history-stat-label">{t('plan.days_remaining_at_creation')}</span>
                            <span className="plan-history-stat-value">{snapshot.availableDays}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Creation panel ────────────────────────────────────────────────────────────

function DeckPicker({
    deckCounts,
    selectedIds,
    onChange,
}: {
    deckCounts: DeckUnseenCount[];
    selectedIds: string[] | null;
    onChange: (ids: string[] | null) => void;
}) {
    const { t } = useTranslation();
    const isAllDecks = selectedIds === null;

    function toggleAllDecks() {
        if (isAllDecks) {
            // Switch to selective mode: pre-select all decks so user can uncheck specific ones
            onChange(deckCounts.map(d => d.deckId));
        } else {
            onChange(null);
        }
    }

    function toggleDeck(deckId: string, checked: boolean) {
        const current = selectedIds ?? deckCounts.map(d => d.deckId);
        onChange(checked ? [...current, deckId] : current.filter(id => id !== deckId));
    }

    return (
        <div className="plan-deck-picker">
            <div className="plan-deck-picker-header">
                <span className="plan-deck-picker-title">{t('plan.scope_label')}</span>
                <label className="plan-deck-picker-all">
                    <input
                        type="checkbox"
                        checked={isAllDecks}
                        onChange={toggleAllDecks}
                    />
                    <span>{t('plan.scope_all_decks')}</span>
                    <span className="plan-deck-unseen-total">
                        {deckCounts.reduce((s, d) => s + d.unseenCount, 0).toLocaleString()} {t('plan.unseen_cards')}
                    </span>
                </label>
            </div>

            {!isAllDecks && (
                <div className="plan-deck-picker-list">
                    {deckCounts.map(deck => {
                        const checked = selectedIds?.includes(deck.deckId) ?? false;
                        return (
                            <label key={deck.deckId} className={`plan-deck-picker-item ${!checked ? 'plan-deck-picker-item--unchecked' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => toggleDeck(deck.deckId, e.target.checked)}
                                />
                                <span className="plan-deck-picker-name">{deck.name}</span>
                                <span className="plan-deck-unseen">{deck.unseenCount.toLocaleString()} {t('plan.unseen_cards')}</span>
                            </label>
                        );
                    })}
                    {selectedIds?.length === 0 && (
                        <p className="plan-deck-picker-warning">{t('plan.scope_no_decks_warning')}</p>
                    )}
                </div>
            )}
        </div>
    );
}

function CreatePlanPanel({
    examKey,
    examLabel,
    onDone,
    onCancel,
}: {
    examKey: string;
    examLabel: string;
    onDone: () => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();

    // Deck scope state
    const { data: deckCounts = [] } = useDeckUnseenCounts();
    const [selectedDeckIds, setSelectedDeckIds] = useState<string[] | null>(null); // null = all

    // Debounce deck selection before firing the suggestion query (300 ms)
    const [debouncedDeckIds, setDebouncedDeckIds] = useState<string[] | null>(null);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDeckIds(selectedDeckIds), 300);
        return () => clearTimeout(timer);
    }, [selectedDeckIds]);

    const { data: suggestion, isLoading, isFetching } = useComputedSuggestion(examKey, debouncedDeckIds, true);

    const suggestedRate = suggestion?.recommendedNewPerDay ?? 20;
    const [cardsPerDay, setCardsPerDay] = useState<number | null>(null);
    const [name, setName]               = useState(defaultPlanName());
    const createPlan                    = useCreatePlan();

    // Reset slider to new suggestion whenever the suggestion changes
    useEffect(() => {
        if (suggestion) setCardsPerDay(null);
    }, [suggestion?.recommendedNewPerDay]);

    // Use suggestion as default once loaded
    const effectiveRate = cardsPerDay ?? suggestedRate;
    const noDeckSelected = Array.isArray(selectedDeckIds) && selectedDeckIds.length === 0;

    // Live stats computed client-side so the slider is instant
    const liveStats = useMemo(() => {
        if (!suggestion) return null;
        const { unseenTotal, availableDays } = suggestion;
        const projectedCount = Math.min(unseenTotal, effectiveRate * availableDays);
        const coveragePct    = unseenTotal > 0 ? Math.round((projectedCount / unseenTotal) * 100) : 100;
        const peakMinutes    = Math.round(clientDailyMinutes(effectiveRate, 8));
        const weeklyPreview  = Array.from({ length: Math.min(Math.ceil(availableDays / 7), 8) }, (_, i) => {
            const week = i + 1;
            const reviews = Math.round((effectiveRate * cumulativeReviews(week)) / 7);
            const mins    = Math.round(clientDailyMinutes(effectiveRate, week));
            return { week, reviews, mins };
        });
        return { projectedCount, coveragePct, peakMinutes, weeklyPreview, unseenTotal, availableDays };
    }, [suggestion, effectiveRate]);

    async function handleCommit() {
        if (!suggestion) return;
        createPlan.mutate(
            { examKey, cardsPerDay: effectiveRate, name: name.trim() || defaultPlanName(), snapshot: suggestion },
            { onSuccess: () => onDone() },
        );
    }

    if (isLoading) {
        return (
            <div className="plan-page">
                <div className="plan-create-header">
                    <button className="btn btn-ghost btn-sm" onClick={onCancel}>← {t('common.back')}</button>
                    <h2>{t('plan.create_title')}</h2>
                </div>
                <div className="plan-empty-state"><p>{t('common.loading_app')}</p></div>
            </div>
        );
    }

    if (!suggestion) {
        return (
            <div className="plan-page">
                <div className="plan-create-header">
                    <button className="btn btn-ghost btn-sm" onClick={onCancel}>← {t('common.back')}</button>
                    <h2>{t('plan.create_title')}</h2>
                </div>
                <div className="plan-empty-state"><p>{t('plan.no_exam_profile')}</p></div>
            </div>
        );
    }

    return (
        <div className="plan-page">
            <div className="plan-create-header">
                <button className="btn btn-ghost btn-sm" onClick={onCancel}>← {t('common.back')}</button>
                <h2>{t('plan.create_title')}</h2>
            </div>

            <div className="plan-create-body">
                {/* ── Context ──────────────────────────────────────────────── */}
                <div className="plan-create-context">
                    <span className="plan-exam-label">{examLabel}</span>
                    <span className="plan-unseen-count">
                        {suggestion.availableDays} {t('plan.days_away')} · {suggestion.unseenTotal.toLocaleString()} {t('plan.unseen_cards')}
                    </span>
                </div>

                {/* ── Deck scope picker ─────────────────────────────────────── */}
                <DeckPicker
                    deckCounts={deckCounts}
                    selectedIds={selectedDeckIds}
                    onChange={setSelectedDeckIds}
                />

                {noDeckSelected && (
                    <p className="plan-deck-picker-warning">{t('plan.scope_no_decks_warning')}</p>
                )}

                {/* ── Suggestion callout ────────────────────────────────────── */}
                <div className={`plan-suggestion-callout${isFetching ? ' plan-suggestion-loading' : ''}`}>
                    <div className="plan-suggestion-label">{t('plan.suggestion_label')}</div>
                    <div className="plan-suggestion-rate">
                        <span className="plan-big-number">{suggestedRate}</span>
                        <span className="plan-big-label">{t('plan.new_cards_per_day')}</span>
                    </div>
                    <p className="plan-suggestion-desc">
                        {t('plan.suggestion_desc', {
                            pct:  liveStats ? (cardsPerDay === null ? liveStats.coveragePct : liveStats.coveragePct) : '—',
                            mins: liveStats ? fmtMinutes(liveStats.peakMinutes) : '—',
                        })}
                    </p>
                </div>

                {/* ── Slider ───────────────────────────────────────────────── */}
                <div className="plan-slider-section">
                    <div className="plan-slider-header">
                        <span className="plan-slider-label">{t('plan.adjust_label')}</span>
                        <span className="plan-slider-value">{effectiveRate}</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={Math.min(100, Math.max(suggestedRate * 2, 50))}
                        value={effectiveRate}
                        onChange={e => setCardsPerDay(Number(e.target.value))}
                        className="plan-slider"
                    />
                    <div className="plan-slider-ticks">
                        <span>1</span>
                        <span>{Math.round(suggestedRate / 2)}</span>
                        <span className="plan-slider-tick-suggested">{suggestedRate} ({t('plan.suggested')})</span>
                        <span>{Math.min(100, suggestedRate * 2)}</span>
                    </div>
                </div>

                {/* ── Live preview ──────────────────────────────────────────── */}
                {liveStats && (
                    <div className="plan-live-preview">
                        <div className="plan-live-stats">
                            <div className="plan-live-stat">
                                <span className="plan-live-stat-label">{t('plan.coverage')}</span>
                                <span className="plan-live-stat-value">{liveStats.coveragePct}%</span>
                                <span className="plan-live-stat-sub">
                                    {liveStats.projectedCount.toLocaleString()} / {liveStats.unseenTotal.toLocaleString()} {t('plan.cards')}
                                </span>
                            </div>
                            <div className="plan-live-stat">
                                <span className="plan-live-stat-label">{t('plan.peak_daily_time')}</span>
                                <span className="plan-live-stat-value">{fmtMinutes(liveStats.peakMinutes)}</span>
                                <span className="plan-live-stat-sub">{t('plan.at_peak_week')}</span>
                            </div>
                        </div>

                        {/* Mini weekly projection */}
                        <div className="plan-preview-table-wrap">
                            <table className="plan-table plan-preview-table">
                                <thead>
                                    <tr>
                                        <th>{t('plan.col_week')}</th>
                                        <th>{t('plan.col_new_per_day')}</th>
                                        <th>{t('plan.col_reviews_per_day')}</th>
                                        <th>{t('plan.col_daily_time')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liveStats.weeklyPreview.map(row => (
                                        <tr key={row.week}>
                                            <td>{t('plan.week_n', { n: row.week })}</td>
                                            <td>{effectiveRate}</td>
                                            <td>{row.reviews}</td>
                                            <td>{fmtMinutes(row.mins)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Name input ────────────────────────────────────────────── */}
                <div className="plan-name-section">
                    <label className="plan-name-label" htmlFor="plan-name">{t('plan.name_label')}</label>
                    <input
                        id="plan-name"
                        type="text"
                        className="plan-name-input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={defaultPlanName()}
                        maxLength={80}
                    />
                </div>

                {/* ── Actions ───────────────────────────────────────────────── */}
                <div className="plan-create-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleCommit}
                        disabled={createPlan.isPending || noDeckSelected || isFetching}
                    >
                        {createPlan.isPending ? t('plan.committing') : t('plan.commit')}
                    </button>
                    <button className="btn btn-ghost" onClick={onCancel}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── No exam state ─────────────────────────────────────────────────────────────

function NoExamState() {
    const { t } = useTranslation();
    return (
        <div className="plan-page">
            <div className="page-header">
                <h2>{t('plan.title')}</h2>
            </div>
            <div className="plan-empty-state plan-empty-no-exam">
                <CalendarDays size={48} className="plan-empty-icon" />
                <h3>{t('plan.no_exam_title')}</h3>
                <p>{t('plan.no_exam_profile')}</p>
            </div>
        </div>
    );
}

// ── No plans state ────────────────────────────────────────────────────────────

function NoPlansState({ onCreatePlan }: { onCreatePlan: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="plan-page">
            <div className="page-header">
                <h2>{t('plan.title')}</h2>
            </div>
            <div className="plan-empty-state plan-empty-no-plans">
                <CalendarDays size={48} className="plan-empty-icon" />
                <h3>{t('plan.no_plans_title')}</h3>
                <p>{t('plan.no_plans_desc')}</p>
                <button className="btn btn-primary plan-empty-cta" onClick={onCreatePlan}>
                    <Plus size={16} />
                    {t('plan.create_first_plan')}
                </button>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanPage() {
    const { t } = useTranslation();
    const [isCreating, setIsCreating] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const { data: examProfile, isLoading: examLoading } = useExamProfile();
    const examKey   = examProfile?.exam_key ?? null;
    const examLabel = examProfile?.exam_label ?? '';

    const { data: activePlanResult, isLoading: activePlanLoading } = useActivePlan(examKey);
    const { data: allPlans = [],   isLoading: plansLoading }       = usePlans();

    const archivePlanMutation = useArchivePlan();

    const activePlan  = activePlanResult?.plan ?? null;
    const archivedPlans = allPlans.filter(p => p.status === 'archived');
    const isLoading   = examLoading || activePlanLoading || plansLoading;

    // Creation panel
    if (isCreating && examKey) {
        return (
            <CreatePlanPanel
                examKey={examKey}
                examLabel={examLabel}
                onDone={() => setIsCreating(false)}
                onCancel={() => setIsCreating(false)}
            />
        );
    }

    // No exam profile
    if (!isLoading && !examProfile) return <NoExamState />;

    // Loading
    if (isLoading) {
        return (
            <div className="plan-page">
                <div className="page-header"><h2>{t('plan.title')}</h2></div>
                <div className="plan-empty-state"><p>{t('common.loading_app')}</p></div>
            </div>
        );
    }

    // No plans yet
    if (!activePlan) return <NoPlansState onCreatePlan={() => setIsCreating(true)} />;

    return (
        <div className="plan-page">
            {/* ── Page header ──────────────────────────────────────────────── */}
            <div className="page-header plan-page-header">
                <div>
                    <h2>{t('plan.title')}</h2>
                    <p className="text-muted">{activePlan.name}</p>
                </div>
                <div className="plan-header-actions">
                    <button
                        className="btn btn-ghost btn-sm"
                        title={t('plan.archive_active')}
                        onClick={() => archivePlanMutation.mutate(activePlan.id)}
                        disabled={archivePlanMutation.isPending}
                    >
                        <Archive size={15} />
                        {t('plan.archive_active')}
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
                        <Plus size={15} />
                        {t('plan.new_plan')}
                    </button>
                </div>
            </div>

            {/* ── Active plan detail ───────────────────────────────────────── */}
            <ActivePlanDetail plan={activePlan} examLabel={examLabel} />

            {/* ── Plan history ─────────────────────────────────────────────── */}
            {archivedPlans.length > 0 && (
                <section className="plan-card plan-history-section">
                    <button
                        className="plan-history-toggle"
                        onClick={() => setHistoryOpen(v => !v)}
                    >
                        <span className="plan-section-title">{t('plan.history_title')} ({archivedPlans.length})</span>
                        {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {historyOpen && (
                        <div className="plan-history-list">
                            {archivedPlans.map(p => (
                                <HistoryRow key={p.id} plan={p} />
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
