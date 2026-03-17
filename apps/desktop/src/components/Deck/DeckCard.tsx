import { useState, useRef } from 'react';
import { Library, Clock, Sparkles, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Deck } from '../../lib/types';
import { useUpdateDeck } from '../../hooks/useDecks';
import './DeckCard.css';

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
    const updateDeck = useUpdateDeck();
    const inputRef = useRef<HTMLInputElement>(null);

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const handleCardClick = (e: React.MouseEvent) => {
        if (isDeleteMode) {
            e.stopPropagation();
            onToggleSelect?.(deck.id);
        } else {
            onClick();
        }
    };

    const handleStartRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRenameValue(deck.name);
        setIsRenaming(true);
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const handleCommitRename = async () => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== deck.name) {
            await updateDeck.mutateAsync({ id: deck.id, updates: { name: trimmed } });
        }
        setIsRenaming(false);
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
                    {isRenaming ? (
                        <input
                            ref={inputRef}
                            className="deck-card-rename-input"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={handleCommitRename}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleCommitRename();
                                if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                        />
                    ) : (
                        <h3 className="deck-title">
                            {displayDeckName}
                            {!isDeleteMode && (
                                <button
                                    className="deck-card-rename-btn"
                                    onClick={handleStartRename}
                                    title="Rename deck"
                                >
                                    <Pencil size={12} />
                                </button>
                            )}
                        </h3>
                    )}
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
