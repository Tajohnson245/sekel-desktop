import { useState, useMemo } from 'react';
import { Inbox, Trash2, ChevronRight, Clock, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDrafts, useDeleteDraft, useClearDrafts, usePromoteDraftToDeck, DRAFT_LIMIT } from '../../hooks/useDrafts';
import { useDecks } from '../../hooks/useDecks';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../UI';
import './DraftsPage.css';

function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

export default function DraftsPage() {
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { t } = useTranslation();
    const [selectedDeckIds, setSelectedDeckIds] = useState<Record<string, string>>({});
    const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());

    const { data: drafts = [], isLoading } = useDrafts();
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
        setPromotedIds(prev => new Set([...prev, draftId]));
        setSelectedDeckIds(prev => {
            const next = { ...prev };
            delete next[draftId];
            return next;
        });
    };

    return (
        <div className="drafts-page">
            {/* Page header */}
            <div className="drafts-page-header">
                <div className="drafts-page-title">
                    <Inbox size={24} />
                    <h2>{t('drafts.title')}</h2>
                </div>
                <div className="drafts-page-meta">
                    <span className={`drafts-capacity ${isFull ? 'full' : ''}`}>
                        {t('drafts.capacity', { count, limit: DRAFT_LIMIT })}
                    </span>
                    {drafts.length > 0 && (
                        <Button
                            variant="danger"
                            onClick={() => clearDrafts.mutate()}
                            disabled={clearDrafts.isPending}
                            isLoading={clearDrafts.isPending}
                            icon={<Trash2 size={14} />}
                        >
                            {t('drafts.clear_all')}
                        </Button>
                    )}
                </div>
            </div>

            <p className="drafts-page-description text-muted">
                {t('drafts.page_description', { limit: DRAFT_LIMIT })}
            </p>

            {/* Content */}
            {isLoading ? (
                <div className="drafts-loading">{t('common.loading')}</div>
            ) : drafts.length === 0 ? (
                <div className="drafts-empty">
                    <Inbox size={48} />
                    <h3>{t('drafts.empty')}</h3>
                    <p>{t('drafts.empty_hint')}</p>
                </div>
            ) : (
                <div className="drafts-grid">
                    {drafts.map(draft => (
                        <div key={draft.id} className={`draft-card ${promotedIds.has(draft.id) ? 'promoted' : ''}`}>
                            <div className="draft-card-body">
                                <div className="draft-card-field">
                                    <span className="draft-card-field-label">{t('card.front')}</span>
                                    <p className="draft-card-field-text">{draft.front}</p>
                                </div>
                                <div className="draft-card-divider" />
                                <div className="draft-card-field">
                                    <span className="draft-card-field-label">{t('card.back')}</span>
                                    <p className="draft-card-field-text">{draft.back}</p>
                                </div>
                            </div>
                            <div className="draft-card-meta">
                                <span className="draft-meta-item" title={draft.created_at}>
                                    <Clock size={11} />
                                    {formatDate(draft.created_at)}
                                </span>
                                {draft.source && (
                                    <span className="draft-meta-item">
                                        <FileText size={11} />
                                        <span className="draft-meta-source" title={draft.source}>{draft.source}</span>
                                    </span>
                                )}
                            </div>

                            <div className="draft-card-actions">
                                <select
                                    className="draft-card-deck-select custom-select"
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

                                <div className="draft-card-btns">
                                    <Button
                                        variant="primary"
                                        onClick={() => handlePromote(draft.id)}
                                        disabled={!selectedDeckIds[draft.id] || promoteDraft.isPending}
                                        isLoading={promoteDraft.isPending}
                                        icon={<ChevronRight size={14} />}
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
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
