import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Trash2, Zap, Plus, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeck, useDeckStats } from '../../hooks/useDecks';
import { useNoteTypes, useCreateNoteType, useNotesByDeck, useDeleteNote } from '../../hooks/useNotes';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useAuthStore } from '../../stores/authStore';
import { useExamProfile } from '../../hooks/useExamProfile';
import CardList from '../Card/CardList';
import NoteEditor from '../Card/NoteEditor';
import DeckEditor from './DeckEditor';
import SessionModeBriefing, { getTierKey } from './SessionModeBriefing';
import { Button, useToast } from '../UI';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import './DeckDetail.css';

export default function DeckDetail() {
    const { deckId } = useParams<{ deckId: string }>();
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { goToDecks, goToStudy, goToDocuments } = useAppNavigation();
    const id = deckId!;
    const { data: deck, isLoading: deckLoading } = useDeck(id);
    const { data: stats } = useDeckStats(id);
    const { data: noteTypes = [] } = useNoteTypes(userId);
    const { data: notes = [] } = useNotesByDeck(id);
    const createNoteType = useCreateNoteType();
    const deleteNote = useDeleteNote();
    const { t } = useTranslation();
    const { showToast } = useToast();

    const [showNoteEditor, setShowNoteEditor] = useState(false);
    const [editingNote, setEditingNote] = useState<import('@sekel/db').JoinedNote | null>(null);
    const [defaultNoteTypeId, setDefaultNoteTypeId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showModeBriefing, setShowModeBriefing] = useState(false);
    const { data: examProfile } = useExamProfile();

    // Ensure we have a default note type (Basic)
    useEffect(() => {
        const ensureDefaultNoteType = async () => {
            if (noteTypes.length === 0 && !createNoteType.isPending) {
                // Create the default "Basic" note type
                const basic = DEFAULT_NOTE_TYPES[0];
                const created = await createNoteType.mutateAsync({
                    user_id: userId,
                    name: basic.name,
                    fields: basic.fields,
                    card_templates: basic.card_templates,
                });
                setDefaultNoteTypeId(created.id);
            } else if (noteTypes.length > 0 && !defaultNoteTypeId) {
                // Use the first available note type
                setDefaultNoteTypeId(noteTypes[0].id);
            }
        };
        ensureDefaultNoteType();
    }, [noteTypes, userId, createNoteType, defaultNoteTypeId]);

    const handleDeleteAllCards = async () => {
        setIsDeleting(true);
        try {
            // Delete all notes (cards are cascade deleted)
            for (const note of notes) {
                await deleteNote.mutateAsync({ id: note.id, deckId: id });
            }
            setShowDeleteConfirm(false);
        } catch (_error) {
            showToast(t('errors.delete_cards'), 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleEditNote = (note: import('@sekel/db').JoinedNote) => {
        setEditingNote(note);
        setShowNoteEditor(true);
    };

    const handleAddNote = () => {
        setEditingNote(null);
        setShowNoteEditor(true);
    };

    if (deckLoading) {
        return <div className="loading">{t('decks.loading')}</div>;
    }

    if (!deck) {
        return <div className="error">{t('decks.error')}</div>;
    }

    const totalCards = stats?.totalCount ?? 0;
    const dueCards = (stats?.newCount ?? 0) + (stats?.learningCount ?? 0) + (stats?.reviewCount ?? 0);
    const fsrsEnabled = deck.algorithm === 'fsrs';

    // Demo deck name/description translation (when DB has English seed values)
    const displayDeckName = deck.name === 'Testing Deck' ? t('decks.demo_deck_name') : deck.name;
    const displayDeckDesc = deck.description === 'This is a test deck'
        ? t('decks.demo_deck_description')
        : deck.description;

    return (
        <div className="deck-detail">
            <div className="deck-detail-header">
                <div className="header-left">
                    <Button
                        variant="secondary"
                        onClick={goToDecks}
                        data-testid="back-btn"
                        icon={<ArrowLeft size={18} />}
                    >
                        {t('common.back')}
                    </Button>

                    <div className="deck-detail-title">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h2>{displayDeckName}</h2>
                            <button
                                className="deck-card-rename-btn"
                                onClick={() => setShowDeckEditor(true)}
                                title={t('modals.edit_deck_title')}
                                style={{ opacity: 1 }}
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                        {displayDeckDesc && (
                            <p className="text-muted">{displayDeckDesc}</p>
                        )}
                    </div>
                </div>

                <div className="deck-detail-actions">
                    {totalCards > 0 && (
                        <Button
                            variant="danger"
                            onClick={() => setShowDeleteConfirm(true)}
                            data-testid="delete-all-btn"
                            icon={<Trash2 size={18} />}
                        >
                            {t('decks.delete')}
                        </Button>
                    )}

                    {fsrsEnabled ? (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => goToStudy(id, 'all')}
                                disabled={totalCards === 0}
                                data-testid="review-all-btn"
                                icon={<Zap size={18} />}
                            >
                                {t('decks.review_all')}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    const tierKey = getTierKey(examProfile);
                                    const dismissed = localStorage.getItem(`sekel_briefing_v1_${tierKey}`);
                                    if (dismissed) {
                                        goToStudy(id, 'due');
                                    } else {
                                        setShowModeBriefing(true);
                                    }
                                }}
                                disabled={totalCards === 0 || dueCards === 0}
                                data-testid="study-btn"
                                icon={<BookOpen size={18} />}
                            >
                                {t('decks.study_now')} ({t('decks.due_count', { count: dueCards })})
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="primary"
                            className="study-all-btn-flashcards"
                            onClick={() => goToStudy(id, 'all')}
                            disabled={totalCards === 0}
                            data-testid="study-all-btn"
                            icon={<Zap size={18} />}
                        >
                            {t('decks.study_now')} ({t('decks.mode_flashcard')})
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        onClick={handleAddNote}
                        data-testid="add-card-header-btn"
                        icon={<Plus size={18} />}
                    >
                        {t('modals.add_card_title')}
                    </Button>
                </div>
            </div>

            <div className="deck-stats-bar">
                <div className="stat-pill">
                    <span className="stat-pill-value">{stats?.newCount ?? 0}</span>
                    <span className="stat-pill-label">{t('decks.stats.new')}</span>
                </div>
                <div className="stat-pill learning">
                    <span className="stat-pill-value">{stats?.learningCount ?? 0}</span>
                    <span className="stat-pill-label">{t('decks.stats.learning')}</span>
                </div>
                <div className="stat-pill review">
                    <span className="stat-pill-value">{stats?.reviewCount ?? 0}</span>
                    <span className="stat-pill-label">{t('decks.stats.review')}</span>
                </div>
                <div className="stat-pill total">
                    <span className="stat-pill-value">{totalCards}</span>
                    <span className="stat-pill-label">{t('decks.stats.total')}</span>
                </div>
            </div>

            <CardList
                deckId={id}
                onAddCard={handleAddNote}
                onGenerateAI={() => goToDocuments(id)}
                onEdit={handleEditNote}
            />

            {showNoteEditor && defaultNoteTypeId && (
                <NoteEditor
                    deckId={id}
                    userId={userId}
                    noteTypeId={defaultNoteTypeId}
                    onClose={() => setShowNoteEditor(false)}
                    editingNote={editingNote}
                />
            )}

            {showDeckEditor && (
                <DeckEditor
                    deck={deck}
                    userId={userId}
                    onClose={() => setShowDeckEditor(false)}
                />
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{t('decks.delete_decks')}</h2>
                        </div>
                        <p>
                            {t('decks.delete_cards_message', { count: totalCards })}
                        </p>
                        <ul className="delete-warning-list">
                            <li>{t('decks.delete_warn_reviews')}</li>
                            <li>{t('decks.delete_warn_classifications')}</li>
                        </ul>
                        <p className="text-muted">{t('decks.delete_warn_irreversible')}</p>
                        <div className="modal-actions">
                            <Button
                                variant="secondary"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="danger"
                                onClick={handleDeleteAllCards}
                                disabled={isDeleting}
                                isLoading={isDeleting}
                            >
                                {t('decks.delete')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showModeBriefing && deck && (
                <SessionModeBriefing
                    deckName={deck.name}
                    dueCount={dueCards}
                    examProfile={examProfile}
                    onDismiss={() => setShowModeBriefing(false)}
                    onBegin={() => {
                        setShowModeBriefing(false);
                        goToStudy(id, 'due');
                    }}
                />
            )}
        </div>
    );
}
