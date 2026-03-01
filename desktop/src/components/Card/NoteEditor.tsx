import { useState, useEffect } from 'react';
// import { X } from 'lucide-react'; // Removed unused import
import { useTranslation } from 'react-i18next';
import { useCreateNote, useUpdateNote } from '../../hooks/useNotes';
import { Button, Modal, RichTextEditor } from '../UI';
import type { Note } from '../../lib/types'; // Import Note type

interface NoteEditorProps {
    deckId: string;
    userId: string;
    noteTypeId: string;
    onClose: () => void;
    editingNote?: Note | null;
}

export default function NoteEditor({ deckId, userId, noteTypeId, onClose, editingNote }: NoteEditorProps) {
    const { t } = useTranslation();

    // Detect if this is an occlusion note
    const isOcclusion = !!(editingNote?.fields.Image && editingNote?.fields.Rectangles);

    // Initialize state with editingNote values if present, otherwise empty
    const [front, setFront] = useState(editingNote?.fields.Front || '');
    const [back, setBack] = useState(editingNote?.fields.Back || '');
    const [error, setError] = useState<string | null>(null);

    // Update state if editingNote changes prop (e.g. if modal is reused)
    useEffect(() => {
        if (editingNote) {
            setFront(editingNote.fields.Front || '');
            setBack(editingNote.fields.Back || '');
        } else {
            setFront('');
            setBack('');
        }
    }, [editingNote]);

    const createNote = useCreateNote();
    const updateNote = useUpdateNote();
    const isLoading = createNote.isPending || updateNote.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic validation - check if content is empty or just HTML tags
        const isContentEmpty = (html: string) => {
            const stripped = html.replace(/<[^>]*>/g, '').trim();
            return !stripped && !html.includes('<img');
        };

        // For occlusion cards, text fields are optional
        if (!isOcclusion) {
            if (isContentEmpty(front)) {
                setError(t('modals.error_front_required'));
                return;
            }

            if (isContentEmpty(back)) {
                setError(t('modals.error_back_required'));
                return;
            }
        }

        try {
            if (editingNote) {
                // Update existing note — preserve occlusion fields if present
                const updatedFields: Record<string, string> = { Front: front, Back: back };
                if (isOcclusion) {
                    updatedFields.Image = editingNote.fields.Image;
                    updatedFields.Rectangles = editingNote.fields.Rectangles;
                    updatedFields.ActiveIndex = editingNote.fields.ActiveIndex;
                }
                await updateNote.mutateAsync({
                    id: editingNote.id,
                    deckId,
                    updates: { fields: updatedFields }
                });
                onClose(); // Close immediately after editing
            } else {
                // Create new note
                await createNote.mutateAsync({
                    note: {
                        user_id: userId,
                        deck_id: deckId,
                        note_type_id: noteTypeId,
                        fields: { Front: front, Back: back },
                        tags: [],
                    },
                    templateCount: 1,
                });

                // Clear form for adding another card
                setFront('');
                setBack('');
            }
        } catch (_err) {
            setError(editingNote ? 'Failed to update card' : t('modals.error_create_card'));
        }
    };

    const handleSaveAndClose = async () => {
        if (isOcclusion || (front && back)) {
            await handleSubmit(new Event('submit') as unknown as React.FormEvent);
            if (!editingNote) {
                onClose();
            }
        } else {
            await handleSubmit(new Event('submit') as unknown as React.FormEvent);
        }
    };

    // ─── Occlusion preview renderer ──────────────────────────────
    const renderOcclusionPreview = () => {
        if (!editingNote) return null;
        const imageUrl = editingNote.fields.Image;
        const activeIndex = parseInt(editingNote.fields.ActiveIndex || '0', 10);

        let rects: { x: number; y: number; w: number; h: number }[] = [];
        try {
            const raw = editingNote.fields.Rectangles.replace(/&quot;/g, '"');
            rects = JSON.parse(raw);
        } catch {
            // noop
        }

        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                        src={imageUrl}
                        alt="Occlusion"
                        style={{
                            display: 'block',
                            maxWidth: '100%',
                            maxHeight: '450px',
                            borderRadius: 'var(--radius)',
                        }}
                    />
                    <svg
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        }}
                    >
                        {rects.map((r, i) => (
                            <rect
                                key={i}
                                x={`${r.x}%`}
                                y={`${r.y}%`}
                                width={`${r.w}%`}
                                height={`${r.h}%`}
                                fill={i === activeIndex ? '#3b82f6' : 'rgba(59,130,246,0.25)'}
                                stroke={i === activeIndex ? '#2563eb' : 'rgba(59,130,246,0.5)'}
                                strokeWidth={i === activeIndex ? 2.5 : 1.5}
                                rx={4}
                            />
                        ))}
                    </svg>
                </div>
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    {t('occlusion.title')} — #{activeIndex + 1} of {rects.length}
                </p>
            </div>
        );
    };

    const footer = (
        <>
            <Button
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
            >
                {t('common.cancel')}
            </Button>

            {/* "Add & Continue" only makes sense for creating new non-occlusion cards */}
            {!editingNote && !isOcclusion && (
                <Button
                    type="submit"
                    variant="secondary"
                    onClick={handleSubmit}
                    disabled={isLoading}
                    data-testid="add-another-btn"
                    isLoading={isLoading}
                >
                    {t('modals.add_continue')}
                </Button>
            )}

            <Button
                variant="primary"
                onClick={handleSaveAndClose}
                disabled={isLoading}
                data-testid="save-close-btn"
                isLoading={isLoading}
            >
                {editingNote ? t('modals.save_changes') : t('modals.save_close')}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={editingNote ? t('modals.edit_card_title') : t('modals.add_card_title')}
            footer={footer}
            size={isOcclusion ? "xl" : "lg"}
            data-testid="note-editor-modal"
        >
            <div style={isOcclusion ? { display: 'flex', gap: '2rem', alignItems: 'center' } : {}}>
                {/* Text Editors Side */}
                <div style={{ flex: isOcclusion ? '1' : 'none', width: isOcclusion ? '50%' : '100%' }}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                {t('modals.front')}
                            </label>
                            <RichTextEditor
                                value={front}
                                onChange={setFront}
                                placeholder={t('modals.front_placeholder')}
                                userId={userId}
                                id="card-front"
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                {t('modals.back')}
                            </label>
                            <RichTextEditor
                                value={back}
                                onChange={setBack}
                                placeholder={t('modals.back_placeholder')}
                                userId={userId}
                                id="card-back"
                            />
                        </div>

                        {error && (
                            <div className="form-error" data-testid="note-editor-error">
                                {error}
                            </div>
                        )}
                    </form>
                </div>

                {/* Image Preview Side */}
                {isOcclusion && (
                    <div style={{ flex: '1.2', width: '50%', display: 'flex', justifyContent: 'center' }}>
                        {renderOcclusionPreview()}
                    </div>
                )}
            </div>
        </Modal>
    );
}
