import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateNote, useUpdateNote } from '../../hooks/useNotes';
import { Button, Modal, RichTextEditor } from '../UI';
import { resolveMediaInHtml } from '../../lib/mediaResolver';
import type { JoinedNote } from '@sekel/db';
import type { OcclusionShape } from '../../lib/types';

interface NoteEditorProps {
    deckId: string;
    userId: string;
    noteTypeId: string;
    onClose: () => void;
    editingNote?: JoinedNote | null;
}

export default function NoteEditor({ deckId, userId, noteTypeId, onClose, editingNote }: NoteEditorProps) {
    const { t } = useTranslation();

    // Detect if this is an occlusion note (supports both legacy and new field names)
    const isOcclusion = !!(editingNote?.fields.Image && (editingNote?.fields.Rectangles || editingNote?.fields.Shapes));
    const isNewOcclusion = !!(editingNote?.fields.Shapes);

    // Initialize state with editingNote values if present, otherwise empty
    // Resolve bare media filenames (from Anki imports) to sekel-media:// URLs
    // Support both legacy (Front/Back) and new (Header/BackExtra) field names
    const getFrontField = () => editingNote?.fields.Header || editingNote?.fields.Front || '';
    const getBackField = () => editingNote?.fields.BackExtra || editingNote?.fields.Back || '';
    const [front, setFront] = useState(editingNote ? resolveMediaInHtml(getFrontField(), userId) : '');
    const [back, setBack] = useState(editingNote ? resolveMediaInHtml(getBackField(), userId) : '');
    const [error, setError] = useState<string | null>(null);

    // Detect cloze content reactively from front field
    const isCloze = /\{\{c\d+::(.+?)\}\}/.test(front);

    // Extract cloze answers from Front and fill Back field
    const fillBackFromCloze = () => {
        const stripped = front.replace(/<[^>]*>/g, '');
        const answers: string[] = [];
        for (const m of stripped.matchAll(/\{\{c\d+::([^}]+)\}\}/g)) {
            answers.push(m[1]);
        }
        if (answers.length > 0) {
            setBack(answers.join(', '));
        }
    };

    // Update state if editingNote changes prop (e.g. if modal is reused)
    useEffect(() => {
        if (editingNote) {
            const frontVal = editingNote.fields.Header || editingNote.fields.Front || '';
            const backVal = editingNote.fields.BackExtra || editingNote.fields.Back || '';
            setFront(resolveMediaInHtml(frontVal, userId));
            setBack(resolveMediaInHtml(backVal, userId));
        } else {
            setFront('');
            setBack('');
        }
    }, [editingNote, userId]);

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

            if (isContentEmpty(back) && !isCloze) {
                setError(t('modals.error_back_required'));
                return;
            }
        }

        // Validate cloze syntax if present
        if (isCloze) {
            const stripped = front.replace(/<[^>]*>/g, '');
            const opens = (stripped.match(/\{\{c\d+::/g) || []).length;
            const closes = (stripped.match(/\}\}/g) || []).length;
            if (opens !== closes) {
                setError(t('editor.cloze_syntax_error'));
                return;
            }
        }

        // Auto-fill Back from cloze answer when Back is empty
        let finalBack = back;
        if (isCloze && isContentEmpty(back)) {
            const stripped = front.replace(/<[^>]*>/g, '');
            const match = stripped.match(/\{\{c1::([^}]+)\}\}/);
            if (match) finalBack = match[1];
        }

        try {
            if (editingNote) {
                // Update existing note — preserve occlusion fields if present
                const updatedFields: Record<string, string> = {};
                if (isOcclusion && isNewOcclusion) {
                    // New format: Header/BackExtra
                    updatedFields.Header = front;
                    updatedFields.BackExtra = finalBack;
                    updatedFields.Image = editingNote.fields.Image;
                    updatedFields.Shapes = editingNote.fields.Shapes;
                    updatedFields.ActiveIndex = editingNote.fields.ActiveIndex;
                    if (editingNote.fields.IOMode) updatedFields.IOMode = editingNote.fields.IOMode;
                } else if (isOcclusion) {
                    // Legacy format: Front/Back + Rectangles
                    updatedFields.Front = front;
                    updatedFields.Back = finalBack;
                    updatedFields.Image = editingNote.fields.Image;
                    updatedFields.Rectangles = editingNote.fields.Rectangles;
                    updatedFields.ActiveIndex = editingNote.fields.ActiveIndex;
                } else {
                    updatedFields.Front = front;
                    updatedFields.Back = finalBack;
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
                        fields: { Front: front, Back: finalBack },
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

        let shapes: OcclusionShape[] = [];
        try {
            if (isNewOcclusion) {
                const raw = editingNote.fields.Shapes.replace(/&quot;/g, '"');
                shapes = JSON.parse(raw);
            } else {
                const raw = editingNote.fields.Rectangles.replace(/&quot;/g, '"');
                const rects = JSON.parse(raw) as { x: number; y: number; w: number; h: number }[];
                shapes = rects.map((r, i) => ({ type: 'rect' as const, id: String(i), x: r.x, y: r.y, w: r.w, h: r.h }));
            }
        } catch {
            // noop
        }

        const renderPreviewShape = (shape: OcclusionShape, isActive: boolean) => {
            const fill = isActive ? 'var(--teal-tint)' : 'var(--violet)';
            const stroke = isActive ? 'var(--teal)' : 'var(--violet)';
            const strokeWidth = isActive ? 0.6 : 0.4;
            switch (shape.type) {
                case 'rect':
                    return <rect key={shape.id} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={0.5} />;
                case 'ellipse':
                    return <ellipse key={shape.id} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                case 'polygon':
                    return <polygon key={shape.id} points={shape.points.map(p => `${p.x},${p.y}`).join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
            }
        };

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
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                        }}
                    >
                        {shapes.map((s, i) => renderPreviewShape(s, i === activeIndex))}
                    </svg>
                </div>
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    {t('occlusion.title')} — #{activeIndex + 1} of {shapes.length}
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
                                {isCloze && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 400 }}>
                                        {t('editor.cloze_mode')}
                                    </span>
                                )}
                            </label>
                            <RichTextEditor
                                value={front}
                                onChange={setFront}
                                placeholder={t('modals.front_placeholder')}
                                userId={userId}
                                id="card-front"
                                cloze
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', fontWeight: 500 }}>
                                {t('modals.back')}
                                {isCloze && (
                                    <button
                                        type="button"
                                        onClick={fillBackFromCloze}
                                        style={{
                                            marginLeft: 'auto',
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            fontSize: '0.75rem',
                                            color: 'var(--primary)',
                                            cursor: 'pointer',
                                            fontWeight: 400,
                                            textDecoration: 'underline',
                                            textUnderlineOffset: '2px',
                                        }}
                                    >
                                        {t('editor.fill_from_cloze')}
                                    </button>
                                )}
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
