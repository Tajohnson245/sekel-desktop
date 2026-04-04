import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDecks, useBulkDeleteDecks } from '../../hooks/useDecks';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useDeckEditor } from '../../contexts/DeckEditorContext';
import { Button, Loader, Modal, useToast } from '../UI';
import DeckCard from './DeckCard';
import { useAuthStore } from '../../stores/authStore';
import type { Deck } from '../../lib/types';

export default function DeckList() {
    const { goToDeck } = useAppNavigation();
    const { openDeckEditor } = useDeckEditor();
    const { data: decks = [], isLoading, error } = useDecks();
    const bulkDelete = useBulkDeleteDecks();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const userId = useAuthStore((s) => s.user?.id);

    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [classifiedCardCount, setClassifiedCardCount] = useState<number | null>(null);
    const [affectedPlans, setAffectedPlans] = useState<{ id: string; name: string }[]>([]);

    const toggleDeckSelection = (deckId: string) => {
        const next = new Set(selectedDeckIds);
        if (next.has(deckId)) {
            next.delete(deckId);
        } else {
            next.add(deckId);
        }
        setSelectedDeckIds(next);
    };

    const handleBulkDeleteClick = () => {
        if (selectedDeckIds.size === 0) return;
        setClassifiedCardCount(null);
        setAffectedPlans([]);
        setShowDeleteConfirmation(true);
    };

    useEffect(() => {
        if (!showDeleteConfirmation || selectedDeckIds.size === 0) return;
        const ids = Array.from(selectedDeckIds);
        window.electronAPI.db.fetchBulkClassifiedCardCount(ids)
            .then(setClassifiedCardCount)
            .catch(() => setClassifiedCardCount(null));
        if (userId) {
            window.electronAPI.plan.fetchPlansReferencingDecks(userId, ids)
                .then(setAffectedPlans)
                .catch(() => setAffectedPlans([]));
        }
    }, [showDeleteConfirmation, selectedDeckIds, userId]);

    const confirmDelete = async () => {
        try {
            await bulkDelete.mutateAsync(Array.from(selectedDeckIds));
            setSelectedDeckIds(new Set());
            setIsDeleteMode(false);
            setShowDeleteConfirmation(false);
        } catch (_err) {
            showToast(t('errors.delete_decks'), 'error');
        }
    };

    if (isLoading) {
        return (
            <div className="deck-list">
                <Loader center text={t('decks.loading')} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="deck-list">
                <div className="error">{t('decks.error')}</div>
            </div>
        );
    }

    return (
        <div className="deck-list">
            <div className="deck-list-header">
                <h2>{t('decks.your_decks')}</h2>
                <div className="header-actions">
                    {!isDeleteMode ? (
                        <>
                            <Button
                                variant="danger"
                                onClick={() => setIsDeleteMode(true)}
                                title={t('decks.delete_decks')}
                                icon={<Trash2 size={16} />}
                            >
                                {t('decks.delete_decks')}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={openDeckEditor}
                                data-testid="create-deck-btn"
                                icon={<Plus size={16} />}
                            >
                                {t('decks.new_deck')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setIsDeleteMode(false);
                                    setSelectedDeckIds(new Set());
                                }}
                                icon={<X size={16} />}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleBulkDeleteClick}
                                disabled={selectedDeckIds.size === 0 || bulkDelete.isPending}
                                isLoading={bulkDelete.isPending}
                                icon={!bulkDelete.isPending && <Trash2 size={16} />}
                            >
                                {bulkDelete.isPending ? t('common.deleting') : t('decks.delete_confirm', { count: selectedDeckIds.size })}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {decks.length === 0 ? (
                <div className="empty-state" data-testid="empty-decks">
                    <div className="empty-icon">📚</div>
                    <h3>{t('decks.no_decks')}</h3>
                    <p className="text-muted">{t('decks.start_creating')}</p>
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={openDeckEditor}
                        icon={<Plus size={16} />}
                    >
                        {t('decks.create_deck')}
                    </Button>
                </div>
            ) : (
                <div className="deck-grid" data-testid="deck-grid">
                    {decks.map((deck: Deck) => (
                        <DeckCard
                            key={deck.id}
                            deck={deck}
                            onClick={() => goToDeck(deck.id)}
                            isDeleteMode={isDeleteMode}
                            isSelected={selectedDeckIds.has(deck.id)}
                            onToggleSelect={toggleDeckSelection}
                        />
                    ))}
                </div>
            )}

            <Modal
                isOpen={showDeleteConfirmation}
                onClose={() => setShowDeleteConfirmation(false)}
                title={t('decks.delete_decks')}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setShowDeleteConfirmation(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={confirmDelete}
                            isLoading={bulkDelete.isPending}
                        >
                            {t('common.delete')}
                        </Button>
                    </>
                }
            >
                <p>{t('decks.delete_message', { count: selectedDeckIds.size })}</p>
                <ul className="delete-warning-list">
                    <li>{t('decks.delete_warn_cards')}</li>
                    <li>{t('decks.delete_warn_reviews')}</li>
                    <li>
                        {classifiedCardCount !== null && classifiedCardCount > 0
                            ? t('decks.delete_warn_classifications_count', { count: classifiedCardCount })
                            : t('decks.delete_warn_classifications')}
                    </li>
                    <li>{t('decks.delete_warn_sessions')}</li>
                </ul>
                {affectedPlans.length > 0 && (
                    <div className="delete-plan-warning">
                        <p className="delete-plan-warning-title">
                            {t('decks.delete_warn_plan_title', { count: affectedPlans.length })}
                        </p>
                        <ul className="delete-plan-warning-list">
                            {affectedPlans.map(p => <li key={p.id}>{p.name}</li>)}
                        </ul>
                        <p className="text-muted">{t('decks.delete_warn_plan_detail')}</p>
                    </div>
                )}
                <p className="text-muted">{t('decks.delete_warn_irreversible')}</p>
            </Modal>
        </div>
    );
}
