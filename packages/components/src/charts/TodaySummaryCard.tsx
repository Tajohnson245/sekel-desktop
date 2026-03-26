import './TodaySummaryCard.css';
import { useTranslation } from 'react-i18next';

export interface TodaySummaryData {
    totalReviews: number;
    againCount: number;
    newCount: number;
    learnCount: number;
    reviewCount: number;
    relearnCount: number;
    totalTimeMs: number;
}

interface TodaySummaryCardProps {
    data: TodaySummaryData;
}

function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

export function TodaySummaryCard({ data }: TodaySummaryCardProps) {
    const { t } = useTranslation();

    const correctPercent = data.totalReviews > 0
        ? Math.round(((data.totalReviews - data.againCount) / data.totalReviews) * 100)
        : 0;

    return (
        <div className="today-summary">
            <h4>{t('stats.today')}</h4>

            <div className="today-summary-grid">
                <div className="today-stat today-stat--accent">
                    <span className="today-stat-value">{data.totalReviews}</span>
                    <span className="today-stat-label">{t('stats.reviews_completed')}</span>
                </div>
                <div className="today-stat">
                    <span className="today-stat-value">{formatTime(data.totalTimeMs)}</span>
                    <span className="today-stat-label">{t('stats.time_spent')}</span>
                </div>
                <div className="today-stat">
                    <span className="today-stat-value">{data.totalReviews > 0 ? `${correctPercent}%` : '--'}</span>
                    <span className="today-stat-label">{t('stats.correct')}</span>
                </div>
                <div className="today-stat today-stat--warning">
                    <span className="today-stat-value">{data.againCount}</span>
                    <span className="today-stat-label">{t('stats.again_count')}</span>
                </div>
            </div>

            {data.totalReviews > 0 && (
                <div className="today-breakdown">
                    {data.newCount > 0 && (
                        <span className="today-breakdown-pill">
                            <span className="pill-count">{data.newCount}</span> {t('stats.new')}
                        </span>
                    )}
                    {data.learnCount > 0 && (
                        <span className="today-breakdown-pill">
                            <span className="pill-count">{data.learnCount}</span> {t('stats.learning')}
                        </span>
                    )}
                    {data.reviewCount > 0 && (
                        <span className="today-breakdown-pill">
                            <span className="pill-count">{data.reviewCount}</span> {t('stats.review')}
                        </span>
                    )}
                    {data.relearnCount > 0 && (
                        <span className="today-breakdown-pill">
                            <span className="pill-count">{data.relearnCount}</span> {t('stats.relearn')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
