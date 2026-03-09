import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';
import { Button, Loader, RetentionTrendChart, RatingDistributionChart, LapseStatsChart } from '@sekel/components';
import { useSessionAnalytics } from '../../hooks/useSessions';

interface SessionAnalyticsProps {
    sessionId: string;
    reviewedCount: number;
    onBack: () => void;
    onStudyAgain: () => void;
}

export function SessionAnalytics({
    sessionId,
    reviewedCount,
    onBack,
    onStudyAgain,
}: SessionAnalyticsProps) {
    const { t } = useTranslation();
    const { data: analytics, isLoading, isError } = useSessionAnalytics(sessionId, true);

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
                            <LapseStatsChart lapseStats={analytics.lapseStats} />
                        </div>
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
