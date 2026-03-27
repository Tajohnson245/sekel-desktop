import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useYieldExplanation } from '../../hooks/useYield';
import './YieldBadge.css';

interface YieldBadgeProps {
    level: 'high' | 'medium' | 'low' | 'unclassified';
    score: number | null;
    cardId: string;
    examKey: string;
}

export default function YieldBadge({ level, score, cardId, examKey }: YieldBadgeProps) {
    const { t } = useTranslation();
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const badgeRef = useRef<HTMLButtonElement>(null);

    const { data: explanation, isLoading } = useYieldExplanation(cardId, examKey, tooltipOpen);

    const toggleTooltip = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!tooltipOpen && badgeRef.current) {
            const rect = badgeRef.current.getBoundingClientRect();
            setTooltipPos({
                x: rect.left + rect.width / 2,
                y: rect.top - 8,
            });
        }
        setTooltipOpen(prev => !prev);
    }, [tooltipOpen]);

    const labelKey = `study.yield.${level}` as const;
    const scoreText = score !== null ? ` (${Math.round(score)})` : '';

    return (
        <>
            <button
                ref={badgeRef}
                className={`yield-badge yield-badge--${level}`}
                onClick={toggleTooltip}
                aria-label={t('study.yield.badge_aria', { level: t(labelKey) })}
                type="button"
            >
                <span className="yield-badge__dot" />
                <span className="yield-badge__label">
                    {t(labelKey)}{scoreText}
                </span>
            </button>

            {tooltipOpen && (
                <div
                    className="yield-tooltip"
                    style={{ left: tooltipPos.x, top: tooltipPos.y }}
                >
                    {isLoading
                        ? t('study.yield.loading_explanation')
                        : explanation ?? t('study.yield.loading_explanation')
                    }
                </div>
            )}
        </>
    );
}
