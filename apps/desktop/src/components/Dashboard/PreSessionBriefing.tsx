import { useState } from 'react';
import { Sparkles, Calendar, Target, Layers } from 'lucide-react';
import { useDecks } from '../../hooks/useDecks';
import { Select } from '../UI';
import type { IntelligenceSummary } from '../../hooks/useSekelIntelligence';
import type { Deck } from '../../lib/types';

interface Props {
    intelligence: IntelligenceSummary;
    /**
     * Deck UUIDs the active plan covers. When non-null and non-empty, the
     * deck dropdown is restricted to these. Null means no plan or
     * unscoped plan — show all decks.
     */
    planDeckIds: string[] | null;
    onDismiss: () => void;
    onBegin: (deckId: string) => void;
}

function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
}

function weightLabel(min: number, max: number): string {
    return `${Math.round(min)}–${Math.round(max)}%`;
}

export default function PreSessionBriefing({ intelligence, planDeckIds, onDismiss, onBegin }: Props) {
    const { data: allDecks = [] } = useDecks();

    // Restrict to plan-scoped decks when a plan is active. If the filter would
    // produce zero decks (every scoped deck has been deleted), fall back to
    // all decks so the user isn't stranded — the dashboard already warns them.
    const scopedDecks = planDeckIds && planDeckIds.length > 0
        ? allDecks.filter((d: Deck) => planDeckIds.includes(d.id))
        : allDecks;
    const decks: Deck[] = scopedDecks.length > 0 ? scopedDecks : allDecks;

    // Default selection: suggestedDeckId only if it's still in scope, else
    // the first scoped deck.
    const initialDeckId = (() => {
        const suggested = intelligence.suggestedDeckId;
        if (suggested && decks.some(d => d.id === suggested)) return suggested;
        return decks[0]?.id ?? '';
    })();

    const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId);

    const { daysUntilExam, examLabel, weakestSystem, prioritizedCardCount } = intelligence;

    const deckId = selectedDeckId || decks[0]?.id;

    return (
        <div className="presession-overlay" onClick={onDismiss}>
            <div className="presession-modal" onClick={e => e.stopPropagation()}>
                <div className="presession-modal__header">
                    <Sparkles size={16} style={{ color: 'var(--teal)' }} />
                    <span className="presession-modal__title">Today's Study Brief</span>
                </div>

                <div className="presession-insights">
                    {/* Exam countdown */}
                    {daysUntilExam !== null && examLabel && (
                        <div className="presession-insight-card">
                            <Calendar size={18} style={{ color: 'var(--teal)' }} />
                            <div>
                                <div className="presession-insight-card__value">
                                    {daysUntilExam} days
                                </div>
                                <div className="presession-insight-card__label">
                                    until {examLabel}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Weakest system */}
                    {weakestSystem && (
                        <div className="presession-insight-card">
                            <Target size={18} style={{ color: 'var(--amber)' }} />
                            <div>
                                <div className="presession-insight-card__value">
                                    {weakestSystem.label}{' '}
                                    <span style={{ color: 'var(--danger)' }}>
                                        {pct(weakestSystem.accuracy)}
                                    </span>
                                </div>
                                <div className="presession-insight-card__label">
                                    {prioritizedCardCount} high-leverage cards ready
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Blueprint weight */}
                    {weakestSystem && (
                        <div className="presession-insight-card">
                            <Layers size={18} style={{ color: 'var(--mist)' }} />
                            <div>
                                <div className="presession-insight-card__value">
                                    {weightLabel(weakestSystem.blueprintWeightMin, weakestSystem.blueprintWeightMax)}
                                </div>
                                <div className="presession-insight-card__label">
                                    of the exam blueprint
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Deck selector */}
                {decks.length > 1 && (
                    <div className="presession-deck-select">
                        <label className="presession-deck-select__label" htmlFor="briefing-deck-select">
                            Study deck
                        </label>
                        <Select
                            id="briefing-deck-select"
                            containerClassName="presession-deck-select__wrap"
                            className="presession-deck-select__select"
                            value={selectedDeckId}
                            onChange={e => setSelectedDeckId(e.target.value)}
                            options={decks.map((d: Deck) => ({ value: d.id, label: d.name }))}
                        />
                    </div>
                )}

                <div className="presession-modal__actions">
                    <button className="presession-modal__cancel" onClick={onDismiss}>
                        Cancel
                    </button>
                    <button
                        className="presession-modal__begin"
                        onClick={() => deckId && onBegin(deckId)}
                        disabled={!deckId}
                    >
                        Begin Focused Session →
                    </button>
                </div>
            </div>
        </div>
    );
}
