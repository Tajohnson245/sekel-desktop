import { useTranslation } from '../../../../node_modules/react-i18next';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import type { RetentionTrendPoint } from '../../../lib/types';

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
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        dataKey="reviewIndex"
                        stroke="var(--muted)"
                        tick={{ fontSize: 13 }}
                        label={{ value: t('study.analytics.review_index'), position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                        domain={[0, 100]}
                        stroke="var(--muted)"
                        tick={{ fontSize: 13 }}
                        tickFormatter={(v) => `${v}%`}
                        label={{ value: t('study.analytics.retention_percent'), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value: number) => [`${value.toFixed(1)}%`, t('study.analytics.retention')]}
                        labelFormatter={(label) => `Review ${label}`}
                        contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="retentionRate"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        name={t('study.analytics.retention')}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
