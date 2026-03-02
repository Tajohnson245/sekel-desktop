import { formatInterval } from '../../lib/fsrs';
import { useTranslation } from '../../../node_modules/react-i18next';
import { Button } from '../UI';
import type { Rating, CardUpdate } from '../../lib/types';

interface RatingButtonsProps {
    options: Record<Rating, CardUpdate>;
    onRate: (rating: Rating) => void;
    isLoading: boolean;
}

export default function RatingButtons({ options, onRate, isLoading }: RatingButtonsProps) {
    const { t } = useTranslation();

    const ratings: { rating: Rating; label: string; color: string }[] = [
        { rating: 'again', label: t('study.rating.again'), color: '#ef4444' },
        { rating: 'hard', label: t('study.rating.hard'), color: '#f97316' },
        { rating: 'good', label: t('study.rating.good'), color: '#22c55e' },
        { rating: 'easy', label: t('study.rating.easy'), color: '#3b82f6' },
    ];

    return (
        <div className="rating-buttons" data-testid="rating-buttons">
            {ratings.map(({ rating, label, color }) => {
                const update = options[rating];
                const interval = formatInterval(update.scheduled_days ?? 0);

                return (
                    <Button
                        key={rating}
                        className="rating-btn"
                        style={{ '--rating-color': color } as React.CSSProperties}
                        onClick={() => onRate(rating)}
                        disabled={isLoading}
                        data-testid={`rate-${rating}`}
                        variant="secondary" // Use secondary to match checking base styles, or adjust if needed
                    >
                        <span className="rating-label">{label}</span>
                        <span className="rating-interval">{interval}</span>
                    </Button>
                );
            })}
        </div>
    );
}
