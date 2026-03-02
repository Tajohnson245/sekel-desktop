import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../../../node_modules/react-i18next';
import { useDueCards, useAllCardsForStudy, useUpdateCard, useDeck } from '../../hooks/useDecks';
import { useCreateSession, useCompleteSession, useInsertReview } from '../../hooks/useSessions';
import { getSchedulingOptions } from '../../lib/fsrs';
import CardViewer from '../Card/CardViewer';
import RatingButtons from './RatingButtons';
import { Button, SessionAnalytics } from '../UI';
import type { Rating, CardUpdate } from '../../lib/types';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import type { CardWithNote } from '../../lib/queries';
import { ChevronRight } from 'lucide-react';

interface StudySessionProps {
    deckId: string;
    userId: string;
    mode?: 'due' | 'all';
    onBack: () => void;
}

export default function StudySession({ deckId, userId, mode = 'due', onBack }: StudySessionProps) {
    const { data: deck } = useDeck(deckId);
    const dueCardsResult = useDueCards(mode === 'due' ? deckId : null);
    const allCardsResult = useAllCardsForStudy(mode === 'all' ? deckId : null);

    const { data: cards = [], isLoading, refetch } = mode === 'due' ? dueCardsResult : allCardsResult;
    const updateCard = useUpdateCard();
    const createSession = useCreateSession();
    const completeSession = useCompleteSession();
    const insertReview = useInsertReview();
    const { t } = useTranslation();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [schedulingOptions, setSchedulingOptions] = useState<Record<Rating, CardUpdate> | null>(null);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const currentCard: CardWithNote | undefined = cards[currentIndex];
    const isComplete = currentIndex >= cards.length && cards.length > 0;
    const isEmpty = cards.length === 0 && !isLoading;
    const fsrsEnabled = deck?.fsrs_enabled ?? true;

    useEffect(() => {
        setCurrentIndex(0);
        setReviewedCount(0);
        setSessionId(null);
    }, [deckId]);

    useEffect(() => {
        if (cards.length > 0 && !isLoading && userId && !sessionId) {
            createSession
                .mutateAsync({ userId, deckId })
                .then((session) => setSessionId(session.id))
                .catch(() => { });
        }
    }, [cards.length, isLoading, userId, deckId, sessionId]);

    useEffect(() => {
        if (currentCard) {
            const options = getSchedulingOptions(currentCard);
            setSchedulingOptions(options);
        }
    }, [currentCard]);

    const handleReveal = () => {
        setIsRevealed(true);
    };

    const handleUnreveal = () => {
        setIsRevealed(false);
    };

    const handleRate = async (rating: Rating) => {
        if (!currentCard || !schedulingOptions) return;

        const updates = schedulingOptions[rating];
        const isLastCard = currentIndex + 1 >= cards.length;

        await updateCard.mutateAsync({
            cardId: currentCard.id,
            updates,
        });

        if (sessionId && userId) {
            const deckIdFromNote = currentCard.note?.deck_id ?? deckId;
            await insertReview.mutateAsync({
                user_id: userId,
                card_id: currentCard.id,
                rating,
                session_id: sessionId,
                deck_id: deckIdFromNote,
                review_index: reviewedCount + 1,
                state_before: currentCard.state,
                stability_before: currentCard.stability,
                difficulty_before: currentCard.difficulty,
                state_after: updates.state ?? currentCard.state,
                stability_after: updates.stability ?? 0,
                difficulty_after: updates.difficulty ?? 0,
                scheduled_days: updates.scheduled_days ?? 0,
            });
        }

        if (isLastCard && sessionId) {
            await completeSession.mutateAsync(sessionId);
        }

        setReviewedCount((prev) => prev + 1);
        setIsRevealed(false);
        setCurrentIndex((prev) => prev + 1);
    };

    const handleStudyAgain = () => {
        setSessionId(null);
        refetch();
        setCurrentIndex(0);
        setReviewedCount(0);
        setIsRevealed(false);
    };

    // Render card content using template
    const renderCardContent = (template: string, fields: Record<string, string>) => {
        let content = template;
        Object.entries(fields).forEach(([key, value]) => {
            content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
        // Clear leftover simple field placeholders (e.g. {{Front}}) but NOT cloze
        // syntax like {{c1::answer}} — those are processed later by CardViewer
        content = content.replace(/\{\{(?!c\d+::)[^}]+\}\}/g, '');
        return content;
    };

    if (isLoading) {
        return (
            <div className="study-session" data-testid="study-session">
                <div className="loading">{t('decks.loading')}</div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="study-session" data-testid="study-session">
                <div className="study-header">
                    <Button variant="secondary" onClick={onBack} icon={<ArrowLeft size={16} />}>
                        {t('common.back')}
                    </Button>
                </div>
                <div className="empty-state" data-testid="no-cards-due">
                    <div className="empty-icon">🎉</div>
                    <h3>{t('study.session_complete')}</h3>
                    <p className="text-muted">{t('study.back_to_decks')}</p>
                </div>
            </div>
        );
    }

    if (isComplete && sessionId) {
        return (
            <SessionAnalytics
                sessionId={sessionId}
                reviewedCount={reviewedCount}
                onBack={onBack}
                onStudyAgain={handleStudyAgain}
            />
        );
    }

    if (isComplete && !sessionId) {
        return (
            <div className="study-session" data-testid="study-session">
                <div className="study-complete" data-testid="study-complete">
                    <h2>{t('study.congratulations')}</h2>
                    <p className="text-muted">
                        {t('study.cards_studied')}: {reviewedCount}
                    </p>
                    <div className="complete-actions">
                        <Button variant="secondary" onClick={onBack}>
                            {t('study.back_to_decks')}
                        </Button>
                        <Button variant="primary" onClick={handleStudyAgain}>
                            {t('study.study_again')}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const noteType = currentCard?.note?.note_type;
    const templateIndex = currentCard?.template_index ?? 0;
    const fields = currentCard?.note?.fields ?? {};

    // For the Image Occlusion note type, always use the canonical template from
    // DEFAULT_NOTE_TYPES so that {{Front}} and {{Back}} fields are rendered even
    // if the DB still has the old template (created before these fields existed).
    const resolvedTemplate = (() => {
        if (noteType?.name === 'Image Occlusion') {
            const canonical = DEFAULT_NOTE_TYPES.find(t => t.name === 'Image Occlusion');
            return canonical?.card_templates?.[templateIndex] ?? noteType?.card_templates?.[templateIndex];
        }
        return noteType?.card_templates?.[templateIndex];
    })();

    const frontContent = resolvedTemplate
        ? renderCardContent(resolvedTemplate.front_template, fields)
        : 'No template';
    const backContent = resolvedTemplate
        ? renderCardContent(resolvedTemplate.back_template, fields)
        : 'No template';

    return (
        <div className="study-session" data-testid="study-session">
            <div className="study-header">
                <Button variant="secondary" onClick={onBack} data-testid="back-btn" icon={<ArrowLeft size={16} />}>
                    {t('common.back')}
                </Button>
                <span className="progress-text">
                    {currentIndex + 1} / {cards.length}
                </span>
            </div>

            <div className="study-content">
                <CardViewer
                    front={frontContent}
                    back={backContent}
                    isRevealed={isRevealed}
                    onReveal={handleReveal}
                    onUnreveal={handleUnreveal}
                />

                {/* Always reserve space for buttons — visibility toggled so card never shifts */}
                <div className="rating-zone" style={{ visibility: isRevealed ? 'visible' : 'hidden' }}>
                    {fsrsEnabled && schedulingOptions ? (
                        <RatingButtons
                            options={schedulingOptions}
                            onRate={handleRate}
                            isLoading={updateCard.isPending}
                        />
                    ) : (
                        <div className="next-action">
                            <Button
                                variant="primary"
                                size="lg"
                                onClick={() => handleRate('good')}
                                isLoading={updateCard.isPending}
                                icon={<ChevronRight size={18} />}
                            >
                                {t('common.next')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
