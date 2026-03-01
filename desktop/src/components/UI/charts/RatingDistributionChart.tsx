import { useTranslation } from 'react-i18next';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import type { RatingDistributionItem } from '../../../lib/types';

const RATING_COLORS: Record<string, string> = {
    again: 'var(--danger, #ef4444)',
    hard: 'var(--warning, #f59e0b)',
    good: 'var(--success, #22c55e)',
    easy: 'var(--primary, #3b82f6)',
};

interface RatingDistributionChartProps {
    data: RatingDistributionItem[];
}

export function RatingDistributionChart({ data }: RatingDistributionChartProps) {
    const { t } = useTranslation();

    if (data.length === 0) return null;

    const chartData = data.map((d) => ({
        ...d,
        label: t(`study.rating.${d.rating}`),
    }));

    const maxCount = Math.max(1, ...chartData.map((d) => d.count));
    const xDomain: [number, number] = [0, Math.ceil(maxCount * 1.2)];

    return (
        <div className="analytics-chart rating-distribution">
            <h4>{t('study.analytics.rating_distribution')}</h4>
            <p className="chart-desc text-muted">{t('study.analytics.rating_distribution_desc')}</p>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                        type="number"
                        domain={xDomain}
                        stroke="var(--muted)"
                        tick={{ fontSize: 13 }}
                        label={{ value: t('study.analytics.axis_count'), position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                        dataKey="label"
                        type="category"
                        stroke="var(--muted)"
                        tick={{ fontSize: 13, dx: -12 }}
                        tickMargin={12}
                        width={75}
                        label={{ value: t('study.analytics.axis_rating'), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip
                        formatter={(value: number, _name: string, props: { payload?: RatingDistributionItem }) => {
                            const p = props?.payload;
                            if (!p) return [String(value), ''];
                            return [
                                `${p.count} (${p.percent.toFixed(1)}%)`,
                                t(`study.rating.${p.rating}`),
                            ];
                        }}
                        contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell key={index} fill={RATING_COLORS[entry.rating] ?? 'var(--muted)'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
