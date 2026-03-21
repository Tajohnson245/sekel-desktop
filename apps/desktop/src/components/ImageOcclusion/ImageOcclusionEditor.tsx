import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Layers, Trash2, Plus, CheckCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadImage } from '../../lib/storage';
import { useDecks } from '../../hooks/useDecks';
import { useCreateNote, useNoteTypes, useCreateNoteType } from '../../hooks/useNotes';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import DeckEditor from '../Deck/DeckEditor';
import { Button, Select, useToast } from '../UI';
import './ImageOcclusionEditor.css';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface OcclusionRect {
    x: number;      // percentage 0-100
    y: number;
    w: number;
    h: number;
}

interface ImageOcclusionEditorProps {
    userId: string;
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function ImageOcclusionEditor({ userId }: ImageOcclusionEditorProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();

    // Hooks
    const { data: decks = [] } = useDecks();
    const { data: noteTypes = [] } = useNoteTypes(userId);
    const createNote = useCreateNote();
    const createNoteType = useCreateNoteType();

    // State
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [rects, setRects] = useState<OcclusionRect[]>([]);
    const [selectedDeckId, setSelectedDeckId] = useState('');
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
    const [front, setFront] = useState('');
    const [back, setBack] = useState('');

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [currentRect, setCurrentRect] = useState<OcclusionRect | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const deckOptions = useMemo(() => [
        { label: t('ai.create_new_deck'), value: 'new' },
        ...decks.map(d => ({ label: d.name, value: d.id })),
    ], [decks, t]);

    // ─── Image upload ────────────────────────────────────────────
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadImage(file, userId);
            setImageUrl(url);
            setRects([]);
            setSuccessMessage('');
        } catch (_error) {
            showToast(t('errors.upload_image'), 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ─── Coordinate helpers ──────────────────────────────────────
    const getRelativeCoords = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: ((clientX - rect.left) / rect.width) * 100,
            y: ((clientY - rect.top) / rect.height) * 100,
        };
    }, []);

    // ─── Drawing handlers ────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const { x, y } = getRelativeCoords(e.clientX, e.clientY);
        setDrawStart({ x, y });
        setIsDrawing(true);
        setSelectedRectIndex(null);
        setCurrentRect({ x, y, w: 0, h: 0 });
    }, [getRelativeCoords]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDrawing || !drawStart) return;
        const { x, y } = getRelativeCoords(e.clientX, e.clientY);
        setCurrentRect({
            x: Math.min(drawStart.x, x),
            y: Math.min(drawStart.y, y),
            w: Math.abs(x - drawStart.x),
            h: Math.abs(y - drawStart.y),
        });
    }, [isDrawing, drawStart, getRelativeCoords]);

    const handleMouseUp = useCallback(() => {
        if (!isDrawing || !currentRect) return;
        setIsDrawing(false);
        setDrawStart(null);

        // Only add if the rectangle has meaningful size (> 1% in both dims)
        if (currentRect.w > 1 && currentRect.h > 1) {
            setRects(prev => [...prev, currentRect]);
        }
        setCurrentRect(null);
    }, [isDrawing, currentRect]);

    // Clean up drawing on mouse leave
    const handleMouseLeave = useCallback(() => {
        if (isDrawing && currentRect && currentRect.w > 1 && currentRect.h > 1) {
            setRects(prev => [...prev, currentRect]);
        }
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentRect(null);
    }, [isDrawing, currentRect]);

    const handleDeleteRect = useCallback((index: number) => {
        setRects(prev => prev.filter((_, i) => i !== index));
        setSelectedRectIndex(null);
    }, []);

    // ─── Note type helper ────────────────────────────────────────
    const getOcclusionNoteTypeId = async (): Promise<string> => {
        const existing = noteTypes.find(nt => nt.name === 'Image Occlusion');
        if (existing) return existing.id;

        const defaultType = DEFAULT_NOTE_TYPES.find(t => t.name === 'Image Occlusion')!;
        const created = await createNoteType.mutateAsync({
            user_id: userId,
            name: defaultType.name,
            fields: defaultType.fields,
            card_templates: defaultType.card_templates,
        });
        return created.id;
    };

    // ─── Card generation ─────────────────────────────────────────
    const handleGenerateCards = async () => {
        if (!selectedDeckId || !imageUrl || rects.length === 0) return;

        setIsGenerating(true);
        setSuccessMessage('');

        try {
            const noteTypeId = await getOcclusionNoteTypeId();
            // HTML-encode quotes so the JSON survives inside data-rects="..." attribute
            const rectsJson = JSON.stringify(rects).replace(/"/g, '&quot;');

            for (let i = 0; i < rects.length; i++) {
                await createNote.mutateAsync({
                    note: {
                        user_id: userId,
                        deck_id: selectedDeckId,
                        note_type_id: noteTypeId,
                        fields: {
                            Image: imageUrl,
                            Rectangles: rectsJson,
                            ActiveIndex: String(i),
                            Front: front,
                            Back: back,
                        },
                        tags: ['image-occlusion'],
                    },
                    templateCount: 1,
                });
            }

            setSuccessMessage(t('occlusion.success', { count: rects.length }));
            setRects([]);
            setFront('');
            setBack('');
        } catch (_error) {
            showToast(t('errors.occlusion_generate'), 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── Keyboard delete ─────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRectIndex !== null) {
                handleDeleteRect(selectedRectIndex);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedRectIndex, handleDeleteRect]);

    // ─── Render ──────────────────────────────────────────────────
    return (
        <div className="occlusion-editor">
            <div className="occlusion-header">
                <h2><Layers size={24} /> {t('occlusion.title')}</h2>
            </div>

            {successMessage && (
                <div className="success-banner">
                    <CheckCircle size={18} />
                    {successMessage}
                </div>
            )}

            <div className="occlusion-layout">
                {/* Canvas Area */}
                <div className="occlusion-canvas-area">
                    {!imageUrl ? (
                        <div
                            className="occlusion-upload-zone"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Layers size={48} />
                            <p>{isUploading ? t('common.loading') : t('occlusion.upload_image')}</p>
                            <span className="text-muted">{t('occlusion.draw_hint')}</span>
                        </div>
                    ) : (
                        <div
                            ref={containerRef}
                            className="occlusion-image-container"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                        >
                            <img
                                src={imageUrl}
                                alt="Occlusion source"
                                className="occlusion-source-image"
                                draggable={false}
                            />

                            {/* SVG overlay for rectangles */}
                            <svg className="occlusion-svg-overlay">
                                {rects.map((r, i) => (
                                    <rect
                                        key={i}
                                        x={`${r.x}%`}
                                        y={`${r.y}%`}
                                        width={`${r.w}%`}
                                        height={`${r.h}%`}
                                        className={`occlusion-rect ${selectedRectIndex === i ? 'selected' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedRectIndex(i);
                                        }}
                                    />
                                ))}

                                {/* Currently drawing rect */}
                                {currentRect && (
                                    <rect
                                        x={`${currentRect.x}%`}
                                        y={`${currentRect.y}%`}
                                        width={`${currentRect.w}%`}
                                        height={`${currentRect.h}%`}
                                        className="occlusion-rect drawing"
                                    />
                                )}
                            </svg>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="occlusion-sidebar">
                    <Select
                        label={t('ai.target_deck')}
                        value={selectedDeckId}
                        onChange={(e) => {
                            if (e.target.value === 'new') {
                                setShowDeckEditor(true);
                            } else {
                                setSelectedDeckId(e.target.value);
                            }
                        }}
                        options={deckOptions}
                        placeholder={t('ai.select_deck')}
                    />

                    {/* Optional text fields */}
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.875rem' }}>
                            {t('modals.front')}
                        </label>
                        <textarea
                            value={front}
                            onChange={(e) => setFront(e.target.value)}
                            placeholder={t('modals.front_placeholder')}
                            rows={2}
                            style={{
                                width: '100%',
                                resize: 'vertical',
                                padding: '0.5rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                background: 'var(--input)',
                                color: 'var(--foreground)',
                                fontSize: '0.875rem',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.875rem' }}>
                            {t('modals.back')}
                        </label>
                        <textarea
                            value={back}
                            onChange={(e) => setBack(e.target.value)}
                            placeholder={t('modals.back_placeholder')}
                            rows={2}
                            style={{
                                width: '100%',
                                resize: 'vertical',
                                padding: '0.5rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                background: 'var(--input)',
                                color: 'var(--foreground)',
                                fontSize: '0.875rem',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <div className="occlusion-rect-list">
                        <h4>{t('occlusion.rectangles', { count: rects.length })}</h4>
                        {rects.length === 0 ? (
                            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {t('occlusion.no_rectangles')}
                            </p>
                        ) : (
                            <ul>
                                {rects.map((_, i) => (
                                    <li
                                        key={i}
                                        className={`rect-item ${selectedRectIndex === i ? 'active' : ''}`}
                                        onClick={() => setSelectedRectIndex(i)}
                                    >
                                        <span>#{i + 1}</span>
                                        <Button
                                            variant="icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteRect(i);
                                            }}
                                            icon={<Trash2 size={14} />}
                                            title={t('occlusion.delete_rect')}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="occlusion-tip">
                        <Info size={16} />
                        <span>{t('occlusion.draw_hint')}</span>
                    </div>
                    {imageUrl && (
                        <>
                            <Button
                                variant="primary"
                                onClick={handleGenerateCards}
                                disabled={rects.length === 0 || !selectedDeckId || isGenerating}
                                isLoading={isGenerating}
                                icon={!isGenerating && <Plus size={16} />}
                            >
                                {t('occlusion.generate_cards', { count: rects.length })}
                            </Button>

                            <Button
                                variant="secondary"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ marginTop: '0.5rem' }}
                            >
                                {t('occlusion.change_image')}
                            </Button>

                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setImageUrl(null);
                                    setRects([]);
                                    setSelectedRectIndex(null);
                                    setSuccessMessage('');
                                }}
                                icon={<Trash2 size={14} />}
                                style={{ marginTop: '0.25rem' }}
                            >
                                {t('occlusion.remove_image')}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {showDeckEditor && (
                <DeckEditor
                    userId={userId}
                    onClose={() => setShowDeckEditor(false)}
                    onSuccess={(newDeck) => {
                        setSelectedDeckId(newDeck.id);
                        setShowDeckEditor(false);
                    }}
                />
            )}

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
            />
        </div>
    );
}
