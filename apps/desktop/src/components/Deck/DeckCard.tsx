import { Library, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from '../../../node_modules/react-i18next';
import type { Deck } from '../../lib/types';

interface DeckCardProps {
    deck: Deck;
    onClick: () => void;
    isDeleteMode?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (deckId: string) => void;
}

export default function DeckCard({
    deck,
    onClick,
    isDeleteMode = false,
    isSelected = false,
    onToggleSelect
}: DeckCardProps) {
    const { t } = useTranslation();

    const handleCardClick = (e: React.MouseEvent) => {
        if (isDeleteMode) {
            e.stopPropagation();
            onToggleSelect?.(deck.id);
        } else {
            onClick();
        }
    };

    // Demo deck name/description translation (when DB has English seed values)
    const displayDeckName = deck.name === 'Testing Deck' ? t('decks.demo_deck_name') : deck.name;
    const displayDeckDesc = deck.description === 'This is a test deck'
        ? t('decks.demo_deck_description')
        : (deck.description || t('dashboard.no_description'));

    return (
        <div
            className={`deck-card ${isDeleteMode ? 'delete-mode' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={handleCardClick}
            data-testid={`deck-card-${deck.id}`}
        >
            {isDeleteMode && (
                <div className="deck-card-checkbox">
                    <div className={`checkbox-custom ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <div className="checkmark" />}
                    </div>
                </div>
            )}

            <div className="deck-card-content">
                <div className="deck-card-header">
                    <div className="deck-icon">
                        <Library size={20} />
                    </div>
                    <h3 className="deck-title">{displayDeckName}</h3>
                </div>

                <p className="deck-description">
                    {displayDeckDesc || t('dashboard.no_description')}
                </p>

                <div className="deck-stats">
                    <div className="deck-stat">
                        <Sparkles size={14} />
                        <span>0 {t('decks.new')}</span>
                    </div>
                    <div className="deck-stat">
                        <Clock size={14} />
                        <span>{t('decks.cards_due', { count: 0 })}</span>
                    </div>
                </div>

                {!isDeleteMode && (
                    <button
                        className="btn btn-secondary deck-study-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick();
                        }}
                    >
                        {t('decks.study_now')}
                    </button>
                )}
            </div>
        </div>
    );
}
