import './CardCountsPieChart.css';
import { useTranslation } from 'react-i18next';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export interface CardCountsData {
    newCount: number;
    learningCount: number;
    youngCount: number;
    matureCount: number;
}

interface CardCountsPieChartProps {
    data: CardCountsData;
}

// §11 count-maturity semantics: New = VIOLET, Learning = AMBER, Mature = TEAL
// (user's mastery metric). Young sits between learning and mastery, so it reads
// as a muted teal (teal mixed toward slate) to signal "approaching mastery".
const COLORS = {
    new:      'var(--violet)',
    learning: 'var(--amber)',
    young:    'color-mix(in srgb, var(--teal) 45%, var(--slate))',
    mature:   'var(--teal)',
};

export function CardCountsPieChart({ data }: CardCountsPieChartProps) {
    const { t } = useTranslation();

    const total = data.newCount + data.learningCount + data.youngCount + data.matureCount;

    if (total === 0) return null;

    const chartData = [
        { name: t('stats.new'), value: data.newCount, color: COLORS.new },
        { name: t('stats.learning'), value: data.learningCount, color: COLORS.learning },
        { name: t('stats.young'), value: data.youngCount, color: COLORS.young },
        { name: t('stats.mature'), value: data.matureCount, color: COLORS.mature },
    ].filter(d => d.value > 0);

    return (
        <div className="card-counts-pie">
            <h4>{t('stats.card_counts')}</h4>
            <p className="chart-desc">{t('stats.card_counts_desc')}</p>

            <div className="pie-chart-wrapper">
                <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={85}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} stroke="var(--panel)" strokeWidth={2} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number, name: string) => [
                                `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                                name,
                            ]}
                            contentStyle={{ backgroundColor: 'var(--panel-2)', border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}
                            labelStyle={{ color: 'var(--mist)' }}
                            itemStyle={{ color: 'var(--paper)' }}
                        />
                    </PieChart>
                </ResponsiveContainer>

                <div className="pie-legend">
                    {[
                        { key: 'new', label: t('stats.new'), count: data.newCount, color: COLORS.new },
                        { key: 'learning', label: t('stats.learning'), count: data.learningCount, color: COLORS.learning },
                        { key: 'young', label: t('stats.young'), count: data.youngCount, color: COLORS.young },
                        { key: 'mature', label: t('stats.mature'), count: data.matureCount, color: COLORS.mature },
                    ].map(item => (
                        <div key={item.key} className="pie-legend-item">
                            <span className="pie-legend-dot" style={{ background: item.color }} />
                            <span>{item.label}</span>
                            <span className="pie-legend-count">{item.count}</span>
                        </div>
                    ))}
                    <div className="pie-total">
                        {t('stats.total')}: <strong>{total}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}
