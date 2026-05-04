import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Plus, ChevronDown, ChevronUp, RotateCcw, Archive, Trash2, BookOpen, LayoutList, AlertTriangle, GraduationCap } from 'lucide-react';
import { useToast } from '../UI';
import { useAppNavigation } from '../../hooks/useAppNavigation';
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
    type PlanProgress,
    type PlanActivityCounts,
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

// ── System coverage card (grid item with circular progress ring) ────────────

function SystemCard({ sys }: { sys: SystemCoverageRow }) {
    const isUnclassified = sys.totalCards === 0;
    const status: 'high' | 'medium' | 'low' | 'unclassified' = isUnclassified
        ? 'unclassified'
        : sys.performanceNeed >= 0.6 ? 'high'
        : sys.performanceNeed >= 0.3 ? 'medium'
        :                              'low';
    const statusLabel =
        status === 'high'         ? 'High need'
        : status === 'medium'     ? 'Med need'
        : status === 'low'        ? 'On track'
        :                           'No data';

    // SVG ring: r=16, pathLength=100 → pct directly maps to stroke-dashoffset
    const pct       = isUnclassified ? 0 : sys.coveragePct;
    const dashOffset = 100 - pct;

    return (
        <div className={`plan-sys-card plan-sys-card--${status}`}>
            <div className="plan-sys-card__top">
                <span className="plan-sys-card__name" title={sys.label}>{sys.label}</span>
                <span className={`plan-sys-card__status plan-sys-card__status--${status}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="plan-sys-card__ring-row">
                <svg className="plan-sys-card__ring" viewBox="0 0 36 36" aria-hidden="true">
                    <circle
                        className="plan-sys-card__ring-track"
                        cx="18" cy="18" r="16"
                        fill="none" strokeWidth="3"
                        pathLength="100"
                    />
                    <circle
                        className="plan-sys-card__ring-fill"
                        cx="18" cy="18" r="16"
                        fill="none" strokeWidth="3"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                    />
                </svg>
                <div className="plan-sys-card__ring-center">
                    <span className="plan-sys-card__pct">
                        {isUnclassified ? '—' : `${sys.coveragePct}%`}
                    </span>
                    <span className="plan-sys-card__pct-label">covered</span>
                </div>
            </div>

            <div className="plan-sys-card__footer">
                <div className="plan-sys-card__footer-stat">
                    <span className="plan-sys-card__footer-value">
                        {sys.cardsInPlan}<span className="plan-sys-card__footer-of">/{sys.totalCards}</span>
                    </span>
                    <span className="plan-sys-card__footer-label">cards</span>
                </div>
                <div className="plan-sys-card__footer-stat">
                    <span className="plan-sys-card__footer-value">{sys.blueprintWeightMidpoint.toFixed(0)}%</span>
                    <span className="plan-sys-card__footer-label">blueprint</span>
                </div>
            </div>
        </div>
    );
}

// ── Active plan detail (sections 1–3) ─────────────────────────────────────────

function ScopeBadge({ deckFilter }: { deckFilter: string[] | null }) {
    const { t } = useTranslation();
    const { data: deckCounts = [] } = useDeckUnseenCounts();

    if (!deckFilter) {
        return <span className="plan-scope-badge plan-scope-all">{t('plan.scope_all')}</span>;
    }

    const liveIds = new Set(deckCounts.map(d => d.deckId));
    const staleCount = deckFilter.filter(id => !liveIds.has(id)).length;
    const names = deckFilter
        .map(id => deckCounts.find(d => d.deckId === id)?.name ?? `${t('plan.scope_deleted_deck')}`)
        .join(', ');

    return (
        <span
            className={`plan-scope-badge ${staleCount > 0 ? 'plan-scope-degraded' : 'plan-scope-filtered'}`}
            title={names}
        >
            {staleCount > 0 && <AlertTriangle size={12} style={{ marginRight: 4 }} />}
            {t('plan.scope_n_decks', { n: deckFilter.length })}
        </span>
    );
}

function DegradedPlanBanner({ deckFilter }: { deckFilter: string[] | null }) {
    const { t } = useTranslation();
    const { data: deckCounts = [] } = useDeckUnseenCounts();

    if (!deckFilter) return null;

    const liveIds = new Set(deckCounts.map(d => d.deckId));
    const staleCount = deckFilter.filter(id => !liveIds.has(id)).length;

    if (staleCount === 0) return null;

    return (
        <div className="plan-degraded-banner">
            <AlertTriangle size={16} />
            <span>{t('plan.degraded_banner', { count: staleCount })}</span>
        </div>
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
            <section className="plan-card plan-summary" data-tour-id="plan-targets">
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

            {/* ── Plan activity (rating breakdown) ──────────────────────────── */}
            {progress && <PlanActivityPanel progress={progress} />}

            {/* ── Weekly projection ─────────────────────────────────────────── */}
            <WeeklyProjectionCard plan={plan} />

            {/* ── System coverage ───────────────────────────────────────────── */}
            {snapshot.systemCoverage.length > 0 && (
                <SystemCoverageCard systems={snapshot.systemCoverage} hasClassifiedCards={hasClassifiedCards} />
            )}
        </>
    );
}

// ── Plan activity panel (rating breakdown for cards in scope) ───────────────

type ActivityWindow = 'today' | 'week' | 'since';

function PlanActivityPanel({ progress }: { progress: PlanProgress }) {
    const { t } = useTranslation();
    const [window, setWindow] = useState<ActivityWindow>('today');

    const counts: PlanActivityCounts =
        window === 'today' ? progress.activityToday
        : window === 'week'  ? progress.activityLast7Days
        :                      progress.activitySincePlanStart;

    const passRate = counts.total > 0
        ? Math.round(((counts.total - counts.again) / counts.total) * 100)
        : null;

    // Bar widths are relative to the largest single rating bucket so a
    // dominant bucket doesn't crush the others to invisibility.
    const maxBucket = Math.max(counts.again, counts.hard, counts.good, counts.easy, 1);

    const rows: { key: keyof PlanActivityCounts; label: string; cls: string }[] = [
        { key: 'again', label: t('plan.again'), cls: 'plan-activity-bar--again' },
        { key: 'hard',  label: t('plan.hard'),  cls: 'plan-activity-bar--hard'  },
        { key: 'good',  label: t('plan.good'),  cls: 'plan-activity-bar--good'  },
        { key: 'easy',  label: t('plan.easy'),  cls: 'plan-activity-bar--easy'  },
    ];

    return (
        <section className="plan-card">
            <div className="plan-activity-header">
                <h3 className="plan-section-title">{t('plan.activity_title')}</h3>
                <div className="plan-activity-tabs" role="tablist">
                    {(['today', 'week', 'since'] as const).map(w => (
                        <button
                            key={w}
                            role="tab"
                            aria-selected={window === w}
                            className={`plan-activity-tab ${window === w ? 'plan-activity-tab--active' : ''}`}
                            onClick={() => setWindow(w)}
                        >
                            {w === 'today' ? t('plan.activity_today')
                                : w === 'week' ? t('plan.activity_week')
                                :                t('plan.activity_since_start')}
                        </button>
                    ))}
                </div>
            </div>

            {counts.total === 0 ? (
                <p className="plan-activity-empty">{t('plan.activity_empty')}</p>
            ) : (
                <>
                    <div className="plan-activity-rows">
                        {rows.map(row => {
                            const value = counts[row.key] as number;
                            const widthPct = (value / maxBucket) * 100;
                            return (
                                <div key={row.key} className="plan-activity-row">
                                    <span className="plan-activity-label">{row.label}</span>
                                    <div className="plan-activity-bar-wrap">
                                        <div
                                            className={`plan-activity-bar ${row.cls}`}
                                            style={{ width: `${widthPct}%` }}
                                        />
                                    </div>
                                    <span className="plan-activity-count">{value.toLocaleString()}</span>
                                </div>
                            );
                        })}
                    </div>
                    <p className="plan-activity-summary">
                        {t('plan.activity_summary', {
                            total: counts.total.toLocaleString(),
                            rate:  passRate ?? 0,
                        })}
                    </p>
                </>
            )}
        </section>
    );
}

// ── Weekly projection card (collapsible, with current-week summary) ──────────

function WeeklyProjectionCard({ plan }: { plan: Plan }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(true);
    const weeks = plan.snapshot.weeklyProjection;
    const scrollRef = useRef<HTMLDivElement>(null);
    const currentCardRef = useRef<HTMLDivElement>(null);

    // Current week derived from when the plan activated. Clamp to the visible
    // window so a plan studied past its last projected week still resolves.
    const daysSince     = Math.floor((Date.now() - new Date(plan.activatedAt).getTime()) / 86_400_000);
    const currentWeekIx = weeks.length > 0
        ? Math.min(weeks.length - 1, Math.max(0, Math.floor(daysSince / 7)))
        : 0;
    const currentWeek   = weeks[currentWeekIx];
    const peakWeek      = weeks.length > 0
        ? weeks.reduce((max, w) => w.estimatedTotalMinutes > max.estimatedTotalMinutes ? w : max, weeks[0])
        : null;
    const isAtPeak      = currentWeek && peakWeek ? currentWeek.week === peakWeek.week : true;

    // Center the current week card whenever the carousel becomes visible.
    useEffect(() => {
        if (!expanded) return;
        const target = currentCardRef.current;
        const container = scrollRef.current;
        if (!target || !container) return;
        // Center within the scroll container without affecting the page scroll
        // (scrollIntoView on a horizontally-scrolling child can also nudge the
        // outer page; this manual calc avoids that).
        const targetCenter = target.offsetLeft + target.offsetWidth / 2;
        container.scrollLeft = targetCenter - container.clientWidth / 2;
    }, [expanded, currentWeekIx]);

    if (weeks.length === 0 || !currentWeek || !peakWeek) return null;

    const scrollByCards = (direction: 1 | -1) => {
        const container = scrollRef.current;
        if (!container) return;
        // Scroll one "card width + gap" — derive from the first child so it
        // tracks any future CSS changes.
        const firstCard = container.querySelector('.plan-week-card') as HTMLElement | null;
        if (!firstCard) return;
        const step = firstCard.offsetWidth + 12; // matches .plan-weeks-track gap
        container.scrollBy({ left: step * direction, behavior: 'smooth' });
    };

    return (
        <section className="plan-card">
            <button
                type="button"
                className="plan-collapsible-header"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
            >
                <div className="plan-collapsible-header__left">
                    <h3 className="plan-section-title">{t('plan.weekly_projection_title')}</h3>
                    <p className="plan-collapsible-summary">
                        {t('plan.weekly_summary_main', { current: currentWeek.week, total: weeks.length })}
                        {' · '}
                        {t('plan.weekly_summary_now', { mins: fmtMinutes(currentWeek.estimatedTotalMinutes) })}
                        {!isAtPeak && (
                            <>
                                {' · '}
                                {t('plan.weekly_summary_peak', {
                                    mins: fmtMinutes(peakWeek.estimatedTotalMinutes),
                                    week: peakWeek.week,
                                })}
                            </>
                        )}
                    </p>
                </div>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <div className={`plan-collapse ${expanded ? 'plan-collapse--open' : ''}`}>
                <div className="plan-collapsible-body plan-weeks-carousel">
                    <button
                        type="button"
                        className="plan-weeks-nav plan-weeks-nav--prev"
                        onClick={(e) => { e.stopPropagation(); scrollByCards(-1); }}
                        aria-label="Previous week"
                    >
                        ‹
                    </button>
                    <div className="plan-weeks-track" ref={scrollRef}>
                        {weeks.map(row => {
                            const isCurrent = row.week === currentWeek.week;
                            const isPast    = row.week < currentWeek.week;
                            return (
                                <div
                                    key={row.week}
                                    ref={isCurrent ? currentCardRef : null}
                                    className={`plan-week-card${isCurrent ? ' plan-week-card--current' : ''}${isPast ? ' plan-week-card--past' : ''}`}
                                    aria-current={isCurrent ? 'true' : undefined}
                                >
                                    <div className="plan-week-card__header">
                                        <span className="plan-week-card__week">{t('plan.week_n', { n: row.week })}</span>
                                        {isCurrent && (
                                            <span className="plan-current-week-marker">{t('plan.you_are_here')}</span>
                                        )}
                                    </div>
                                    <div className="plan-week-card__stats">
                                        <div className="plan-week-card__stat">
                                            <span className="plan-week-card__value">{row.newCardsPerDay}</span>
                                            <span className="plan-week-card__label">{t('plan.col_new_per_day')}</span>
                                        </div>
                                        <div className="plan-week-card__stat">
                                            <span className="plan-week-card__value">{row.estimatedReviewsPerDay}</span>
                                            <span className="plan-week-card__label">{t('plan.col_reviews_per_day')}</span>
                                        </div>
                                    </div>
                                    <div className="plan-week-card__time">{fmtMinutes(row.estimatedTotalMinutes)}/day</div>
                                </div>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        className="plan-weeks-nav plan-weeks-nav--next"
                        onClick={(e) => { e.stopPropagation(); scrollByCards(1); }}
                        aria-label="Next week"
                    >
                        ›
                    </button>
                </div>
            </div>
        </section>
    );
}

// ── System coverage card (collapsible, sorted by status) ─────────────────────

function SystemCoverageCard({
    systems,
    hasClassifiedCards,
}: {
    systems: SystemCoverageRow[];
    hasClassifiedCards: boolean;
}) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(true);

    // Status rank: needs-work (0) → on-track (1) → unclassified (2). Stable
    // within a bucket via secondary sort on blueprint weight.
    const ranked = (sys: SystemCoverageRow): number => {
        if (sys.totalCards === 0) return 2;
        if (sys.performanceNeed >= 0.3) return 0;
        return 1;
    };
    const sorted = [...systems].sort((a, b) => {
        const r = ranked(a) - ranked(b);
        return r !== 0 ? r : b.blueprintWeightMidpoint - a.blueprintWeightMidpoint;
    });

    const needsWorkCount = sorted.filter(s => ranked(s) === 0).length;
    const onTrackCount   = sorted.filter(s => ranked(s) === 1).length;
    const unclassCount   = sorted.filter(s => ranked(s) === 2).length;

    return (
        <section className="plan-card">
            <button
                type="button"
                className="plan-collapsible-header"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
            >
                <div className="plan-collapsible-header__left">
                    <h3 className="plan-section-title">{t('plan.system_coverage_title')}</h3>
                    {hasClassifiedCards && (
                        <p className="plan-collapsible-summary">
                            {needsWorkCount > 0 && <span className="plan-status-pill plan-status-pill--warn">{needsWorkCount} needs work</span>}
                            {onTrackCount > 0   && <span className="plan-status-pill plan-status-pill--ok">{onTrackCount} on track</span>}
                            {unclassCount > 0   && <span className="plan-status-pill plan-status-pill--muted">{unclassCount} unclassified</span>}
                        </p>
                    )}
                </div>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <div className={`plan-collapse ${expanded ? 'plan-collapse--open' : ''}`}>
                {hasClassifiedCards ? (
                    <div className="plan-collapsible-body plan-sys-grid">
                        {sorted.map(sys => (
                            <SystemCard key={sys.systemKey} sys={sys} />
                        ))}
                    </div>
                ) : (
                    <div className="plan-coverage-empty plan-collapsible-body">
                        <BookOpen size={32} className="plan-coverage-empty-icon" />
                        <p className="plan-coverage-empty-title">{t('plan.coverage_unclassified_title')}</p>
                        <p className="plan-coverage-empty-desc">{t('plan.coverage_unclassified_desc')}</p>
                    </div>
                )}
            </div>
        </section>
    );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ plan }: { plan: Plan }) {
    const { t }          = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const reactivate     = useReactivatePlan();
    const remove         = useDeletePlan();
    const snapshot       = plan.snapshot;
    const coveragePct    = Math.round(snapshot.projectedCoverage * 100);
    const archivedOnSameDay = plan.updatedAt.slice(0, 10) === plan.createdAt.slice(0, 10);

    return (
        <div className="plan-history-row">
            <div className="plan-history-summary">
                <div className="plan-history-left">
                    <span className="plan-history-name">{plan.name}</span>
                    <span className="plan-history-meta">
                        {archivedOnSameDay
                            ? fmtDate(plan.createdAt)
                            : `${fmtDate(plan.createdAt)} – ${fmtDate(plan.updatedAt)}`}
                        {' · '}{plan.cardsPerDay} {t('plan.cards_day_short')} · {coveragePct}%
                    </span>
                </div>
                <div className="plan-history-actions">
                    {confirmingDelete ? (
                        <>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Delete this plan?
                            </span>
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => remove.mutate(plan.id, {
                                    onSuccess: () => setConfirmingDelete(false),
                                })}
                                disabled={remove.isPending}
                            >
                                Confirm
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setConfirmingDelete(false)}
                                disabled={remove.isPending}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
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
                                onClick={() => setConfirmingDelete(true)}
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
                        </>
                    )}
                </div>
            </div>

            <div className={`plan-collapse ${expanded ? 'plan-collapse--open' : ''}`}>
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
            </div>
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

    // Slider max is bounded by unseen cards in scope (can't plan more new
    // cards/day than exist), with a comfort floor so the suggestion has
    // visual headroom and a hard ceiling for realism.
    const sliderMax = Math.max(
        1,
        Math.min(
            suggestion?.unseenTotal ?? 1,
            100,
            Math.max(suggestedRate * 2, 50),
        ),
    );

    // Use suggestion as default once loaded; clamp to slider range
    const effectiveRate = Math.min(cardsPerDay ?? suggestedRate, sliderMax);
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
                        <div className="plan-slider-label-group">
                            <span className="plan-slider-label">{t('plan.adjust_label')}</span>
                            <span className="plan-slider-suggested">{t('plan.suggested')}: {suggestedRate}</span>
                        </div>
                        <span className="plan-slider-value">{effectiveRate}</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={sliderMax}
                        value={effectiveRate}
                        onChange={e => setCardsPerDay(Number(e.target.value))}
                        className="plan-slider"
                    />
                </div>

                {/* ── Live preview ──────────────────────────────────────────── */}
                {liveStats && (() => {
                    const lastWeek       = liveStats.weeklyPreview[liveStats.weeklyPreview.length - 1];
                    const firstWeek      = liveStats.weeklyPreview[0];
                    const reviewsWeek1   = firstWeek?.reviews ?? 0;
                    const reviewsLastWk  = lastWeek?.reviews ?? 0;
                    const lastWeekNum    = lastWeek?.week ?? 1;
                    const cardsMissed    = liveStats.unseenTotal - liveStats.projectedCount;
                    const fullyCovered   = liveStats.coveragePct >= 100;
                    const newCardsLabel  = effectiveRate === 1 ? 'card' : 'cards';

                    return (
                    <div className="plan-live-preview">
                        {/* Narrative — what to expect, with dynamic numbers inline */}
                        <div className="plan-narrative">
                            <h4 className="plan-narrative-title">What to expect with this plan</h4>
                            <p>
                                Over the next <strong>{liveStats.availableDays} days</strong>, you'll
                                introduce <strong>{effectiveRate} new {newCardsLabel} per day</strong>.
                                {' '}
                                {fullyCovered ? (
                                    <>By exam day you'll have covered <strong>all {liveStats.unseenTotal.toLocaleString()} cards</strong> in scope.</>
                                ) : (
                                    <>By exam day you'll have covered <strong>{liveStats.projectedCount.toLocaleString()} of {liveStats.unseenTotal.toLocaleString()} cards</strong> ({liveStats.coveragePct}%).</>
                                )}
                            </p>
                            <p>
                                Reviews of cards you've already seen ramp up gradually as your library matures —
                                from about <strong>{reviewsWeek1}/day in week 1</strong> to{' '}
                                <strong>{reviewsLastWk}/day by week {lastWeekNum}</strong>, then leveling off as FSRS
                                settles into long intervals. Your peak daily commitment is{' '}
                                <strong>{fmtMinutes(liveStats.peakMinutes)}</strong>.
                            </p>
                            {!fullyCovered && cardsMissed > 0 && (
                                <p className="plan-narrative-warn">
                                    <AlertTriangle size={14} />
                                    <span>
                                        At this rate, <strong>{cardsMissed.toLocaleString()} cards</strong> won't be seen
                                        before exam day. Increase the daily rate above or narrow your deck scope to close the gap.
                                    </span>
                                </p>
                            )}
                        </div>

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
                    );
                })()}

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

// ── All plans panel (slide-in list of all plans) ──────────────────────────────

function AllPlansPanel({
    allPlans,
    onBack,
}: {
    allPlans: Plan[];
    onBack: () => void;
}) {
    const { t }  = useTranslation();
    const activePlan    = allPlans.find(p => p.status === 'active') ?? null;
    const archivedPlans = allPlans.filter(p => p.status === 'archived');

    return (
        <div className="plan-page">
            <div className="plan-create-header">
                <button className="btn btn-ghost btn-sm" onClick={onBack}>
                    ← {t('common.back')}
                </button>
                <h2>{t('plan.all_plans')}</h2>
            </div>

            {activePlan && (
                <div className="plan-card plan-list-card plan-list-card--active">
                    <div className="plan-list-card-row">
                        <div className="plan-list-card-left">
                            <span className="plan-list-card-name">{activePlan.name}</span>
                            <span className="plan-list-card-meta">
                                {fmtDate(activePlan.createdAt)} · {activePlan.cardsPerDay} {t('plan.cards_day_short')} · {Math.round(activePlan.snapshot.projectedCoverage * 100)}%
                            </span>
                        </div>
                        <span className="plan-list-badge plan-list-badge--active">{t('plan.status_active')}</span>
                    </div>
                </div>
            )}

            {archivedPlans.length > 0 && (
                <section className="plan-card plan-history-section">
                    <div className="plan-history-list">
                        {archivedPlans.map(p => (
                            <HistoryRow key={p.id} plan={p} />
                        ))}
                    </div>
                </section>
            )}

            {allPlans.length === 0 && (
                <div className="plan-empty-state">
                    <CalendarDays size={48} className="plan-empty-icon" />
                    <p>{t('plan.no_plans_desc')}</p>
                </div>
            )}
        </div>
    );
}

// ── No plans state ────────────────────────────────────────────────────────────

function NoPlansState({ onStart, hasExam }: { onStart: () => void; hasExam: boolean }) {
    const { t } = useTranslation();
    return (
        <div className="plan-page">
            <div className="page-header">
                <h2>{t('plan.title')}</h2>
            </div>
            <div className="plan-empty-state plan-empty-no-plans">
                <CalendarDays size={48} className="plan-empty-icon" />
                <h3>{hasExam ? t('plan.no_plans_title') : 'No plans yet'}</h3>
                <p>{hasExam ? t('plan.no_plans_desc') : 'Set your exam date in your profile to start a plan.'}</p>
                <button className="btn btn-primary plan-empty-cta" onClick={onStart}>
                    {hasExam ? <Plus size={16} /> : <GraduationCap size={16} />}
                    {hasExam ? t('plan.create_first_plan') : 'Set up exam'}
                </button>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanPage() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { goToProfile } = useAppNavigation();
    const [isCreating, setIsCreating] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(true);
    const [allPlansOpen, setAllPlansOpen] = useState(false);
    const [confirmingActiveDelete, setConfirmingActiveDelete] = useState(false);

    const { data: examProfile, isLoading: examLoading } = useExamProfile();
    const examKey   = examProfile?.exam_key ?? null;
    const examLabel = examProfile?.exam_label ?? '';

    const { data: activePlanResult, isLoading: activePlanLoading } = useActivePlan(examKey);
    const { data: allPlans = [],   isLoading: plansLoading }       = usePlans();

    const archivePlanMutation = useArchivePlan();
    const deletePlanMutation  = useDeletePlan();

    // Treat "no exam profile" as "no active plan" so an orphan plan in the DB
    // doesn't surface here.
    const activePlan  = examProfile ? (activePlanResult?.plan ?? null) : null;
    const archivedPlans = allPlans.filter(p => p.status === 'archived');
    const isLoading   = examLoading || activePlanLoading || plansLoading;

    // Start-plan affordance: if no exam is set, send the user to the Study tab
    // to set one up; otherwise open the creation panel inline.
    const handleStartPlan = () => {
        if (examKey) setIsCreating(true);
        else goToProfile('study');
    };

    // All plans panel
    if (allPlansOpen) {
        return <AllPlansPanel allPlans={allPlans} onBack={() => setAllPlansOpen(false)} />;
    }

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

    // Loading
    if (isLoading) {
        return (
            <div className="plan-page">
                <div className="page-header"><h2>{t('plan.title')}</h2></div>
                <div className="plan-empty-state"><p>{t('common.loading_app')}</p></div>
            </div>
        );
    }

    // No active plan
    if (!activePlan) {
        if (archivedPlans.length > 0) {
            return (
                <div className="plan-page">
                    <div className="page-header plan-page-header">
                        <div><h2>{t('plan.title')}</h2></div>
                        <div className="plan-header-actions">
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setAllPlansOpen(true)}
                            >
                                <LayoutList size={15} />
                                {t('plan.all_plans')}
                            </button>
                            <button className="btn btn-primary" onClick={handleStartPlan}>
                                {examKey ? <Plus size={15} /> : <GraduationCap size={15} />}
                                {examKey ? t('plan.new_plan') : 'Set up exam'}
                            </button>
                        </div>
                    </div>
                    <div className="plan-empty-state plan-empty-no-plans">
                        <Archive size={48} className="plan-empty-icon" />
                        <h3>{examKey ? t('plan.no_active_plan_title') : 'No active plan'}</h3>
                        <p>
                            {examKey
                                ? t('plan.no_active_plan_desc')
                                : 'Set your exam date in your profile to start a new plan. Your archived plans are below.'}
                        </p>
                        <button className="btn btn-primary plan-empty-cta" onClick={handleStartPlan}>
                            {examKey ? <Plus size={16} /> : <GraduationCap size={16} />}
                            {examKey ? t('plan.new_plan') : 'Set up exam'}
                        </button>
                    </div>
                    <section className="plan-card plan-history-section">
                        <button
                            className="plan-history-toggle"
                            onClick={() => setHistoryOpen(v => !v)}
                        >
                            <span className="plan-section-title">{t('plan.history_title')} ({archivedPlans.length})</span>
                            {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <div className={`plan-collapse ${historyOpen ? 'plan-collapse--open' : ''}`}>
                            <div className="plan-history-list">
                                {archivedPlans.map(p => <HistoryRow key={p.id} plan={p} />)}
                            </div>
                        </div>
                    </section>
                </div>
            );
        }
        return <NoPlansState onStart={handleStartPlan} hasExam={!!examKey} />;
    }

    return (
        <div className="plan-page">
            {/* ── Page header ──────────────────────────────────────────────── */}
            <div className="page-header plan-page-header">
                <div>
                    <h2>{t('plan.title')}</h2>
                    <p className="text-muted">{activePlan.name}</p>
                </div>
                <div className="plan-header-actions">
                    {confirmingActiveDelete ? (
                        <>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Permanently delete this plan? Reviews stay; the plan and its scope are removed.
                            </span>
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => deletePlanMutation.mutate(activePlan.id, {
                                    onSuccess: () => {
                                        setConfirmingActiveDelete(false);
                                        showToast('Plan deleted', 'success');
                                    },
                                    onError: () => showToast('Failed to delete plan', 'error'),
                                })}
                                disabled={deletePlanMutation.isPending}
                            >
                                Confirm
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setConfirmingActiveDelete(false)}
                                disabled={deletePlanMutation.isPending}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setAllPlansOpen(true)}
                            >
                                <LayoutList size={15} />
                                {t('plan.all_plans')}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                title={t('plan.archive_active')}
                                onClick={() => archivePlanMutation.mutate(activePlan.id, {
                                    onSuccess: () => showToast(t('plan.archived_saved'), 'success'),
                                })}
                                disabled={archivePlanMutation.isPending}
                            >
                                <Archive size={15} />
                                {t('plan.archive_active')}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm plan-history-delete"
                                title="Delete plan permanently"
                                onClick={() => setConfirmingActiveDelete(true)}
                            >
                                <Trash2 size={15} />
                                Delete
                            </button>
                            <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
                                <Plus size={15} />
                                {t('plan.new_plan')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Degraded plan banner (shown when scoped deck(s) have been deleted) ── */}
            <DegradedPlanBanner deckFilter={activePlan.deckFilter} />

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

                    <div className={`plan-collapse ${historyOpen ? 'plan-collapse--open' : ''}`}>
                        <div className="plan-history-list">
                            {archivedPlans.map(p => (
                                <HistoryRow key={p.id} plan={p} />
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
