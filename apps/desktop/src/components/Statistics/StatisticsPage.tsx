import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useReviewHistory } from '../../hooks/useSessions';
import {
    useTodaySummary,
    useCardCountsByMaturity,
    useRetentionByMaturity,
    useMissedCardStats,
    useMissRateTrend,
} from '../../hooks/useStatistics';
import { useExamProfile } from '../../hooks/useExamProfile';
import {
    TodaySummaryCard,
    CardCountsPieChart,
    RetentionTable,
    ReviewHeatmap,
    MissRateTrendChart,
} from '@sekel/components';
import { Tabs, TabList, Tab, TabPanel } from '../UI';
import { MissedTopicsBreakdown } from './MissedTopicsBreakdown';
import type { DateRangeDays } from '../../lib/queries';
import './StatisticsPage.css';

const DATE_RANGE_OPTIONS: { label: string; value: string }[] = [
    { label: 'stats.date_range_7d',  value: '7'   },
    { label: 'stats.date_range_30d', value: '30'  },
    { label: 'stats.date_range_90d', value: '90'  },
    { label: 'stats.date_range_all', value: 'all' },
];

export default function StatisticsPage() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const userId = user?.id;

    const [cardDateRange, setCardDateRange] = useState<DateRangeDays>(30);
    const [reviewDateRange, setReviewDateRange] = useState<DateRangeDays>(30);

    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;

    const { data: todaySummary } = useTodaySummary(userId);
    const { data: cardCounts } = useCardCountsByMaturity(userId);
    const { data: retention } = useRetentionByMaturity(userId);
    const { data: reviewHistory = [] } = useReviewHistory(userId);
    const { data: missedCardData, isLoading: isMissedLoading } = useMissedCardStats(userId, examKey, cardDateRange);
    const { data: missRateTrendData = [] } = useMissRateTrend(userId, reviewDateRange);

    function parseDateRange(value: string): DateRangeDays {
        if (value === 'all') return null;
        return Number(value) as DateRangeDays;
    }

    return (
        <div className="statistics-page" data-tour-id="statistics-page">
            <div className="page-header">
                <h2>{t('stats.title')}</h2>
                <p className="text-muted">{t('stats.subtitle')}</p>
            </div>

            <Tabs defaultTab="overview">
                <TabList>
                    <Tab id="overview">{t('stats.tab_overview')}</Tab>
                    <Tab id="cards">{t('stats.tab_cards')}</Tab>
                    <Tab id="reviews">{t('stats.tab_reviews')}</Tab>
                </TabList>

                {/* ── Overview Tab ─────────────────────────────────── */}
                <TabPanel id="overview">
                    <div className="stats-tab-content">
                        {todaySummary && <TodaySummaryCard data={todaySummary} />}

                        <div className="stats-row">
                            {cardCounts && <CardCountsPieChart data={cardCounts} />}
                            {retention && <RetentionTable data={retention} />}
                        </div>

                        <ReviewHeatmap data={reviewHistory} />
                    </div>
                </TabPanel>

                {/* ── Cards Tab ────────────────────────────────────── */}
                <TabPanel id="cards">
                    <div className="stats-tab-content">
                        {cardCounts && <CardCountsPieChart data={cardCounts} />}

                        <div className="stats-controls-row">
                            <select
                                className="stats-date-select custom-select"
                                value={cardDateRange == null ? 'all' : String(cardDateRange)}
                                onChange={e => setCardDateRange(parseDateRange(e.target.value))}
                            >
                                {DATE_RANGE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
                                ))}
                            </select>
                        </div>

                        {examKey ? (
                            missedCardData && (
                                <MissedTopicsBreakdown data={missedCardData} isLoading={isMissedLoading} />
                            )
                        ) : (
                            <p className="stats-empty">{t('stats.no_exam_profile_breakdown')}</p>
                        )}
                    </div>
                </TabPanel>

                {/* ── Reviews Tab ──────────────────────────────────── */}
                <TabPanel id="reviews">
                    <div className="stats-tab-content">
                        <div className="stats-controls-row">
                            <select
                                className="stats-date-select custom-select"
                                value={reviewDateRange == null ? 'all' : String(reviewDateRange)}
                                onChange={e => setReviewDateRange(parseDateRange(e.target.value))}
                            >
                                {DATE_RANGE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
                                ))}
                            </select>
                        </div>

                        <ReviewHeatmap data={reviewHistory} />
                        <MissRateTrendChart data={missRateTrendData} />
                    </div>
                </TabPanel>
            </Tabs>
        </div>
    );
}
