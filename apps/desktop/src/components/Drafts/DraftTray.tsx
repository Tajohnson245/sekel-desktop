import { useState, useMemo } from 'react';
import { Inbox, X, Trash2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDrafts, useDeleteDraft, useClearDrafts, usePromoteDraftToDeck, DRAFT_LIMIT } from '../../hooks/useDrafts';
import { useDecks } from '../../hooks/useDecks';
import { Button } from '../UI';
import './DraftTray.css';

interface DraftTrayProps {
    userId: string;
}

export default function DraftTray({ userId }: DraftTrayProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [selectedDeckIds, setSelectedDeckIds] = useState<Record<string, string>>({});

    const { data: drafts = [] } = useDrafts();
    const { data: decks = [] } = useDecks();
    const deleteDraft = useDeleteDraft();
    const clearDrafts = useClearDrafts();
    const promoteDraft = usePromoteDraftToDeck(userId);

    const count = drafts.length;
    const isFull = count >= DRAFT_LIMIT;

    const deckOptions = useMemo(() =>
        decks.map(d => ({ label: d.name, value: d.id })),
        [decks]
    );

    const handlePromote = async (draftId: string) => {
        const deckId = selectedDeckIds[draftId];
        if (!deckId) return;
        const draft = drafts.find(d => d.id === draftId);
        if (!draft) return;
        await promoteDraft.mutateAsync({ draftId, deckId, front: draft.front, back: draft.back });
        setSelectedDeckIds(prev => {
            const next = { ...prev };
            delete next[draftId];
            return next;
        });
    };

    const formatContent = (content: string) => {
        if (!content) return '';
        const hasImage = content.includes('<img');
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
                    <span className="draft-image-badge" style={{ fontSize: '0.85em', marginLeft: '6px', color: '#888', fontStyle: 'italic' }}>
                        {t('card.one_image_added')}
                    </span>
                )}
            </>
        );
    };

    return (
        <>
            {/* Header trigger button */}
            <button
                className={`draft-tray-trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(prev => !prev)}
                title={t('drafts.title')}
                aria-label={`${t('drafts.title')} (${count} drafts)`}
            >
                <Inbox size={18} />
                {count > 0 && (
                    <span className="draft-tray-badge">{count}</span>
                )}
            </button>

            {/* Slide-in panel */}
            {isOpen && (
                <div className="draft-tray-overlay" onClick={() => setIsOpen(false)}>
                    <aside
                        className="draft-tray-panel"
                        onClick={e => e.stopPropagation()}
                        aria-label={t('drafts.panel_label')}
                    >
                        {/* Panel header */}
                        <div className="draft-tray-header">
                            <div className="draft-tray-title">
                                <Inbox size={18} />
                                <span>{t('drafts.title')}</span>
                            </div>
                            <div className="draft-tray-meta">
                                <span className={`draft-capacity ${isFull ? 'full' : ''}`}>
                                    {t('drafts.capacity', { count, limit: DRAFT_LIMIT })}
                                </span>
                                <button
                                    className="draft-tray-close"
                                    onClick={() => setIsOpen(false)}
                                    aria-label={t('drafts.close')}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Draft list */}
                        <div className="draft-tray-body">
                            {drafts.length === 0 ? (
                                <div className="draft-empty">
                                    <Inbox size={32} />
                                    <p>{t('drafts.empty')}</p>
                                    <p className="draft-empty-hint">
                                        {t('drafts.empty_hint')}
                                    </p>
                                </div>
                            ) : (
                                <ul className="draft-list">
                                    {drafts.map(draft => (
                                        <li key={draft.id} className="draft-item">
                                            <div className="draft-item-content">
                                                <div className="draft-field">
                                                    <span className="draft-field-label">{t('drafts.front')}</span>
                                                    <p className="draft-field-text">{formatContent(draft.front)}</p>
                                                </div>
                                                <div className="draft-field">
                                                    <span className="draft-field-label">{t('drafts.back')}</span>
                                                    <p className="draft-field-text">{formatContent(draft.back)}</p>
                                                </div>
                                                {draft.source && (
                                                    <span className="draft-source">{draft.source}</span>
                                                )}
                                            </div>

                                            <div className="draft-item-actions">
                                                <select
                                                    className="draft-deck-select"
                                                    value={selectedDeckIds[draft.id] ?? ''}
                                                    onChange={e => setSelectedDeckIds(prev => ({
                                                        ...prev,
                                                        [draft.id]: e.target.value,
                                                    }))}
                                                    aria-label={t('drafts.select_deck')}
                                                >
                                                    <option value="">{t('drafts.select_deck')}</option>
                                                    {deckOptions.map(opt => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>

                                                <Button
                                                    variant="primary"
                                                    onClick={() => handlePromote(draft.id)}
                                                    disabled={!selectedDeckIds[draft.id] || promoteDraft.isPending}
                                                    isLoading={promoteDraft.isPending}
                                                    icon={<ChevronRight size={14} />}
                                                    title={t('drafts.add_to_deck')}
                                                >
                                                    {t('drafts.add_to_deck')}
                                                </Button>

                                                <Button
                                                    variant="icon"
                                                    className="text-danger"
                                                    onClick={() => deleteDraft.mutate(draft.id)}
                                                    disabled={deleteDraft.isPending}
                                                    icon={<Trash2 size={14} />}
                                                    title={t('drafts.delete')}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Panel footer */}
                        {drafts.length > 0 && (
                            <div className="draft-tray-footer">
                                <Button
                                    variant="danger"
                                    onClick={() => clearDrafts.mutate()}
                                    disabled={clearDrafts.isPending}
                                    isLoading={clearDrafts.isPending}
                                    icon={<Trash2 size={14} />}
                                >
                                    {t('drafts.clear_all')}
                                </Button>
                            </div>
                        )}
                    </aside>
                </div>
            )}
        </>
    );
}
