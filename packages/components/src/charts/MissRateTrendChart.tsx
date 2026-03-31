import './MissRateTrendChart.css';
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
import type { MissRateTrendPoint } from '@sekel/db';

interface MissRateTrendChartProps {
    data: MissRateTrendPoint[];
    isLoading?: boolean;
}

export function MissRateTrendChart({ data, isLoading }: MissRateTrendChartProps) {
    const { t } = useTranslation();

    if (isLoading || data.length === 0) return null;

    return (
        <div className="analytics-chart miss-rate-trend">
            <h4>{t('stats.miss_rate_trend')}</h4>
            <p className="chart-desc text-muted">{t('stats.miss_rate_trend_desc')}</p>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--muted)"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(val: string) => {
                            // Weekly label: "2025-W12" → "W12"
                            if (val.includes('-W')) return val.split('-W')[1] ? `W${val.split('-W')[1]}` : val;
                            // Daily: "2025-03-15" → "Mar 15"
                            const d = new Date(val + 'T00:00:00');
                            return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }}
                        angle={-35}
                        textAnchor="end"
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={[0, 100]}
                        stroke="var(--muted)"
                        tick={{ fontSize: 13 }}
                        tickFormatter={(v: number) => `${v}%`}
                        label={{ value: '%', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value: number) => [`${value.toFixed(1)}%`, t('stats.miss_rate_trend')]}
                        contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="missRate"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name={t('stats.miss_rate_trend')}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
