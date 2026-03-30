import { useState, useRef, useEffect } from 'react';
import { Library, Clock, Sparkles, Pencil, MoreVertical, Download, Settings, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Deck } from '../../lib/types';
import { useUpdateDeck, useDeckStats, useDeckClassificationCount } from '../../hooks/useDecks';
import { useAuthStore } from '../../stores/authStore';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useToast } from '../UI';
import { exportDeck } from '../../lib/queries';
import ExportModal from './ExportModal';
import DeckEditor from './DeckEditor';
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
    const { data: stats } = useDeckStats(deck.id);
    const user = useAuthStore(s => s.user);
    const { data: examProfile } = useExamProfile();
    const { data: classificationCount } = useDeckClassificationCount(deck.id, examProfile?.exam_key);
    const { showToast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    const handleExport = async () => {
        if (!user) return;
        setShowExportModal(false);
        setExporting(true);
        try {
            const filePath = await exportDeck(deck.id, user.id);
            if (filePath) {
                showToast(t('export.success'), 'success');
            }
        } catch {
            showToast(t('export.error'), 'error');
        } finally {
            setExporting(false);
        }
    };

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
        <article
            className={`deck-card ${isDeleteMode ? 'delete-mode' : ''} ${isSelected ? 'selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={displayDeckName}
            aria-pressed={isDeleteMode ? isSelected : undefined}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isDeleteMode) {
                        onToggleSelect?.(deck.id);
                    } else {
                        onClick();
                    }
                }
            }}
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
                        <span>{stats?.newCount ?? 0} {t('decks.new')}</span>
                    </div>
                    <div className="deck-stat">
                        <Clock size={14} />
                        <span>{t('decks.cards_due', { count: (stats?.reviewCount ?? 0) + (stats?.learningCount ?? 0) })}</span>
                    </div>
                    {examProfile && classificationCount && classificationCount.total > 0 && (
                        <div className="deck-stat">
                            <CheckCircle size={14} />
                            <span>{t('classify.deck_badge', { classified: classificationCount.classified, total: classificationCount.total })}</span>
                        </div>
                    )}
                </div>

                {!isDeleteMode && (
                    <div className="deck-card-actions">
                        <button
                            className="btn btn-secondary deck-study-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClick();
                            }}
                        >
                            {t('decks.study_now')}
                        </button>
                        <div className="deck-card-menu-wrapper" ref={menuRef}>
                            <button
                                className="deck-card-menu-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(!showMenu);
                                }}
                                title="More options"
                            >
                                <MoreVertical size={16} />
                            </button>
                            {showMenu && (
                                <div className="deck-card-menu">
                                    <button
                                        className="deck-card-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                            setShowDeckEditor(true);
                                        }}
                                    >
                                        <Settings size={14} />
                                        {t('modals.edit_deck_title')}
                                    </button>
                                    <button
                                        className="deck-card-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                            setShowExportModal(true);
                                        }}
                                        disabled={exporting}
                                    >
                                        <Download size={14} />
                                        {t('export.menu_label')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ExportModal
                isOpen={showExportModal}
                deckId={deck.id}
                deckName={deck.name}
                userId={user?.id ?? ''}
                onConfirm={handleExport}
                onClose={() => setShowExportModal(false)}
            />

            {showDeckEditor && (
                <DeckEditor
                    deck={deck}
                    userId={user?.id ?? ''}
                    onClose={() => setShowDeckEditor(false)}
                />
            )}
        </article>
    );
}
