import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Layers, Trash2, Plus, CheckCircle, Info, Square, Circle, Pentagon, Group, Ungroup, Eye, FormInput } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadImage } from '../../lib/storage';
import { useDecks } from '../../hooks/useDecks';
import { useCreateNote, useNoteTypes, useCreateNoteType } from '../../hooks/useNotes';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import type { OcclusionShape, OcclusionRectShape, OcclusionEllipseShape, OcclusionPolygonShape, IOMode } from '../../lib/types';
import DeckEditor from '../Deck/DeckEditor';
import { Button, Select, useToast } from '../UI';
import './ImageOcclusionEditor.css';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type ShapeTool = 'rect' | 'ellipse' | 'polygon';
type EditorView = 'mask' | 'fields';

interface ImageOcclusionEditorProps {
    userId: string;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Compute card units: each ungrouped shape is 1 unit, each unique groupId is 1 unit. */
function computeCardUnits(shapes: OcclusionShape[]): { unitIndex: number; shapeIndices: number[] }[] {
    const units: { unitIndex: number; shapeIndices: number[] }[] = [];
    const groupMap = new Map<string, number>(); // groupId → unit index

    for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        if (s.groupId) {
            if (groupMap.has(s.groupId)) {
                units[groupMap.get(s.groupId)!].shapeIndices.push(i);
            } else {
                const unitIdx = units.length;
                groupMap.set(s.groupId, unitIdx);
                units.push({ unitIndex: unitIdx, shapeIndices: [i] });
            }
        } else {
            units.push({ unitIndex: units.length, shapeIndices: [i] });
        }
    }
    return units;
}

