import { useState, useMemo, useEffect, useRef } from 'react';
import { Sparkles, X, Plus, CheckCircle, Inbox, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGenerateCards, type GeneratedCard, type AIGenerationOptions } from '../../hooks/useAI';
import type { AIProgress } from '../../types/electron';
import { useSaveDraft, useDrafts, DRAFT_LIMIT } from '../../hooks/useDrafts';
import { useCreateNote, useNoteTypes, useCreateNoteType } from '../../hooks/useNotes';
import { useDecks } from '../../hooks/useDecks';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import DeckEditor from '../Deck/DeckEditor';
import { Button, Input, Select, ImageUpload, useToast } from '../UI';
import { sanitize } from '../../lib/sanitize';
import './AICardGenerator.css';

// All card formats supported by the generation pipeline. Exported so the
// one-shot pipeline in DocumentsPage can pass the full mix as a default.
export const ALL_CARD_FORMATS: AIGenerationOptions['cardFormats'] = [
    'basic',
    'cloze',
    'reversed',
    'true-false',
    'compare-contrast',
    'multiple-choice',
];

interface AICardGeneratorProps {
    extractedText: string;
    userId: string;
    onComplete: () => void;
    initialDeckId?: string;
    contextSummary?: string;
    /** Pre-computed chunks from the upload page so we don't re-chunk on Generate. */
    contextChunks?: Array<{ id: number; text: string }>;
    estimatedCardCount?: number;
    onCardCountChange?: (count: number) => void;
    /** When true, generation fires automatically on first mount. */
    autoStart?: boolean;
    /** Formats to preselect (used with autoStart). Defaults to all 6 when autoStart=true. */
    defaultFormats?: AIGenerationOptions['cardFormats'];
    /** Initial card count from the upload-page preflight settings. Overrides the estimate-derived default. */
    initialCardCount?: number;
}

