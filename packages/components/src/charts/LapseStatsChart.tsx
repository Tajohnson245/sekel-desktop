import { useTranslation } from 'react-i18next';

export interface TopForgottenCard {
    cardId: string;
    lapseCount: number;
    frontPreview?: string | null;
}

export interface LapseStats {
    lapseCount: number;
    lapseRate: number;
    totalReviews: number;
    topForgottenCards: TopForgottenCard[];
}

interface LapseStatsChartProps {
    lapseStats: LapseStats;
}

export function LapseStatsChart({ lapseStats }: LapseStatsChartProps) {
    const { t } = useTranslation();
    const { lapseCount, lapseRate, totalReviews, topForgottenCards } = lapseStats;

    return (
        <div className="analytics-chart lapse-stats">
            <h4>{t('study.analytics.lapse_rate')}</h4>
            <div className="lapse-metric">
                <span className="lapse-rate-big">{t('study.analytics.lapse_rate_percent', { rate: lapseRate.toFixed(1) })}</span>
            </div>
            <p className="text-muted">
                {t('study.analytics.lapse_count', { count: lapseCount })}
                {totalReviews > 0 && ` / ${totalReviews} ${t('study.analytics.total_reviews')}`}
            </p>

            <div className="most-forgotten">
                <h5>{t('study.analytics.most_forgotten')}</h5>
                {topForgottenCards.length === 0 ? (
                    <p className="text-muted no-forgotten">{t('study.analytics.no_forgotten')}</p>
                ) : (
                    <ul className="forgotten-list">
                        {topForgottenCards.map((item: TopForgottenCard) => (
                            <li key={item.cardId}>
                                {item.frontPreview ? (
                                    <span className="card-preview" title={item.frontPreview}>
                                        {item.frontPreview}
                                        {item.frontPreview.length >= 60 ? '…' : ''}
                                    </span>
                                ) : null}
                                <span className="lapse-count">{t('study.analytics.card_lapse_count', { count: item.lapseCount })}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
