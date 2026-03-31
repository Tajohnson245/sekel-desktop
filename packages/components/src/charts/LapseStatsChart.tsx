import './LapseStatsChart.css';
import { useTranslation } from 'react-i18next';
import type { MissedSystemBreakdown } from '@sekel/db';

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
    systemBreakdown?: MissedSystemBreakdown[];
}

export function LapseStatsChart({ lapseStats, systemBreakdown = [] }: LapseStatsChartProps) {
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

            {systemBreakdown.length > 0 && (
                <div className="missed-by-system">
                    <h5>{t('study.analytics.missed_by_system')}</h5>
                    <ul className="missed-system-list">
                        {systemBreakdown.map(sys => (
                            <li key={sys.systemKey} className="missed-system-item">
                                <span className="missed-system-label">{sys.systemLabel}</span>
                                <span className="missed-system-count">{t('stats.missed_count', { count: sys.missCount })}</span>
                                {sys.topics.length > 0 && (
                                    <ul className="missed-topic-list">
                                        {sys.topics.map(topic => (
                                            <li key={topic.topicKey} className="missed-topic-item">
                                                <span className="missed-topic-label">{topic.topicLabel}</span>
                                                <span className="missed-topic-count">{t('stats.missed_count', { count: topic.missCount })}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
