import './TimePerCardChart.css';
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

export interface TimeByRatingItem {
    rating: string;
    averageMs: number;
    count: number;
}

export interface SlowestCard {
    cardId: string;
    durationMs: number;
    frontPreview: string | null;
}

export interface TimeStats {
    averageTimeMs: number;
    timeByRating: TimeByRatingItem[];
    slowestCards: SlowestCard[];
}

const RATING_COLORS: Record<string, string> = {
    again: 'var(--danger, #ef4444)',
    hard: 'var(--warning, #f59e0b)',
    good: 'var(--success, #22c55e)',
    easy: 'var(--primary, #3b82f6)',
};

interface TimePerCardChartProps {
    timeStats: TimeStats;
}

export function TimePerCardChart({ timeStats }: TimePerCardChartProps) {
    const { t } = useTranslation();
    const { averageTimeMs, timeByRating, slowestCards } = timeStats;

    if (timeByRating.length === 0) return null;

    const avgSeconds = (averageTimeMs / 1000).toFixed(1);

    const chartData = timeByRating.map((d) => ({
        ...d,
        label: t(`study.rating.${d.rating}`),
        seconds: Number((d.averageMs / 1000).toFixed(1)),
    }));

    const maxSeconds = Math.max(1, ...chartData.map((d) => d.seconds));
    const xDomain: [number, number] = [0, Math.ceil(maxSeconds * 1.2)];

    return (
        <div className="analytics-chart time-per-card">
            <h4>{t('study.analytics.time_per_card')}</h4>
            <p className="chart-desc text-muted">{t('study.analytics.time_per_card_desc')}</p>

            <div className="time-summary">
                <span className="time-avg-big">{avgSeconds}s</span>
                <p className="text-muted">{t('study.analytics.average_time', { seconds: avgSeconds })}</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 50, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                        type="number"
                        domain={xDomain}
                        stroke="var(--muted)"
                        tick={{ fontSize: 13 }}
                        label={{ value: t('study.analytics.seconds_abbrev'), position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                        dataKey="label"
                        type="category"
                        stroke="var(--muted)"
                        tick={{ fontSize: 13, dx: -12 }}
                        tickMargin={12}
                        width={75}
                    />
                    <Tooltip
                        formatter={(value: number, _name: string, props: { payload?: typeof chartData[number] }) => {
                            const p = props?.payload;
                            if (!p) return [String(value), ''];
                            return [
                                `${p.seconds}s avg (${p.count} reviews)`,
                                t(`study.rating.${p.rating}`),
                            ];
                        }}
                        contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="seconds" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell key={index} fill={RATING_COLORS[entry.rating] ?? 'var(--muted)'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {slowestCards.length > 0 && (
                <div className="slowest-cards">
                    <h5>{t('study.analytics.slowest_cards')}</h5>
                    <ul className="slowest-list">
                        {slowestCards.map((item) => (
                            <li key={item.cardId}>
                                {item.frontPreview ? (
                                    <span className="card-preview" title={item.frontPreview}>
                                        {item.frontPreview}
                                        {item.frontPreview.length >= 60 ? '...' : ''}
                                    </span>
                                ) : null}
                                <span className="card-time">
                                    {(item.durationMs / 1000).toFixed(1)}s
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
