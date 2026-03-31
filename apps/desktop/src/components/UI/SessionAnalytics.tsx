import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';
import { Button, Loader, RetentionTrendChart, RatingDistributionChart, LapseStatsChart, TimePerCardChart } from '@sekel/components';
import { useSessionAnalytics } from '../../hooks/useSessions';
import { useCreateMissedCardsDeck } from '../../hooks/useDecks';
import { useSessionClassificationBreakdown } from '../../hooks/useStatistics';
import { useToast } from './Toast';

const MISSED_DECK_THRESHOLD = 5;

interface SessionAnalyticsProps {
    sessionId: string;
    reviewedCount: number;
    userId: string;
    deckName: string;
    onBack: () => void;
    onStudyAgain: () => void;
}

export function SessionAnalytics({
    sessionId,
    reviewedCount,
    userId,
    deckName,
    onBack,
    onStudyAgain,
}: SessionAnalyticsProps) {
    const { t } = useTranslation();
    const { data: analytics, isLoading, isError } = useSessionAnalytics(sessionId, true);
    const hasMisses = (analytics?.lapseStats.lapseCount ?? 0) > 0;
    const { data: systemBreakdown = [] } = useSessionClassificationBreakdown(sessionId, hasMisses);
    const createMissedDeck = useCreateMissedCardsDeck();
    const { showToast } = useToast();

    const [showNameInput, setShowNameInput] = useState(false);
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const [deckNameInput, setDeckNameInput] = useState(`Missed – ${deckName} – ${today}`);

    const missedCardIds = analytics?.lapseStats.missedCardIds ?? [];
    const showMissedDeckButton = missedCardIds.length >= MISSED_DECK_THRESHOLD;

    async function handleCreateMissedDeck() {
        if (!deckNameInput.trim()) return;
        try {
            await createMissedDeck.mutateAsync({ userId, deckName: deckNameInput.trim(), cardIds: missedCardIds });
            showToast(t('study.missed_deck.success', { name: deckNameInput.trim() }));
            setShowNameInput(false);
        } catch {
            showToast(t('study.missed_deck.error'), 'error');
        }
    }

    return (
        <div className="study-session" data-testid="study-session">
            <div className="study-complete" data-testid="study-complete">
                <CheckCircle size={64} className="complete-icon" />
                <h2>{t('study.congratulations')}</h2>
                <p className="text-muted">
                    {t('study.cards_studied')}: {reviewedCount}
                </p>

                {isLoading && (
                    <div className="analytics-loading">
                        <Loader />
                        <p className="text-muted">{t('common.loading')}</p>
                    </div>
                )}

                {isError && (
                    <p className="text-muted analytics-error">{t('study.analytics.no_data')}</p>
                )}

                {analytics && !isLoading && (
                    <div className="session-analytics">
                        <h3>{t('study.analytics.title')}</h3>

                        <div className="analytics-charts">
                            <RetentionTrendChart data={analytics.retentionTrend} />
                            <RatingDistributionChart data={analytics.ratingDistribution} />
                            <LapseStatsChart lapseStats={analytics.lapseStats} systemBreakdown={systemBreakdown} />
                            {analytics.timeStats && (
                                <TimePerCardChart timeStats={analytics.timeStats} />
                            )}
                        </div>
                    </div>
                )}

                {showMissedDeckButton && !isLoading && (
                    <div className="missed-deck-section">
                        {!showNameInput ? (
                            <Button variant="secondary" onClick={() => setShowNameInput(true)}>
                                {t('study.missed_deck.button', { count: missedCardIds.length })}
                            </Button>
                        ) : (
                            <div className="missed-deck-form">
                                <input
                                    className="missed-deck-input"
                                    type="text"
                                    value={deckNameInput}
                                    onChange={(e) => setDeckNameInput(e.target.value)}
                                    maxLength={500}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateMissedDeck();
                                        if (e.key === 'Escape') setShowNameInput(false);
                                    }}
                                />
                                <div className="missed-deck-form-actions">
                                    <Button
                                        variant="primary"
                                        onClick={handleCreateMissedDeck}
                                        disabled={!deckNameInput.trim() || createMissedDeck.isPending}
                                    >
                                        {createMissedDeck.isPending ? t('common.loading') : t('study.missed_deck.create')}
                                    </Button>
                                    <Button variant="secondary" onClick={() => setShowNameInput(false)}>
                                        {t('common.cancel')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="complete-actions">
                    <Button variant="secondary" onClick={onBack}>
                        {t('study.back_to_decks')}
                    </Button>
                    <Button variant="primary" onClick={onStudyAgain}>
                        {t('study.study_again')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
