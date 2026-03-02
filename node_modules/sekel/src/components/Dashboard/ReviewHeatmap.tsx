import { useMemo, useState } from 'react';
import { useTranslation } from '../../../node_modules/react-i18next';
import type { ReviewDayCount } from '../../lib/queries';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface ReviewHeatmapProps {
    data: ReviewDayCount[];
}

interface DayCell {
    date: string;       // YYYY-MM-DD
    count: number;
    weekday: number;    // 0=Sun … 6=Sat
    weekIndex: number;  // column index
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const CELL_SIZE = 13;
const CELL_GAP = 3;
const TOTAL_WEEKS = 52;
const DAYS_IN_WEEK = 7;

const MONTH_LABEL_HEIGHT = 18;
const DAY_LABEL_WIDTH = 28;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function buildGrid(data: ReviewDayCount[]): { cells: DayCell[]; months: { label: string; col: number }[] } {
    const lookup = new Map(data.map(d => [d.date, d.count]));

    const today = new Date();
    // Start from the Sunday of the week 51 weeks ago
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - (TOTAL_WEEKS - 1) * 7);

    const cells: DayCell[] = [];
    const months: { label: string; col: number }[] = [];
    const seenMonths = new Set<string>();

    let weekIndex = 0;
    const cursor = new Date(start);

    while (cursor <= today) {
        const weekday = cursor.getDay(); // 0=Sun
        const isoDate = cursor.toISOString().slice(0, 10);
        const count = lookup.get(isoDate) ?? 0;

        cells.push({ date: isoDate, count, weekday, weekIndex });

        // Track month labels — first occurrence in each month
        const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`;
        if (!seenMonths.has(monthKey) && weekday === 0) {
            seenMonths.add(monthKey);
            months.push({
                label: cursor.toLocaleString(undefined, { month: 'short' }),
                col: weekIndex,
            });
        }

        // Advance
        cursor.setDate(cursor.getDate() + 1);
        if (cursor.getDay() === 0) {
            weekIndex++;
        }
    }

    return { cells, months };
}

function getLevel(count: number, max: number): number {
    if (count === 0) return 0;
    if (max <= 0) return 1;
    const ratio = count / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.50) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function ReviewHeatmap({ data }: ReviewHeatmapProps) {
    const { t } = useTranslation();
    const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

    const { cells, months, maxCount, totalReviews } = useMemo(() => {
        const { cells, months } = buildGrid(data);
        const maxCount = Math.max(...cells.map(c => c.count), 1);
        const totalReviews = cells.reduce((acc, c) => acc + c.count, 0);
        return { cells, months, maxCount, totalReviews };
    }, [data]);

    const svgWidth = DAY_LABEL_WIDTH + TOTAL_WEEKS * (CELL_SIZE + CELL_GAP);
    const svgHeight = MONTH_LABEL_HEIGHT + DAYS_IN_WEEK * (CELL_SIZE + CELL_GAP);

    const dayLabels = [
        { label: t('dashboard.heatmap_mon'), row: 1 },
        { label: t('dashboard.heatmap_wed'), row: 3 },
        { label: t('dashboard.heatmap_fri'), row: 5 },
    ];

    return (
        <div className="review-heatmap" data-testid="review-heatmap">
            <div className="heatmap-header">
                <span className="heatmap-total">
                    {t('dashboard.heatmap_total', { count: totalReviews })}
                </span>
            </div>

            <div className="heatmap-scroll-container">
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    width="100%"
                    className="heatmap-svg"
                    role="img"
                    aria-label={t('dashboard.review_activity')}
                >
                    {/* Month labels */}
                    {months.map((m, i) => (
                        <text
                            key={i}
                            x={DAY_LABEL_WIDTH + m.col * (CELL_SIZE + CELL_GAP)}
                            y={MONTH_LABEL_HEIGHT - 4}
                            className="heatmap-month-label"
                        >
                            {m.label}
                        </text>
                    ))}

                    {/* Day-of-week labels */}
                    {dayLabels.map(({ label, row }) => (
                        <text
                            key={row}
                            x={0}
                            y={MONTH_LABEL_HEIGHT + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2}
                            className="heatmap-day-label"
                        >
                            {label}
                        </text>
                    ))}

                    {/* Cells */}
                    {cells.map((cell) => {
                        const x = DAY_LABEL_WIDTH + cell.weekIndex * (CELL_SIZE + CELL_GAP);
                        const y = MONTH_LABEL_HEIGHT + cell.weekday * (CELL_SIZE + CELL_GAP);
                        const level = getLevel(cell.count, maxCount);

                        return (
                            <rect
                                key={cell.date}
                                x={x}
                                y={y}
                                width={CELL_SIZE}
                                height={CELL_SIZE}
                                rx={2}
                                ry={2}
                                className={`heatmap-cell heatmap-level-${level}`}
                                onMouseEnter={(e) => {
                                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                                    setTooltip({
                                        x: rect.left + rect.width / 2,
                                        y: rect.top - 8,
                                        text: t('dashboard.heatmap_tooltip', {
                                            count: cell.count,
                                            date: cell.date,
                                        }),
                                    });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            />
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="heatmap-legend">
                <span className="heatmap-legend-label">{t('dashboard.heatmap_less')}</span>
                {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`heatmap-legend-cell heatmap-level-${level}`} />
                ))}
                <span className="heatmap-legend-label">{t('dashboard.heatmap_more')}</span>
            </div>

            {/* Tooltip portal */}
            {tooltip && (
                <div
                    className="heatmap-tooltip"
                    style={{
                        position: 'fixed',
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    {tooltip.text}
                </div>
            )}
        </div>
    );
}
