import { useState } from 'react';
import { Sparkles, Calendar, Target, Layers } from 'lucide-react';
import { useDecks } from '../../hooks/useDecks';
import type { IntelligenceSummary } from '../../hooks/useSekelIntelligence';
import type { Deck } from '../../lib/types';

interface Props {
    intelligence: IntelligenceSummary;
    onDismiss: () => void;
    onBegin: (deckId: string) => void;
}

function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
}

function weightLabel(min: number, max: number): string {
    return `${Math.round(min)}–${Math.round(max)}%`;
}

export default function PreSessionBriefing({ intelligence, onDismiss, onBegin }: Props) {
    const { data: decks = [] } = useDecks();
    const [selectedDeckId, setSelectedDeckId] = useState<string>(
        intelligence.suggestedDeckId ?? decks[0]?.id ?? ''
    );

    const { daysUntilExam, examLabel, weakestSystem, prioritizedCardCount } = intelligence;

    const deckId = selectedDeckId || intelligence.suggestedDeckId || decks[0]?.id;

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
                            <Target size={18} style={{ color: 'var(--warning, #f59e0b)' }} />
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
                            <Layers size={18} style={{ color: 'var(--text-muted, #8892a4)' }} />
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
                        <select
                            id="briefing-deck-select"
                            className="presession-deck-select__select"
                            value={selectedDeckId}
                            onChange={e => setSelectedDeckId(e.target.value)}
                        >
                            {decks.map((d: Deck) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
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