export default function AICardGenerator({ extractedText, contextSummary, contextChunks, estimatedCardCount, userId, onComplete, initialDeckId, onCardCountChange, autoStart = false, defaultFormats, initialCardCount }: AICardGeneratorProps) {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    // Data hooks
    const { data: decks = [] } = useDecks();
    const { data: noteTypes = [] } = useNoteTypes(userId);
    const generateCards = useGenerateCards();
    const createNote = useCreateNote();
    const createNoteType = useCreateNoteType();
    const saveDraft = useSaveDraft();
    const { data: drafts = [] } = useDrafts();

    // State management
    const [cards, setCards] = useState<(GeneratedCard & { frontImage?: string; backImage?: string })[]>([]);
    const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId || '');
    // initialCardCount comes from the upload-page preflight settings when
    // present. Otherwise fall back to the estimate, capped at 100 so a
    // first-run user doesn't fire a 500-card batch by accident.
    const [cardCount, setCardCount] = useState(initialCardCount ?? Math.min(estimatedCardCount ?? 20, 100));
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [isGen, setIsGen] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);
    const [generationStats, setGenerationStats] = useState<{ generated: number; kept: number; filtered: number } | null>(null);
    const [progress, setProgress] = useState<AIProgress | null>(null);
    const [editing, setEditing] = useState<{ index: number; side: 'front' | 'back' } | null>(null);

    // Generation options. When autoStart is on, preselect formats so the
    // auto-trigger has a valid set to generate from (canGenerate requires
    // selectedFormats.size > 0).
    const initialFormats = useMemo<Set<AIGenerationOptions['cardFormats'][number]>>(() => {
        if (defaultFormats && defaultFormats.length > 0) return new Set(defaultFormats);
        if (autoStart) return new Set(ALL_CARD_FORMATS);
        return new Set();
    }, [autoStart, defaultFormats]);
    const [selectedFormats, setSelectedFormats] = useState<Set<AIGenerationOptions['cardFormats'][number]>>(initialFormats);
    const [difficulty, setDifficulty] = useState<AIGenerationOptions['difficulty']>('detailed');
    const [customInstructions, setCustomInstructions] = useState('');

    // Collapsible settings panel — collapsed by default when autoStart is on
    // (the one-shot flow: user just dropped a file, they don't want to see a
    // settings sidebar; show cards first, settings on demand).
    const [settingsExpanded, setSettingsExpanded] = useState(!autoStart);

    const toggleFormat = (fmt: AIGenerationOptions['cardFormats'][number]) => {
        setSelectedFormats((prev) => {
            const next = new Set(prev);
            if (next.has(fmt)) next.delete(fmt);
            else next.add(fmt);
            return next;
        });
    };

    // Initial card count update
    useEffect(() => {
        onCardCountChange?.(cards.length);
    }, [cards.length, onCardCountChange]);

    // Subscribe to progress events from the main process for the lifetime of
    // this component. Stays mounted across the whole generation flow, so we
    // never miss an early "chunking" event due to a late subscribe.
    // Guarded so a stale preload bundle (e.g. during dev hot-reload) doesn't
    // crash the section into the error boundary — we just fall back to the
    // indeterminate bar.
    useEffect(() => {
        if (typeof window.electronAPI?.onAIProgress !== 'function') return;
        const off = window.electronAPI.onAIProgress((p) => setProgress(p));
        return off;
    }, []);

    // Auto-fire generation on first mount when the one-shot pipeline mounts
    // us with autoStart. Guarded so re-renders never re-fire. Intentionally
    // empty deps — first-render values are exactly what we want to capture.
    const hasAutoStarted = useRef(false);
    useEffect(() => {
        if (!autoStart || hasAutoStarted.current) return;
        if (!extractedText || selectedFormats.size === 0) return;
        hasAutoStarted.current = true;
        void handleGenerate();
    }, []);

    const isGenerating = generateCards.isPending || isGen;
    const isAdding = createNote.isPending;
    const draftsFull = drafts.length >= DRAFT_LIMIT;

    const deckOptions = useMemo(() => [
        { label: t('ai.create_new_deck'), value: 'new' },
        ...decks.map(d => ({ label: d.name, value: d.id }))
    ], [decks, t]);

    // Build options object from current state
    const generationOptions: AIGenerationOptions = {
        cardFormats: Array.from(selectedFormats),
        difficulty,
        customInstructions: customInstructions.trim() || undefined,
    };

    // Generation requires at least one format selected.
    const canGenerate = !isGenerating && !!extractedText && selectedFormats.size > 0;

    // Trigger AI generation
    const handleGenerate = async () => {
        try {
            setSuccessMessage('');
            setProgress(null);
            setIsGen(true);

            let result: GeneratedCard[] = [];
            let statsResult: { generated: number; kept: number; filtered: number } | null = null;

            if (contextSummary) {
                const response = await window.electronAPI.generateCardsFromContext(
                    contextSummary,
                    extractedText,
                    cardCount,
                    i18n.language,
                    generationOptions,
                    contextChunks,
                );
                result = response.cards;
                statsResult = response.stats;
            } else {
                result = await generateCards.mutateAsync({
                    text: extractedText,
                    count: cardCount,
                    language: i18n.language,
                    options: generationOptions,
                });
            }

            setCards(result);
            setGenerationStats(statsResult);
            setHasGenerated(true);

            if (result.length > 0) {
                window.electronAPI?.notify?.show?.(
                    t('ai.notify_generate_done_title'),
                    t('ai.notify_generate_done_body', { count: result.length }),
                );
            }
        } catch (_error) {
            showToast(t('errors.generate_cards'), 'error');
        } finally {
            setIsGen(false);
            setProgress(null);
        }
    };

    const handleRemoveCard = (index: number) => {
        setCards(cards.filter((_, i) => i !== index));
    };

    const handleEditCard = (index: number, field: 'front' | 'back', value: string) => {
        const updated = [...cards];
        updated[index] = { ...updated[index], [field]: value };
        setCards(updated);
    };

    const handleImageUpdate = (index: number, field: 'front' | 'back', url: string | null) => {
        const updated = [...cards];
        const card = updated[index];
        if (field === 'front') card.frontImage = url || undefined;
        else card.backImage = url || undefined;
        setCards(updated);
    };

    // Helper to ensure "Basic" note type availability
    const getDefaultNoteTypeId = async (): Promise<string> => {
        const basicType = noteTypes.find(nt => nt.name === 'Basic');
        if (basicType) return basicType.id;

        const defaultType = DEFAULT_NOTE_TYPES[0];
        const created = await createNoteType.mutateAsync({
            user_id: userId,
            name: defaultType.name,
            fields: defaultType.fields,
            card_templates: defaultType.card_templates,
        });
        return created.id;
    };

    // Save a single card to the deck and remove it from the list
    const handleAddCard = async (index: number) => {
        if (!selectedDeckId) return;

        const card = cards[index];
        const noteTypeId = await getDefaultNoteTypeId();

        const frontContent = card.front + (card.frontImage ? `<br><img src="${card.frontImage}" />` : '');
        const backContent = card.back + (card.backImage ? `<br><img src="${card.backImage}" />` : '');

        try {
            await createNote.mutateAsync({
                note: {
                    user_id: userId,
                    deck_id: selectedDeckId,
                    note_type_id: noteTypeId,
                    fields: { Front: frontContent, Back: backContent },
                    tags: ['ai-generated'],
                    format: card.format ?? null,
                },
                templateCount: 1,
            });
            setCards(prev => prev.filter((_, i) => i !== index));
        } catch (_error) {
            showToast(t('errors.add_card'), 'error');
        }
    };

    // Bulk save all cards to deck, then clear the list
    const handleAddAll = async () => {
        if (!selectedDeckId) return;

        const noteTypeId = await getDefaultNoteTypeId();
        let addedCount = 0;

        for (const card of cards) {
            const frontContent = card.front + (card.frontImage ? `<br><img src="${card.frontImage}" />` : '');
            const backContent = card.back + (card.backImage ? `<br><img src="${card.backImage}" />` : '');

            try {
                await createNote.mutateAsync({
                    note: {
                        user_id: userId,
                        deck_id: selectedDeckId,
                        note_type_id: noteTypeId,
                        fields: { Front: frontContent, Back: backContent },
                        tags: ['ai-generated'],
                        format: card.format ?? null,
                    },
                    templateCount: 1,
                });
                addedCount++;
            } catch (_error) {
                showToast(t('errors.add_card'), 'error');
            }
        }

        setCards([]);
        if (addedCount > 0) {
            setSuccessMessage(t('ai.added_success', { count: addedCount }));
        }
    };


    // One-shot autostart loading view: shown only on the FIRST generation
    // pass kicked off by autoStart, before any cards exist. Subsequent
    // regenerations from the settings panel keep the cards in view while
    // the new batch is generated.
    if (autoStart && isGenerating && cards.length === 0 && !hasGenerated) {
        return (
            <div className="ai-generator">
                <div className="ai-auto-generating">
                    <div className="ai-auto-generating__icon" aria-hidden="true">
                        <Sparkles size={28} />
                    </div>
                    <h2 className="ai-auto-generating__title">{t('ai.auto_generating_title')}</h2>
                    <p className="ai-auto-generating__subtitle text-muted">
                        {t('ai.auto_generating_subtitle')}
                    </p>
                    <GenerationProgressBar progress={progress} />
                </div>
            </div>
        );
    }

    return (
        <div className="ai-generator">
            {/* Success Message */}
            {successMessage && (
                <div className="success-banner">
                    <CheckCircle size={18} />
                    {successMessage}
                </div>
            )}

            {/* Generation settings — collapsible. Header is always visible so
                users can expand to tweak formats / difficulty / count and
                regenerate. Collapsed-by-default after autoStart so the cards
                are the primary visual on the one-shot landing. */}
            <div className={`ai-settings-section${settingsExpanded ? ' is-expanded' : ' is-collapsed'}`}>
                <button
                    type="button"
                    className="ai-settings-toggle"
                    onClick={() => setSettingsExpanded((v) => !v)}
                    aria-expanded={settingsExpanded}
                    aria-controls="ai-settings-panel"
                >
                    <span className="ai-settings-toggle__label">
                        {settingsExpanded ? t('ai.hide_settings') : t('ai.show_settings')}
                    </span>
                    {settingsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {settingsExpanded && (
                    <div id="ai-settings-panel" className="ai-settings-panel">
                        <div className="ai-generator-settings">
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

                            <Input
                                type="number"
                                label={t('ai.cards_to_generate')}
                                min={1}
                                max={500}
                                value={cardCount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardCount(Number(e.target.value))}
                            />

                            <Button
                                variant="primary"
                                onClick={handleGenerate}
                                disabled={!canGenerate}
                                isLoading={isGenerating}
                                icon={!isGenerating && <Sparkles size={16} />}
                                style={{ marginTop: 'auto' }}
                            >
                                {hasGenerated ? t('ai.regenerate_button') : t('ai.generate_button')}
                            </Button>

                            {isGenerating && (
                                <GenerationProgressBar progress={progress} />
                            )}
                        </div>

                        {/* Generation Options */}
                        <div className="ai-generation-options">
                            <div className="ai-format-picker">
                                <label className="ai-format-picker__label">{t('ai.card_format')}</label>
                                <div className="ai-format-picker__pills" role="group" aria-label={t('ai.card_format')}>
                                    {([
                                        { value: 'basic',            label: t('ai.format_basic') },
                                        { value: 'cloze',            label: t('ai.format_cloze') },
                                        { value: 'reversed',         label: t('ai.format_reversed') },
                                        { value: 'true-false',       label: t('ai.format_true_false') },
                                        { value: 'compare-contrast', label: t('ai.format_compare_contrast') },
                                        { value: 'multiple-choice',  label: t('ai.format_multiple_choice') },
                                    ] as const).map((opt) => {
                                        const active = selectedFormats.has(opt.value);
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                className={`ai-format-pill${active ? ' ai-format-pill--active' : ''}`}
                                                onClick={() => toggleFormat(opt.value)}
                                                aria-pressed={active}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <Select
                                label={t('ai.difficulty')}
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value as AIGenerationOptions['difficulty'])}
                                options={[
                                    { label: t('ai.difficulty_essential'), value: 'essential' },
                                    { label: t('ai.difficulty_detailed'), value: 'detailed' },
                                ]}
                            />

                            <Input
                                label={t('ai.custom_instructions')}
                                multiline
                                value={customInstructions}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomInstructions(e.target.value)}
                                placeholder={t('ai.custom_instructions_placeholder')}
                                rows={2}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Empty State after processing */}
            {hasGenerated && cards.length === 0 && (
                <div className="ai-empty-state">
                    <CheckCircle size={40} className="empty-state__icon" />
                    <h3>{t('ai.all_processed')}</h3>
                    <p className="text-muted">
                        {t('ai.all_processed_desc')}
                    </p>
                    <Button
                        variant="secondary"
                        onClick={onComplete}
                        icon={<Inbox size={16} />}
                    >
                        {t('ai.start_new')}
                    </Button>
                </div>
            )
            }

            {/* Generated Cards Preview */}
            {
                cards.length > 0 && (
                    <div className="ai-cards-preview">
                        <div className="ai-cards-header">
                            <div>
                                <h3>{t('ai.generated_cards', { count: cards.length })}</h3>
                                {generationStats && generationStats.filtered > 0 && (
                                    <p className="ai-generation-stats">
                                        {t('ai.generation_stats', { generated: generationStats.generated, filtered: generationStats.filtered })}
                                    </p>
                                )}
                            </div>
                            <Button
                                variant="primary"
                                onClick={handleAddAll}
                                disabled={!selectedDeckId || isAdding}
                                icon={<Plus size={16} />}
                            >
                                {t('ai.add_all')}
                            </Button>
                        </div>

                        <div className="ai-cards-list">
                            {cards.map((card, index) => (
                                <div key={index} className="ai-card-item">
                                    <div className="ai-card-content">
                                        {(['front', 'back'] as const).map((side) => {
                                            const isEditing = editing?.index === index && editing?.side === side;
                                            const value = side === 'front' ? card.front : card.back;
                                            const labelKey = side === 'front' ? 'modals.front' : 'modals.back';
                                            const currentImage = side === 'front' ? card.frontImage : card.backImage;
                                            return (
                                                <div key={side} className="ai-card-field" style={{ position: 'relative', marginTop: side === 'back' ? '0.5rem' : 0 }}>
                                                    {isEditing ? (
                                                        <Input
                                                            label={t(labelKey)}
                                                            multiline
                                                            autoFocus
                                                            value={value}
                                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleEditCard(index, side, e.target.value)}
                                                            onBlur={() => setEditing(null)}
                                                            rows={4}
                                                        />
                                                    ) : (
                                                        <>
                                                            <label className="ai-card-field-label">{t(labelKey)}</label>
                                                            <div
                                                                className="ai-card-field-preview"
                                                                data-card-format={card.format ?? undefined}
                                                                role="textbox"
                                                                tabIndex={0}
                                                                onClick={() => setEditing({ index, side })}
                                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing({ index, side }); } }}
                                                                dangerouslySetInnerHTML={{ __html: sanitize(value || '') }}
                                                            />
                                                        </>
                                                    )}
                                                    <div style={{ position: 'absolute', right: 10, top: 32 }}>
                                                        <ImageUpload
                                                            userId={userId}
                                                            onUpload={(url: string) => handleImageUpdate(index, side, url)}
                                                            currentImage={currentImage}
                                                            onRemove={() => handleImageUpdate(index, side, null)}
                                                            label={t('ai.add_image')}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="ai-card-actions">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            className={!selectedDeckId ? 'disabled-with-tooltip' : ''}
                                            onClick={() => handleAddCard(index)}
                                            disabled={!selectedDeckId || isAdding}
                                            title={!selectedDeckId ? t('modals.select_deck_tooltip') : t('modals.add_to_deck_tooltip')}
                                            isLoading={isAdding}
                                            icon={!isAdding && <Plus size={14} />}
                                        >
                                            {t('ai.action_add')}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={async () => {
                                                await saveDraft.mutateAsync({ front: card.front, back: card.back, source: contextSummary ?? undefined });
                                                setCards(prev => prev.filter((_, i) => i !== index));
                                            }}
                                            disabled={draftsFull || saveDraft.isPending}
                                            title={draftsFull ? t('ai.draft_full', { count: drafts.length, limit: DRAFT_LIMIT }) : t('ai.save_draft')}
                                            icon={<Inbox size={14} />}
                                        >
                                            {t('ai.action_draft')}
                                        </Button>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => handleRemoveCard(index)}
                                            title={t('modals.remove_tooltip')}
                                            icon={<X size={14} />}
                                        >
                                            {t('ai.action_delete')}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }


            {
                showDeckEditor && (
                    <DeckEditor
                        userId={userId}
                        onClose={() => setShowDeckEditor(false)}
                        onSuccess={(newDeck) => {
                            setSelectedDeckId(newDeck.id);
                            setShowDeckEditor(false);
                        }}
                    />
                )
            }
        </div >
    );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
// Shows a determinate bar driven by `ai-progress` events. When no event has
// arrived yet (cold start) or when the legacy non-streaming generator is in
// use, falls back to an indeterminate animated bar with a generic label.

const PHASE_LABELS: Record<AIProgress['phase'], string> = {
    chunking:   'Analyzing your document…',
    generating: 'Generating cards',
    refining:   'Refining cards…',
    done:       'Finishing up…',
};

function GenerationProgressBar({ progress }: { progress: AIProgress | null }) {
    if (!progress) {
        return (
            <div className="ai-progress" aria-live="polite">
                <div className="ai-progress__label">Working on it…</div>
                <div className="ai-progress__track">
                    <div className="ai-progress__fill ai-progress__fill--indeterminate" />
                </div>
            </div>
        );
    }

    const pct = progress.total > 0
        ? Math.min(100, Math.round((progress.current / progress.total) * 100))
        : 0;

    return (
        <div className="ai-progress" aria-live="polite">
            <div className="ai-progress__label">
                {PHASE_LABELS[progress.phase]}
            </div>
            <div className="ai-progress__track">
                <div className="ai-progress__fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
