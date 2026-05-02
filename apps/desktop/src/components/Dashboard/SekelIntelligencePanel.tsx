import { Sparkles, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { IntelligenceSummary } from '../../hooks/useSekelIntelligence';
import './SekelIntelligencePanel.css';

interface Props {
    intelligence: IntelligenceSummary;
    onStartFocused: () => void;
    onHide: () => void;
    onGoToProfile: () => void;
    onGoToDecks: () => void;
}

function accuracyColor(accuracy: number): string {
    if (accuracy < 0.70) return 'var(--danger)';
    if (accuracy < 0.85) return 'var(--warning)';
    return 'var(--success, #22c55e)';
}

function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
}

function weightLabel(min: number, max: number): string {
    return `${Math.round(min)}–${Math.round(max)}%`;
}

export default function SekelIntelligencePanel({ intelligence, onStartFocused, onHide, onGoToProfile, onGoToDecks }: Props) {
    const { daysUntilExam, examLabel, systemBreakdown,
            prioritizedCardCount, hasClassifications } = intelligence;

    // ── No exam profile set ──────────────────────────────────────────
    if (daysUntilExam === null && !examLabel) {
        return (
            <div className="intel-panel intel-panel--prompt">
                <div className="intel-panel__prompt-row">
                    <Sparkles size={16} className="intel-icon--teal" />
                    <span className="intel-panel__prompt-text">
                        Set your exam date to unlock <strong>SEKEL Intelligence</strong>
                    </span>
                    <button className="intel-panel__cta-link" onClick={onGoToProfile}>
                        Set exam →
                    </button>
                </div>
            </div>
        );
    }

    // ── Cards not classified yet ─────────────────────────────────────
    if (!hasClassifications) {
        return (
            <div className="intel-panel intel-panel--prompt">
                <div className="intel-panel__prompt-row">
                    <AlertCircle size={16} className="intel-icon--amber" />
                    <span className="intel-panel__prompt-text">
                        Classify your cards to enable <strong>SEKEL Intelligence</strong>
                    </span>
                    <button className="intel-panel__cta-link" onClick={onGoToDecks}>
                        Classify cards →
                    </button>
                </div>
            </div>
        );
    }

    // ── Bucket systems: tested-weak / tested-strong / untested ──────
    type Tested = typeof systemBreakdown[number] & { accuracy: number };
    const datafulSystems = systemBreakdown.filter(s => s.dueCardsCount > 0 || s.totalReviewsInWindow > 0);
    const testedSystems = datafulSystems.filter((s): s is Tested => s.accuracy !== null);
    const untestedSystems = datafulSystems.filter(s => s.accuracy === null);

    const weakSystems = testedSystems
        .filter(s => s.accuracy < 0.80)
        .sort((a, b) => {
            const scoreA = (1 - a.accuracy) * ((a.blueprintWeightMin + a.blueprintWeightMax) / 2);
            const scoreB = (1 - b.accuracy) * ((b.blueprintWeightMin + b.blueprintWeightMax) / 2);
            return scoreB - scoreA;
        });

    const strongSystems = testedSystems.filter(s => s.accuracy >= 0.80);
    // "On track" only when there are tested systems and none of them are weak.
    // If everything is untested, show the awaiting-data state instead.
    const allOnTrack = weakSystems.length === 0 && testedSystems.length > 0;
    const allUntested = testedSystems.length === 0 && untestedSystems.length > 0;
    const displaySystems: Tested[] = allOnTrack ? testedSystems : weakSystems;

    return (
        <div className="intel-panel">
            {/* Header */}
            <div className="intel-panel__header">
                <div className="intel-panel__title-row">
                    <Sparkles size={14} className="intel-icon--teal" />
                    <span className="intel-panel__title">SEKEL Intelligence</span>
                </div>
                <div className="intel-panel__header-right">
                    {(daysUntilExam !== null || examLabel) && (
                        <span className="intel-panel__exam-chip">
                            {examLabel}{daysUntilExam !== null ? ` · ${daysUntilExam}d` : ''}
                        </span>
                    )}
                    <button
                        className="intel-panel__hide-btn"
                        onClick={onHide}
                        title="Hide SEKEL Intelligence"
                    >
                        <EyeOff size={14} />
                    </button>
                </div>
            </div>

            {/* Section label */}
            {allUntested ? (
                <div className="intel-section-label intel-section-label--neutral">
                    Awaiting review data — review at least {untestedSystems[0]?.minReviewsForSignal ?? 10} cards per system to assess accuracy
                </div>
            ) : allOnTrack ? (
                <div className="intel-section-label intel-section-label--success">
                    ✓ All tested systems on track
                    {untestedSystems.length > 0 && ` · ${untestedSystems.length} awaiting data`}
                </div>
            ) : (
                <div className="intel-section-label intel-section-label--warn">
                    {weakSystems.length} {weakSystems.length === 1 ? 'system' : 'systems'} need attention
                    {untestedSystems.length > 0 && ` · ${untestedSystems.length} awaiting data`}
                </div>
            )}

            {/* System bars (tested systems only) */}
            {displaySystems.length > 0 && (
                <div className="intel-systems">
                    {displaySystems.map(s => (
                        <div key={s.systemKey} className="intel-system-row">
                            <span className="intel-system-row__label">{s.label}</span>
                            <div className="intel-system-row__bar-wrap">
                                <div
                                    className="intel-system-row__bar"
                                    style={{
                                        width: pct(s.accuracy),
                                        background: accuracyColor(s.accuracy),
                                    }}
                                />
                            </div>
                            <span
                                className="intel-system-row__pct"
                                style={{ color: accuracyColor(s.accuracy) }}
                            >
                                {pct(s.accuracy)}
                            </span>
                            <span className="intel-system-row__meta">
                                Blueprint: {weightLabel(s.blueprintWeightMin, s.blueprintWeightMax)}
                                {s.dueCardsCount > 0 ? ` · ${s.dueCardsCount} due` : ' · no cards due'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Untested systems — always shown below tested rows; bar fills as
                reviews accumulate toward the minimum signal threshold */}
            {untestedSystems.length > 0 && (
                <div className="intel-systems intel-systems--untested">
                    {untestedSystems.map(s => {
                        const progress = Math.min(1, s.totalReviewsInWindow / s.minReviewsForSignal);
                        return (
                            <div key={s.systemKey} className="intel-system-row intel-system-row--untested">
                                <span className="intel-system-row__label">{s.label}</span>
                                <div className="intel-system-row__bar-wrap">
                                    <div
                                        className="intel-system-row__bar intel-system-row__bar--untested"
                                        style={{ width: `${Math.round(progress * 100)}%` }}
                                    />
                                </div>
                                <span className="intel-system-row__pct intel-system-row__pct--untested">
                                    {s.totalReviewsInWindow}/{s.minReviewsForSignal}
                                </span>
                                <span className="intel-system-row__meta">
                                    {s.totalReviewsInWindow === 0 ? 'No reviews yet' : 'Reviews to unlock accuracy'}
                                    {s.dueCardsCount > 0 ? ` · ${s.dueCardsCount} due` : ''}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* On Track compact row — only when weak systems exist */}
            {!allOnTrack && strongSystems.length > 0 && (
                <div className="intel-on-track-row">
                    <span className="intel-on-track-row__check">✓ On Track</span>
                    {strongSystems.map((s, i) => (
                        <span key={s.systemKey} className="intel-on-track-row__item">
                            {i > 0 && '·'} {s.label} <span className="intel-on-track-row__item--pct">{pct(s.accuracy)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* CTA */}
            <button
                className="intel-panel__cta"
                onClick={onStartFocused}
                disabled={prioritizedCardCount === 0 && !allOnTrack && !allUntested}
            >
                {allOnTrack || allUntested
                    ? 'Start Review Session'
                    : `Start Focused Session (${prioritizedCardCount} cards) →`}
            </button>
        </div>
    );
}

// Collapsed bar shown when intelligence is toggled off
export function IntelligenceHiddenBar({ onShow }: { onShow: () => void }) {
    return (
        <div className="intel-hidden-bar">
            <Sparkles size={13} className="intel-icon--teal" />
            <span>SEKEL Intelligence hidden</span>
            <button className="intel-panel__cta-link" onClick={onShow}>
                <Eye size={13} /> Show
            </button>
        </div>
    );
}
