import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useReviewHistory } from '../../hooks/useSessions';
import {
    useTodaySummary,
    useCardCountsByMaturity,
    useRetentionByMaturity,
} from '../../hooks/useStatistics';
import {
    TodaySummaryCard,
    CardCountsPieChart,
    RetentionTable,
    ReviewHeatmap,
} from '@sekel/components';
import { Tabs, TabList, Tab, TabPanel } from '../UI';
import './StatisticsPage.css';

export default function StatisticsPage() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const userId = user?.id;

    const { data: todaySummary } = useTodaySummary(userId);
    const { data: cardCounts } = useCardCountsByMaturity(userId);
    const { data: retention } = useRetentionByMaturity(userId);
    const { data: reviewHistory = [] } = useReviewHistory(userId);

    return (
        <div className="statistics-page">
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

                {/* ── Cards Tab (placeholder for Phase 4 distribution charts) ── */}
                <TabPanel id="cards">
                    <div className="stats-tab-content">
                        {cardCounts && <CardCountsPieChart data={cardCounts} />}
                        <p className="stats-empty">{t('stats.more_coming_soon')}</p>
                    </div>
                </TabPanel>

                {/* ── Reviews Tab (placeholder for Phase 3 time charts) ── */}
                <TabPanel id="reviews">
                    <div className="stats-tab-content">
                        <ReviewHeatmap data={reviewHistory} />
                        <p className="stats-empty">{t('stats.more_coming_soon')}</p>
                    </div>
                </TabPanel>
            </Tabs>
        </div>
    );
}
