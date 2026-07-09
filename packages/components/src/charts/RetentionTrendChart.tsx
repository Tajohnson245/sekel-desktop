import './RetentionTrendChart.css';
import { useTranslation } from 'react-i18next';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export interface RetentionTrendPoint {
    reviewIndex: number;
    retentionRate: number;
}

interface RetentionTrendChartProps {
    data: RetentionTrendPoint[];
}

export function RetentionTrendChart({ data }: RetentionTrendChartProps) {
    const { t } = useTranslation();

    if (data.length === 0) return null;

    return (
        <div className="analytics-chart retention-trend">
            <h4>{t('study.analytics.retention_trend')}</h4>
            <p className="chart-desc text-muted">{t('study.analytics.retention_trend_desc')}</p>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke)" vertical={false} />
                    <XAxis
                        dataKey="reviewIndex"
                        stroke="var(--slate)"
                        tick={{ fontSize: 13 }}
                        label={{ value: t('study.analytics.review_index'), position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                        domain={[0, 100]}
                        stroke="var(--slate)"
                        tick={{ fontSize: 13 }}
                        tickFormatter={(v) => `${v}%`}
                        label={{ value: t('study.analytics.retention_percent'), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value: number) => [`${value.toFixed(1)}%`, t('study.analytics.retention')]}
                        labelFormatter={(label) => `Review ${label}`}
                        contentStyle={{ backgroundColor: 'var(--panel-2)', border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}
                        labelStyle={{ color: 'var(--mist)' }}
                        itemStyle={{ color: 'var(--paper)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="retentionRate"
                        stroke="var(--amber)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: 'var(--amber)' }}
                        activeDot={{ r: 6 }}
                        name={t('study.analytics.retention')}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
