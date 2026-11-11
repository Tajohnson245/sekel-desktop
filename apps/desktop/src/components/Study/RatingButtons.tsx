import { formatInterval } from '../../lib/fsrs';
import { useTranslation } from 'react-i18next';
import type { Rating, CardUpdate } from '../../lib/types';
import './RatingButtons.css';

interface RatingButtonsProps {
    options: Record<Rating, CardUpdate> | null;
    onRate: (rating: Rating) => void;
    isLoading: boolean;
    /** Pre-reveal: buttons stay visible (zero layout shift) but are disabled. */
    disabled?: boolean;
}

// Again 1 · Hard 2 · Good 3 · Easy 4 (spec §7.2 / §8). Colors set in CSS by
// [data-rating]: ROSE / AMBER / TEAL / VIOLET.
const RATINGS: { rating: Rating; key: string }[] = [
    { rating: 'again', key: '1' },
    { rating: 'hard', key: '2' },
    { rating: 'good', key: '3' },
    { rating: 'easy', key: '4' },
];

/**
 * Time until the card would be due after this rating. ts-fsrs reports
 * scheduled_days = 0 for (re)learning steps, so labelling from it showed "0m"
 * for the 1- and 10-minute steps; the due timestamp is exact.
 */
export function intervalDays(update: { due?: string; scheduled_days?: number }, nowMs = Date.now()): number {
    if (update.due) {
        const dueMs = new Date(update.due).getTime();
        if (Number.isFinite(dueMs)) return Math.max(0, (dueMs - nowMs) / 86_400_000);
    }
    return update.scheduled_days ?? 0;
}

export default function RatingButtons({ options, onRate, isLoading, disabled = false }: RatingButtonsProps) {
    const { t } = useTranslation();

    return (
        <div className="rating-buttons" data-testid="rating-buttons">
            {RATINGS.map(({ rating, key }) => {
                const update = options?.[rating];
                const interval = update ? formatInterval(intervalDays(update)) : '';
                return (
                    <button
                        key={rating}
                        className="rating-btn"
                        data-rating={rating}
                        onClick={() => onRate(rating)}
                        disabled={disabled || isLoading || !options}
                        data-testid={`rate-${rating}`}
                    >
                        <span className="rating-btn__head">
                            <span className="kbd rating-btn__key">{key}</span>
                            <span className="rating-label">{t(`study.rating.${rating}`)}</span>
                        </span>
                        <span className="rating-interval">{interval}</span>
                    </button>
                );
            })}
        </div>
    );
}
