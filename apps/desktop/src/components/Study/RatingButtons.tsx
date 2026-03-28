import { formatInterval } from '../../lib/fsrs';
import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import type { Rating, CardUpdate } from '../../lib/types';
import './RatingButtons.css';

interface RatingButtonsProps {
    options: Record<Rating, CardUpdate>;
    onRate: (rating: Rating) => void;
    isLoading: boolean;
}

export default function RatingButtons({ options, onRate, isLoading }: RatingButtonsProps) {
    const { t } = useTranslation();

    const ratings: { rating: Rating; label: string }[] = [
        { rating: 'again', label: t('study.rating.again') },
        { rating: 'hard',  label: t('study.rating.hard')  },
        { rating: 'good',  label: t('study.rating.good')  },
        { rating: 'easy',  label: t('study.rating.easy')  },
    ];

    return (
        <div className="rating-buttons" data-testid="rating-buttons">
            {ratings.map(({ rating, label }) => {
                const update = options[rating];
                const interval = formatInterval(update.scheduled_days ?? 0);

                return (
                    <Button
                        key={rating}
                        className="rating-btn"
                        data-rating={rating}
                        onClick={() => onRate(rating)}
                        disabled={isLoading}
                        data-testid={`rate-${rating}`}
                        variant="ghost"
                    >
                        <span className="rating-label">{label}</span>
                        <span className="rating-interval">{interval}</span>
                    </Button>
                );
            })}
        </div>
    );
}
