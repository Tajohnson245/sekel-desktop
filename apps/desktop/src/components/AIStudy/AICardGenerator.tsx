import { useState, useMemo, useEffect } from 'react';
import { Sparkles, X, Plus, CheckCircle, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGenerateCards, type GeneratedCard, type AIGenerationOptions } from '../../hooks/useAI';
import { useSaveDraft, useDrafts, DRAFT_LIMIT } from '../../hooks/useDrafts';
import { useCreateNote, useNoteTypes, useCreateNoteType } from '../../hooks/useNotes';
import { useDecks } from '../../hooks/useDecks';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import DeckEditor from '../Deck/DeckEditor';
import { Button, Input, Select, ImageUpload, useToast } from '../UI';
import './AICardGenerator.css';

interface AICardGeneratorProps {
    extractedText: string;
    userId: string;
    onComplete: () => void;
    initialDeckId?: string;
    contextSummary?: string;
    estimatedCardCount?: number;
    onCardCountChange?: (count: number) => void;
}

export default function AICardGenerator({ extractedText, contextSummary, estimatedCardCount, userId, onComplete, initialDeckId, onCardCountChange }: AICardGeneratorProps) {
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
    const [cardCount, setCardCount] = useState(estimatedCardCount ?? 5);
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [showDeckEditor, setShowDeckEditor] = useState(false);
    const [isGen, setIsGen] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);
    const [generationStats, setGenerationStats] = useState<{ generated: number; kept: number; filtered: number } | null>(null);

    // Generation options
    const [cardFormat, setCardFormat] = useState<AIGenerationOptions['cardFormat']>('basic');
    const [difficulty, setDifficulty] = useState<AIGenerationOptions['difficulty']>('detailed');
    const [customInstructions, setCustomInstructions] = useState('');

    // Initial card count update
    useEffect(() => {
        onCardCountChange?.(cards.length);
    }, [cards.length, onCardCountChange]);

    const isGenerating = generateCards.isPending || isGen;
    const isAdding = createNote.isPending;
    const draftsFull = drafts.length >= DRAFT_LIMIT;

    const deckOptions = useMemo(() => [
        { label: t('ai.create_new_deck'), value: 'new' },
        ...decks.map(d => ({ label: d.name, value: d.id }))
    ], [decks, t]);

    // Build options object from current state
    const generationOptions: AIGenerationOptions = {
        cardFormat,
        difficulty,
        customInstructions: customInstructions.trim() || undefined,
    };

    // Trigger AI generation
    const handleGenerate = async () => {
        try {
            setSuccessMessage('');
            setIsGen(true);

            let result: GeneratedCard[] = [];
            let statsResult: { generated: number; kept: number; filtered: number } | null = null;

            if (contextSummary) {
                const response = await window.electronAPI.generateCardsFromContext(contextSummary, extractedText, cardCount, i18n.language, generationOptions);
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
        } catch (_error) {
            showToast(t('errors.generate_cards'), 'error');
        } finally {
            setIsGen(false);
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


    return (
        <div className="ai-generator">
            {/* Success Message */}
            {successMessage && (
                <div className="success-banner">
                    <CheckCircle size={18} />
                    {successMessage}
                </div>
            )}

            {/* Settings Bar */}
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
                    max={Math.max(estimatedCardCount ?? 20, 20)}
                    value={cardCount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardCount(Number(e.target.value))}
                />

                <Button
                    variant="primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || !extractedText}
                    isLoading={isGenerating}
                    icon={!isGenerating && <Sparkles size={16} />}
                    style={{ marginTop: 'auto' }}
                >
                    {t('ai.generate_button')}
                </Button>
            </div>

            {/* Generation Options */}
            <div className="ai-generation-options">
                <Select
                    label={t('ai.card_format')}
                    value={cardFormat}
                    onChange={(e) => setCardFormat(e.target.value as AIGenerationOptions['cardFormat'])}
                    options={[
                        { label: t('ai.format_basic'), value: 'basic' },
                        { label: t('ai.format_cloze'), value: 'cloze' },
                        { label: t('ai.format_reversed'), value: 'reversed' },
                    ]}
                />

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

            {/* Empty State after processing */}
            {hasGenerated && cards.length === 0 && (
                <div className="ai-empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius)', marginTop: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                    <h3 style={{ marginBottom: '0.5rem' }}>{t('ai.all_processed')}</h3>
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
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
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
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
                                        <div style={{ position: 'relative' }}>
                                            <Input
                                                label={t('modals.front')}
                                                multiline
                                                value={card.front}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleEditCard(index, 'front', e.target.value)}
                                                rows={2}
                                            />
                                            <div style={{ position: 'absolute', right: 10, top: 32 }}>
                                                <ImageUpload
                                                    userId={userId}
                                                    onUpload={(url: string) => handleImageUpdate(index, 'front', url)}
                                                    currentImage={card.frontImage}
                                                    onRemove={() => handleImageUpdate(index, 'front', null)}
                                                    label={t('ai.add_image')}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                                            <Input
                                                label={t('modals.back')}
                                                multiline
                                                value={card.back}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleEditCard(index, 'back', e.target.value)}
                                                rows={2}
                                            />
                                            <div style={{ position: 'absolute', right: 10, top: 32 }}>
                                                <ImageUpload
                                                    userId={userId}
                                                    onUpload={(url: string) => handleImageUpdate(index, 'back', url)}
                                                    currentImage={card.backImage}
                                                    onRemove={() => handleImageUpdate(index, 'back', null)}
                                                    label={t('ai.add_image')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ai-card-actions">
                                        <Button
                                            variant="icon"
                                            className={!selectedDeckId ? 'disabled-with-tooltip' : ''}
                                            onClick={() => handleAddCard(index)}
                                            disabled={!selectedDeckId || isAdding}
                                            title={!selectedDeckId ? t('modals.select_deck_tooltip') : t('modals.add_to_deck_tooltip')}
                                            isLoading={isAdding}
                                            icon={!isAdding && <Plus size={16} />}
                                        />
                                        <Button
                                            variant="icon"
                                            onClick={async () => {
                                                await saveDraft.mutateAsync({ front: card.front, back: card.back, source: contextSummary ?? undefined });
                                                setCards(prev => prev.filter((_, i) => i !== index));
                                            }}
                                            disabled={draftsFull || saveDraft.isPending}
                                            title={draftsFull ? t('ai.draft_full', { count: drafts.length, limit: DRAFT_LIMIT }) : t('ai.save_draft')}
                                            icon={<Inbox size={16} />}
                                        />
                                        <Button
                                            variant="icon"
                                            className="text-danger"
                                            onClick={() => handleRemoveCard(index)}
                                            title={t('modals.remove_tooltip')}
                                            icon={<X size={16} />}
                                        />
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
