import { useState } from 'react';
import { Plus, Trash2, Sparkles, AlertTriangle, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCardsByDeck } from '../../hooks/useDecks';
import { useDeleteNote } from '../../hooks/useNotes';
import { useAuthStore } from '../../stores/authStore';
import { renderAnkiTemplate } from '../../lib/mediaResolver';
import type { CardWithNote } from '../../lib/queries';
import type { JoinedNote } from '@sekel/db';
import { Button, Modal } from '../UI';

interface CardListProps {
    deckId: string;
    onAddCard: () => void;
    onGenerateAI?: () => void;
    onEdit?: (note: JoinedNote) => void;
}

export default function CardList({ deckId, onAddCard, onGenerateAI, onEdit }: CardListProps) {
    const { t } = useTranslation();
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { data: cards = [], isLoading, error } = useCardsByDeck(deckId);
    const deleteNote = useDeleteNote();
    const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);

    const handleDeleteConfirm = async () => {
        if (!pendingDeleteNoteId) return;
        await deleteNote.mutateAsync({ id: pendingDeleteNoteId, deckId });
        setPendingDeleteNoteId(null);
    };

    const renderSide = (template: string, fields: Record<string, string>, isAnki: boolean, isBack = false): string => {
        if (isAnki) {
            // Pass '' for frontHtml on back so {{FrontSide}} is stripped (we show front separately)
            return renderAnkiTemplate(template, fields, userId, isBack ? '' : undefined);
        }
        let content = template;
        Object.entries(fields).forEach(([key, value]) => {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        });
        content = content.replace(/\{\{(?!c\d+::)[^}]+\}\}/g, '');
        return content;
    };

    if (isLoading) {
        return <div className="loading">{t('common.loading')}</div>;
    }

    if (error) {
        return <div className="error">{t('common.error')}</div>;
    }

    return (
        <div className="card-list">
            <Modal
                isOpen={!!pendingDeleteNoteId}
                onClose={() => setPendingDeleteNoteId(null)}
                title={t('modals.delete_card_title')}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPendingDeleteNoteId(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDeleteConfirm}
                            isLoading={deleteNote.isPending}
                            icon={<Trash2 size={15} />}
                        >
                            {t('card.delete_card')}
                        </Button>
                    </>
                }
            >
                <div className="card-delete-modal-body">
                    <div className="card-delete-modal-icon">
                        <AlertTriangle size={28} />
                    </div>
                    <p>{t('card.delete_confirm_message')}</p>
                </div>
            </Modal>

            {cards.length === 0 ? (
                <div className="empty-state" data-testid="empty-cards">
                    <div className="empty-icon">📝</div>
                    <h4>{t('card.no_cards')}</h4>
                    <p className="text-muted">{t('card.no_cards_desc')}</p>
                    <div className="empty-actions">
                        <Button
                            variant="secondary"
                            onClick={onAddCard}
                            icon={<Plus size={16} />}
                        >
                            {t('modals.add_card_title')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={onGenerateAI}
                            icon={<Sparkles size={16} />}
                        >
                            {t('nav.generate')}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="cards-grid" data-testid="cards-grid">
                    {cards.map((card: CardWithNote) => {
                        const isOcclusion = !!card.note.fields.Image && !!card.note.fields.Rectangles;
                        const isAnki = card.note.note_type.anki_id !== null;
                        const template = card.note.note_type.card_templates[card.template_index];

                        return (
                            <div key={card.id} className="card-item" data-testid={`card-${card.id}`}>
                                <div className="card-item-content">
                                    {isOcclusion ? (
                                        <>
                                            <div className="card-front">
                                                <span className="card-label">{t('card.front')}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <img
                                                        src={card.note.fields.Image}
                                                        alt="Occlusion"
                                                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius)', flexShrink: 0 }}
                                                    />
                                                    <span style={{ fontSize: '0.9em' }}>
                                                        {card.note.fields.Front?.trim()
                                                            ? <span dangerouslySetInnerHTML={{ __html: card.note.fields.Front }} />
                                                            : <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85em' }}>{t('occlusion.title')} #{(parseInt(card.note.fields.ActiveIndex, 10) || 0) + 1}</span>
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="card-back">
                                                <span className="card-label">{t('card.back')}</span>
                                                {card.note.fields.Back?.trim()
                                                    ? <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: card.note.fields.Back }} />
                                                    : <span className="text-muted" style={{ fontSize: '0.85em', fontStyle: 'italic' }}>{t('occlusion.title')}</span>
                                                }
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="card-front">
                                                <span className="card-label">{t('card.front')}</span>
                                                <p dangerouslySetInnerHTML={{ __html: renderSide(template?.front_template ?? '{{Front}}', card.note.fields, isAnki) }} />
                                            </div>
                                            <div className="card-back">
                                                <span className="card-label">{t('card.back')}</span>
                                                <p dangerouslySetInnerHTML={{ __html: renderSide(template?.back_template ?? '{{Back}}', card.note.fields, isAnki, true) }} />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="card-item-actions">
                                    {onEdit && (
                                        <Button
                                            variant="icon"
                                            onClick={() => onEdit(card.note)}
                                            aria-label={t('card.edit_card')}
                                            title={t('card.edit_card')}
                                            data-testid={`edit-card-${card.id}`}
                                            icon={<Pencil size={16} />}
                                        />
                                    )}
                                    <Button
                                        variant="icon"
                                        className="btn-danger"
                                        onClick={() => setPendingDeleteNoteId(card.note.id)}
                                        aria-label={t('card.delete_card')}
                                        title={t('card.delete_card')}
                                        data-testid={`delete-card-${card.id}`}
                                        icon={<Trash2 size={16} />}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
