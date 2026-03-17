import { useState } from 'react';
import { Plus, Trash2, Sparkles, AlertTriangle, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotesByDeck, useDeleteNote } from '../../hooks/useNotes';
import type { Note } from '../../lib/types';
import { Button, Modal } from '../UI';

interface CardListProps {
    deckId: string;
    onAddCard: () => void;
    onGenerateAI?: () => void;
    onEdit?: (note: Note) => void;
}

export default function CardList({ deckId, onAddCard, onGenerateAI, onEdit }: CardListProps) {
    const { t } = useTranslation();
    const { data: notes = [], isLoading, error } = useNotesByDeck(deckId);
    const deleteNote = useDeleteNote();
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const handleDeleteConfirm = async () => {
        if (!pendingDeleteId) return;
        await deleteNote.mutateAsync({ id: pendingDeleteId, deckId });
        setPendingDeleteId(null);
    };

    if (isLoading) {
        return <div className="loading">{t('common.loading')}</div>;
    }

    if (error) {
        return <div className="error">{t('common.error')}</div>;
    }

    const formatContent = (content: string) => {
        if (!content) return t('common.empty');

        // Check for images
        const hasImage = content.includes('<img');

        // Strip HTML tags for clean text preview
        const cleanText = content
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .trim();

        return (
            <>
                {cleanText}
                {hasImage && (
                    <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '8px', fontStyle: 'italic' }}>
                        {t('card.one_image_added')}
                    </span>
                )}
            </>
        );
    };

    return (
        <div className="card-list">
            <Modal
                isOpen={!!pendingDeleteId}
                onClose={() => setPendingDeleteId(null)}
                title={t('modals.delete_card_title')}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPendingDeleteId(null)}>
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

            {notes.length === 0 ? (
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
                    {notes.map((note: Note) => {
                        const isOcclusion = !!note.fields.Image && !!note.fields.Rectangles;

                        return (
                            <div key={note.id} className="card-item" data-testid={`card-${note.id}`}>
                                <div className="card-item-content">
                                    {isOcclusion ? (
                                        <>
                                            <div className="card-front">
                                                <span className="card-label">{t('card.front')}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <img
                                                        src={note.fields.Image}
                                                        alt="Occlusion"
                                                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius)', flexShrink: 0 }}
                                                    />
                                                    <span style={{ fontSize: '0.9em' }}>
                                                        {note.fields.Front?.trim()
                                                            ? <span dangerouslySetInnerHTML={{ __html: note.fields.Front }} />
                                                            : <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85em' }}>{t('occlusion.title')} #{(parseInt(note.fields.ActiveIndex, 10) || 0) + 1}</span>
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="card-back">
                                                <span className="card-label">{t('card.back')}</span>
                                                {note.fields.Back?.trim()
                                                    ? <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: note.fields.Back }} />
                                                    : <span className="text-muted" style={{ fontSize: '0.85em', fontStyle: 'italic' }}>{t('occlusion.title')}</span>
                                                }
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="card-front">
                                                <span className="card-label">{t('card.front')}</span>
                                                <p>{formatContent(note.fields.Front ?? Object.values(note.fields)[0] ?? '')}</p>
                                            </div>
                                            <div className="card-back">
                                                <span className="card-label">{t('card.back')}</span>
                                                <p>{formatContent(note.fields.Back ?? Object.values(note.fields)[1] ?? '')}</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="card-item-actions">
                                    {onEdit && (
                                        <Button
                                            variant="icon"
                                            onClick={() => onEdit(note)}
                                            aria-label={t('card.edit_card')}
                                            title={t('card.edit_card')}
                                            data-testid={`edit-card-${note.id}`}
                                            icon={<Pencil size={16} />}
                                        />
                                    )}
                                    <Button
                                        variant="icon"
                                        className="btn-danger"
                                        onClick={() => setPendingDeleteId(note.id)}
                                        aria-label={t('card.delete_card')}
                                        title={t('card.delete_card')}
                                        data-testid={`delete-card-${note.id}`}
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
