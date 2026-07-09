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

export default function RatingButtons({ options, onRate, isLoading, disabled = false }: RatingButtonsProps) {
    const { t } = useTranslation();

    return (
        <div className="rating-buttons" data-testid="rating-buttons">
            {RATINGS.map(({ rating, key }) => {
                const update = options?.[rating];
                const interval = update ? formatInterval(update.scheduled_days ?? 0) : '';
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