/** Render an SVG element for a shape. */
function renderShapeElement(
    shape: OcclusionShape,
    className: string,
): React.ReactNode {
    const key = shape.id;
    switch (shape.type) {
        case 'rect':
            return (
                <rect
                    key={key}
                    x={`${shape.x}%`}
                    y={`${shape.y}%`}
                    width={`${shape.w}%`}
                    height={`${shape.h}%`}
                    className={className}
                    rx="4"
                    data-shape-id={shape.id}
                />
            );
        case 'ellipse':
            return (
                <ellipse
                    key={key}
                    cx={`${shape.cx}%`}
                    cy={`${shape.cy}%`}
                    rx={`${shape.rx}%`}
                    ry={`${shape.ry}%`}
                    className={className}
                    data-shape-id={shape.id}
                />
            );
        case 'polygon':
            return (
                <polygon
                    key={key}
                    points={shape.points.map(p => `${p.x},${p.y}`).join(' ')}
                    className={className}
                    data-shape-id={shape.id}
                />
            );
    }
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
    const [shapes, setShapes] = useState<OcclusionShape[]>([]);
    const [selectedDeckId, setSelectedDeckId] = useState('');
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());

    // Editor state
    const [activeTool, setActiveTool] = useState<ShapeTool>('rect');
    const [editorView, setEditorView] = useState<EditorView>('mask');
    const [ioMode, setIoMode] = useState<IOMode>('hide-all-guess-one');

    // Fields
    const [header, setHeader] = useState('');
    const [backExtra, setBackExtra] = useState('');
    const [comments, setComments] = useState('');

    // Drawing state — rect/ellipse
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [currentDrawShape, setCurrentDrawShape] = useState<OcclusionShape | null>(null);

    // Drawing state — polygon
    const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
    const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number; y: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const deckOptions = useMemo(() => [
        { label: t('ai.create_new_deck'), value: 'new' },
        ...decks.map(d => ({ label: d.name, value: d.id })),
    ], [decks, t]);

    const cardUnits = useMemo(() => computeCardUnits(shapes), [shapes]);
    const cardCount = ioMode === 'hide-all-reveal-all' ? (shapes.length > 0 ? 1 : 0) : cardUnits.length;

    // ─── Image upload ────────────────────────────────────────────
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadImage(file, userId);
            setImageUrl(url);
            setShapes([]);
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

    // ─── Drawing handlers: rect / ellipse ────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (activeTool === 'polygon') return; // polygon uses click handler
        e.preventDefault();
        const { x, y } = getRelativeCoords(e.clientX, e.clientY);
        setDrawStart({ x, y });
        setIsDrawing(true);
        setSelectedShapeIds(new Set());

        if (activeTool === 'rect') {
            setCurrentDrawShape({ type: 'rect', id: crypto.randomUUID(), x, y, w: 0, h: 0 });
        } else {
            setCurrentDrawShape({ type: 'ellipse', id: crypto.randomUUID(), cx: x, cy: y, rx: 0, ry: 0 });
        }
    }, [activeTool, getRelativeCoords]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Polygon preview line
        if (activeTool === 'polygon' && polygonPoints.length > 0) {
            const { x, y } = getRelativeCoords(e.clientX, e.clientY);
            setPolygonPreviewPoint({ x, y });
            return;
        }

        if (!isDrawing || !drawStart) return;
        const { x, y } = getRelativeCoords(e.clientX, e.clientY);

        if (activeTool === 'rect') {
            setCurrentDrawShape(prev => prev ? {
                ...prev as OcclusionRectShape,
                x: Math.min(drawStart.x, x),
                y: Math.min(drawStart.y, y),
                w: Math.abs(x - drawStart.x),
                h: Math.abs(y - drawStart.y),
            } : null);
        } else if (activeTool === 'ellipse') {
            const cx = (drawStart.x + x) / 2;
            const cy = (drawStart.y + y) / 2;
            const rx = Math.abs(x - drawStart.x) / 2;
            const ry = Math.abs(y - drawStart.y) / 2;
            setCurrentDrawShape(prev => prev ? {
                ...prev as OcclusionEllipseShape,
                cx, cy, rx, ry,
            } : null);
        }
    }, [activeTool, isDrawing, drawStart, getRelativeCoords, polygonPoints.length]);

    const handleMouseUp = useCallback(() => {
        if (activeTool === 'polygon') return;
        if (!isDrawing || !currentDrawShape) return;
        setIsDrawing(false);
        setDrawStart(null);

        // Check minimum size
        let hasSize = false;
        if (currentDrawShape.type === 'rect') {
            hasSize = currentDrawShape.w > 1 && currentDrawShape.h > 1;
        } else if (currentDrawShape.type === 'ellipse') {
            hasSize = currentDrawShape.rx > 0.5 && currentDrawShape.ry > 0.5;
        }

        if (hasSize) {
            setShapes(prev => [...prev, currentDrawShape]);
        }
        setCurrentDrawShape(null);
    }, [activeTool, isDrawing, currentDrawShape]);

    // ─── Drawing handlers: polygon ───────────────────────────────
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if (activeTool !== 'polygon') return;
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = getRelativeCoords(e.clientX, e.clientY);

        // If close to first point and have 3+ points, close the polygon
        if (polygonPoints.length >= 3) {
            const first = polygonPoints[0];
            const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2);
            if (dist < 3) { // within 3% of first point
                const newShape: OcclusionPolygonShape = {
                    type: 'polygon',
                    id: crypto.randomUUID(),
                    points: [...polygonPoints],
                };
                setShapes(prev => [...prev, newShape]);
                setPolygonPoints([]);
                setPolygonPreviewPoint(null);
                return;
            }
        }

        setPolygonPoints(prev => [...prev, { x, y }]);
    }, [activeTool, getRelativeCoords, polygonPoints]);

    const handlePolygonDoubleClick = useCallback((e: React.MouseEvent) => {
        if (activeTool !== 'polygon' || polygonPoints.length < 3) return;
        e.preventDefault();
        e.stopPropagation();
        const newShape: OcclusionPolygonShape = {
            type: 'polygon',
            id: crypto.randomUUID(),
            points: [...polygonPoints],
        };
        setShapes(prev => [...prev, newShape]);
        setPolygonPoints([]);
        setPolygonPreviewPoint(null);
    }, [activeTool, polygonPoints]);

    // Clean up drawing on mouse leave
    const handleMouseLeave = useCallback(() => {
        if (activeTool === 'polygon') return; // don't cancel polygon on leave
        if (isDrawing && currentDrawShape) {
            let hasSize = false;
            if (currentDrawShape.type === 'rect') {
                hasSize = currentDrawShape.w > 1 && currentDrawShape.h > 1;
            } else if (currentDrawShape.type === 'ellipse') {
                hasSize = currentDrawShape.rx > 0.5 && currentDrawShape.ry > 0.5;
            }
            if (hasSize) {
                setShapes(prev => [...prev, currentDrawShape]);
            }
        }
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentDrawShape(null);
    }, [activeTool, isDrawing, currentDrawShape]);

    // Cancel polygon on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && polygonPoints.length > 0) {
                setPolygonPoints([]);
                setPolygonPreviewPoint(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [polygonPoints.length]);

    // ─── Shape selection & actions ────────────────────────────────
    const handleShapeClick = useCallback((shapeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            // Multi-select with Ctrl/Cmd
            setSelectedShapeIds(prev => {
                const next = new Set(prev);
                if (next.has(shapeId)) next.delete(shapeId);
                else next.add(shapeId);
                return next;
            });
        } else {
            setSelectedShapeIds(new Set([shapeId]));
        }
    }, []);

    const handleDeleteShape = useCallback((shapeId: string) => {
        setShapes(prev => prev.filter(s => s.id !== shapeId));
        setSelectedShapeIds(prev => {
            const next = new Set(prev);
            next.delete(shapeId);
            return next;
        });
    }, []);

    const handleDeleteSelected = useCallback(() => {
        setShapes(prev => prev.filter(s => !selectedShapeIds.has(s.id)));
        setSelectedShapeIds(new Set());
    }, [selectedShapeIds]);

    // ─── Grouping ────────────────────────────────────────────────
    const handleGroupSelected = useCallback(() => {
        if (selectedShapeIds.size < 2) return;
        const groupId = crypto.randomUUID();
        setShapes(prev => prev.map(s =>
            selectedShapeIds.has(s.id) ? { ...s, groupId } : s
        ));
        setSelectedShapeIds(new Set());
    }, [selectedShapeIds]);

    const handleUngroupSelected = useCallback(() => {
        setShapes(prev => prev.map(s =>
            selectedShapeIds.has(s.id) ? { ...s, groupId: undefined } : s
        ));
        setSelectedShapeIds(new Set());
    }, [selectedShapeIds]);

    const hasGroupedSelection = useMemo(() =>
        [...selectedShapeIds].some(id => shapes.find(s => s.id === id)?.groupId),
        [selectedShapeIds, shapes]
    );

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
        if (!selectedDeckId || !imageUrl || shapes.length === 0) return;

        setIsGenerating(true);
        setSuccessMessage('');

        try {
            const noteTypeId = await getOcclusionNoteTypeId();
            const shapesJson = JSON.stringify(shapes).replace(/"/g, '&quot;');

            // Hide All Reveal All = 1 card total; others = 1 card per unit
            const totalCards = ioMode === 'hide-all-reveal-all' ? 1 : computeCardUnits(shapes).length;

            for (let i = 0; i < totalCards; i++) {
                await createNote.mutateAsync({
                    note: {
                        user_id: userId,
                        deck_id: selectedDeckId,
                        note_type_id: noteTypeId,
                        fields: {
                            Image: imageUrl,
                            Shapes: shapesJson,
                            ActiveIndex: String(i),
                            IOMode: ioMode,
                            Header: header,
                            BackExtra: backExtra,
                        },
                        tags: ['image-occlusion'],
                    },
                    templateCount: 1,
                });
            }

            setSuccessMessage(t('occlusion.success', { count: totalCards }));
            setShapes([]);
            setHeader('');
            setBackExtra('');
            setComments('');
        } catch (_error) {
            showToast(t('errors.occlusion_generate'), 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── Keyboard delete ─────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeIds.size > 0) {
                handleDeleteSelected();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedShapeIds, handleDeleteSelected]);

    // ─── Shape icon helper ───────────────────────────────────────
    const shapeIcon = (type: OcclusionShape['type'], size = 14) => {
        switch (type) {
            case 'rect': return <Square size={size} />;
            case 'ellipse': return <Circle size={size} />;
            case 'polygon': return <Pentagon size={size} />;
        }
    };

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
                    {/* Toolbar */}
                    {imageUrl && (
                        <div className="occlusion-toolbar">
                            <div className="occlusion-toolbar-group">
                                <button
                                    className={`occlusion-tool-btn ${activeTool === 'rect' && editorView === 'mask' ? 'active' : ''}`}
                                    onClick={() => { setActiveTool('rect'); setEditorView('mask'); }}
                                    title={t('occlusion.tool_rect')}
                                >
                                    <Square size={18} />
                                </button>
                                <button
                                    className={`occlusion-tool-btn ${activeTool === 'ellipse' && editorView === 'mask' ? 'active' : ''}`}
                                    onClick={() => { setActiveTool('ellipse'); setEditorView('mask'); }}
                                    title={t('occlusion.tool_ellipse')}
                                >
                                    <Circle size={18} />
                                </button>
                                <button
                                    className={`occlusion-tool-btn ${activeTool === 'polygon' && editorView === 'mask' ? 'active' : ''}`}
                                    onClick={() => { setActiveTool('polygon'); setEditorView('mask'); }}
                                    title={t('occlusion.tool_polygon')}
                                >
                                    <Pentagon size={18} />
                                </button>
                            </div>

                            <div className="occlusion-toolbar-divider" />

                            <div className="occlusion-toolbar-group">
                                <button
                                    className={`occlusion-tool-btn ${selectedShapeIds.size >= 2 ? '' : 'disabled'}`}
                                    onClick={handleGroupSelected}
                                    disabled={selectedShapeIds.size < 2}
                                    title={t('occlusion.group')}
                                >
                                    <Group size={18} />
                                </button>
                                <button
                                    className={`occlusion-tool-btn ${hasGroupedSelection ? '' : 'disabled'}`}
                                    onClick={handleUngroupSelected}
                                    disabled={!hasGroupedSelection}
                                    title={t('occlusion.ungroup')}
                                >
                                    <Ungroup size={18} />
                                </button>
                            </div>

                            <div className="occlusion-toolbar-divider" />

                            <div className="occlusion-toolbar-group">
                                <button
                                    className={`occlusion-tool-btn ${editorView === 'mask' ? 'active' : ''}`}
                                    onClick={() => setEditorView('mask')}
                                    title={t('occlusion.toggle_masks')}
                                >
                                    <Eye size={18} />
                                </button>
                                <button
                                    className={`occlusion-tool-btn ${editorView === 'fields' ? 'active' : ''}`}
                                    onClick={() => setEditorView('fields')}
                                    title={t('occlusion.toggle_fields')}
                                >
                                    <FormInput size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {!imageUrl ? (
                        <div
                            className="occlusion-upload-zone"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Layers size={48} />
                            <p>{isUploading ? t('common.loading') : t('occlusion.upload_image')}</p>
                            <span className="text-muted">{t('occlusion.draw_hint')}</span>
                        </div>
                    ) : editorView === 'mask' ? (
                        <div
                            ref={containerRef}
                            className="occlusion-image-container"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                            onClick={handleCanvasClick}
                            onDoubleClick={handlePolygonDoubleClick}
                        >
                            <img
                                src={imageUrl}
                                alt="Occlusion source"
                                className="occlusion-source-image"
                                draggable={false}
                            />

                            {/* SVG overlay for shapes */}
                            <svg className="occlusion-svg-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {shapes.map(s => {
                                    const isSelected = selectedShapeIds.has(s.id);
                                    const cls = `occlusion-shape ${isSelected ? 'selected' : ''}`;
                                    return (
                                        <g key={s.id} onClick={(e) => handleShapeClick(s.id, e as unknown as React.MouseEvent)}>
                                            {renderShapeElement(s, cls)}
                                        </g>
                                    );
                                })}

                                {/* Currently drawing shape */}
                                {currentDrawShape && renderShapeElement(currentDrawShape, 'occlusion-shape drawing')}

                                {/* Polygon in-progress */}
                                {polygonPoints.length > 0 && (
                                    <>
                                        <polyline
                                            points={[
                                                ...polygonPoints,
                                                ...(polygonPreviewPoint ? [polygonPreviewPoint] : []),
                                            ].map(p => `${p.x},${p.y}`).join(' ')}
                                            fill="none"
                                            stroke="var(--primary)"
                                            strokeWidth="0.5"
                                            strokeDasharray="2 1"
                                        />
                                        {polygonPoints.map((p, i) => (
                                            <circle
                                                key={i}
                                                cx={p.x}
                                                cy={p.y}
                                                r="1"
                                                fill={i === 0 ? '#22c55e' : 'var(--primary)'}
                                                stroke="white"
                                                strokeWidth="0.3"
                                            />
                                        ))}
                                    </>
                                )}
                            </svg>
                        </div>
                    ) : (
                        /* Fields view */
                        <div className="occlusion-fields-view">
                            <div className="form-group">
                                <label>{t('occlusion.header')}</label>
                                <textarea
                                    value={header}
                                    onChange={(e) => setHeader(e.target.value)}
                                    placeholder={t('occlusion.header_placeholder')}
                                    rows={3}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('occlusion.back_extra')}</label>
                                <textarea
                                    value={backExtra}
                                    onChange={(e) => setBackExtra(e.target.value)}
                                    placeholder={t('occlusion.back_extra_placeholder')}
                                    rows={3}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('occlusion.comments')}</label>
                                <textarea
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder={t('occlusion.comments_placeholder')}
                                    rows={2}
                                />
                                <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                    {t('occlusion.comments_hint')}
                                </span>
                            </div>
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

                    {/* IO Mode selector */}
                    {imageUrl && (
                        <div className="occlusion-mode-selector">
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, fontSize: '0.875rem' }}>
                                {t('occlusion.io_mode')}
                            </label>
                            <div className="occlusion-mode-options">
                                <label className={`occlusion-mode-option ${ioMode === 'hide-all-guess-one' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="ioMode"
                                        value="hide-all-guess-one"
                                        checked={ioMode === 'hide-all-guess-one'}
                                        onChange={() => setIoMode('hide-all-guess-one')}
                                    />
                                    <span>{t('occlusion.hide_all_guess_one')}</span>
                                </label>
                                <label className={`occlusion-mode-option ${ioMode === 'hide-one-guess-one' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="ioMode"
                                        value="hide-one-guess-one"
                                        checked={ioMode === 'hide-one-guess-one'}
                                        onChange={() => setIoMode('hide-one-guess-one')}
                                    />
                                    <span>{t('occlusion.hide_one_guess_one')}</span>
                                </label>
                                <label className={`occlusion-mode-option ${ioMode === 'hide-all-reveal-all' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="ioMode"
                                        value="hide-all-reveal-all"
                                        checked={ioMode === 'hide-all-reveal-all'}
                                        onChange={() => setIoMode('hide-all-reveal-all')}
                                    />
                                    <span>{t('occlusion.hide_all_reveal_all')}</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Shape list */}
                    <div className="occlusion-shape-list">
                        <h4>{t('occlusion.shapes', { count: shapes.length })} → {cardCount} {cardCount === 1 ? 'card' : 'cards'}</h4>
                        {shapes.length === 0 ? (
                            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {t('occlusion.no_shapes')}
                            </p>
                        ) : (
                            <ul>
                                {shapes.map((s, i) => (
                                    <li
                                        key={s.id}
                                        className={`shape-item ${selectedShapeIds.has(s.id) ? 'active' : ''} ${s.groupId ? 'grouped' : ''}`}
                                        onClick={(e) => handleShapeClick(s.id, e)}
                                    >
                                        <span className="shape-item-label">
                                            {shapeIcon(s.type)}
                                            <span>#{i + 1}</span>
                                            {s.groupId && <span className="shape-group-badge">G</span>}
                                        </span>
                                        <Button
                                            variant="icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteShape(s.id);
                                            }}
                                            icon={<Trash2 size={14} />}
                                            title={t('occlusion.delete_shape')}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="occlusion-tip">
                        <Info size={16} />
                        <span>{activeTool === 'polygon' ? t('occlusion.polygon_hint') : t('occlusion.draw_hint')}</span>
                    </div>

                    {imageUrl && (
                        <>
                            <Button
                                variant="primary"
                                onClick={handleGenerateCards}
                                disabled={shapes.length === 0 || !selectedDeckId || isGenerating}
                                isLoading={isGenerating}
                                icon={!isGenerating && <Plus size={16} />}
                            >
                                {t('occlusion.generate_cards', { count: cardCount })}
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
                                    setShapes([]);
                                    setSelectedShapeIds(new Set());
                                    setSuccessMessage('');
                                    setPolygonPoints([]);
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
