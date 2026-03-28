import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDueCards, useAllCardsForStudy, useUpdateCard, useDeck } from '../../hooks/useDecks';
import { useCreateSession, useCompleteSession, useInsertReview } from '../../hooks/useSessions';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useYieldScores } from '../../hooks/useYield';
import { getSchedulingOptions } from '../../lib/fsrs';
import { isExamDateSet } from '../../lib/queries';
import type { YieldScoreRow } from '../../lib/queries';
import { useProfileStore } from '../../stores/profileStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import CardViewer from '../Card/CardViewer';
import RatingButtons from './RatingButtons';
import StudyTimer from './StudyTimer';
import YieldBadge from './YieldBadge';
import UrgencyChip from './UrgencyChip';
import { Button, SessionAnalytics, useToast } from '../UI';
import type { Rating, CardUpdate } from '../../lib/types';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import type { CardWithNote } from '../../lib/queries';
import { renderAnkiTemplate } from '../../lib/mediaResolver';

export default function StudySession() {
    const { deckId: deckIdParam } = useParams<{ deckId: string }>();
    const deckId = deckIdParam!;
    const [searchParams] = useSearchParams();
    const mode = (searchParams.get('mode') as 'due' | 'all') || 'due';
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { goToDeck } = useAppNavigation();
    const { data: deck } = useDeck(deckId);
    const dueCardsResult = useDueCards(mode === 'due' ? deckId : null);
    const allCardsResult = useAllCardsForStudy(mode === 'all' ? deckId : null);

    const { data: cards = [], isLoading, refetch } = mode === 'due' ? dueCardsResult : allCardsResult;
    const updateCard = useUpdateCard();
    const createSession = useCreateSession();
    const completeSession = useCompleteSession();
    const insertReview = useInsertReview();
    const { t } = useTranslation();
    const { showToast } = useToast();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [schedulingOptions, setSchedulingOptions] = useState<Record<Rating, CardUpdate> | null>(null);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Timer state
    const { profile } = useProfileStore();
    const maxSeconds = profile?.max_answer_seconds ?? 60;
    const showTimer = profile?.show_timer ?? true;
    const autoAdvance = profile?.auto_advance_on_timeout ?? false;
    const cardStartTimeRef = useRef<number>(Date.now());
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const currentCard: CardWithNote | undefined = cards[currentIndex];
    const isComplete = currentIndex >= cards.length && cards.length > 0;
    const isEmpty = cards.length === 0 && !isLoading;
    const fsrsEnabled = deck?.algorithm === 'fsrs';

    // ── Yield data overlay ──────────────────────────────────────────
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;
    const cardIds = useMemo(() => cards.map(c => c.id), [cards]);
    const { data: yieldScores } = useYieldScores(examKey, cardIds.length > 0 ? cardIds : undefined);
    const yieldMap = useMemo(() => {
        if (!yieldScores) return new Map<string, YieldScoreRow>();
        return new Map(yieldScores.map(s => [s.cardId, s]));
    }, [yieldScores]);
    const currentYield = currentCard ? yieldMap.get(currentCard.id) : undefined;

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
                .catch(() => showToast(t('errors.session_create'), 'error'));
        }
    }, [cards.length, isLoading, userId, deckId, sessionId]);

    // Fire threshold-shift notification once per session
    useEffect(() => {
        if (sessionId && userId && examProfile && isExamDateSet(examProfile.exam_date)) {
            window.electronAPI?.notify.thresholdShift(userId);
        }
    }, [sessionId]);

    useEffect(() => {
        if (currentCard) {
            const options = getSchedulingOptions(currentCard);
            setSchedulingOptions(options);
        }
    }, [currentCard]);

    // Timer lifecycle: reset and start on each new card
    useEffect(() => {
        if (!currentCard) return;

        cardStartTimeRef.current = Date.now();
        setElapsedSeconds(0);

        timerIntervalRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - cardStartTimeRef.current) / 1000);
            setElapsedSeconds(elapsed);
        }, 1000);

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [currentCard]);

    const handleReveal = () => {
        setIsRevealed(true);
    };

    const handleUnreveal = () => {
        setIsRevealed(false);
    };

    // Spacebar to flip card (additive — "Show Answer" button still works)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== ' ') return;

            // Don't interfere when user is typing in an input/textarea
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            e.preventDefault(); // prevent page scroll
            if (!isRevealed) handleReveal();
            else handleUnreveal();
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isRevealed]);

    const handleRate = useCallback(async (rating: Rating) => {
        if (!currentCard || !schedulingOptions) return;

        const updates = schedulingOptions[rating];
        const isLastCard = currentIndex + 1 >= cards.length;

        // Compute review duration (capped at max_answer_seconds)
        const durationMs = Math.min(
            Date.now() - cardStartTimeRef.current,
            maxSeconds * 1000,
        );

        await updateCard.mutateAsync({
            cardId: currentCard.id,
            updates,
        });

        if (sessionId && userId) {
            await insertReview.mutateAsync({
                user_id: userId,
                card_id: currentCard.id,
                rating,
                session_id: sessionId,
                deck_id: deckId,
                review_index: reviewedCount + 1,
                review_duration_ms: durationMs,
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
            window.electronAPI?.notify.streak(userId);
        }

        setReviewedCount((prev) => prev + 1);
        setIsRevealed(false);
        setCurrentIndex((prev) => prev + 1);
    }, [currentCard, schedulingOptions, currentIndex, cards.length, maxSeconds, sessionId, userId, deckId, reviewedCount]);

    // Auto-advance on timeout
    useEffect(() => {
        if (!autoAdvance || elapsedSeconds < maxSeconds) return;
        if (updateCard.isPending || !currentCard) return;

        if (!isRevealed) {
            // Auto-flip: reveal the answer, reset timer for answer phase
            handleReveal();
            cardStartTimeRef.current = Date.now();
            setElapsedSeconds(0);
            showToast(t('study.timer.auto_flipped'), 'success');
        } else {
            // Auto-grade as "Again"
            showToast(t('study.timer.auto_graded_again'), 'error');
            handleRate('again');
        }
    }, [elapsedSeconds, maxSeconds, autoAdvance, isRevealed, updateCard.isPending, currentCard]);

    const handleStudyAgain = () => {
        setSessionId(null);
        refetch();
        setCurrentIndex(0);
        setReviewedCount(0);
        setIsRevealed(false);
        setElapsedSeconds(0);
        cardStartTimeRef.current = Date.now();
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
                    <Button variant="secondary" onClick={() => goToDeck(deckId)} icon={<ArrowLeft size={16} />}>
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
                onBack={() => goToDeck(deckId)}
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
                        <Button variant="secondary" onClick={() => goToDeck(deckId)}>
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

    const isAnkiCard = noteType?.anki_id != null;

    const frontContent = resolvedTemplate
        ? (isAnkiCard
            ? renderAnkiTemplate(resolvedTemplate.front_template, fields, userId)
            : renderCardContent(resolvedTemplate.front_template, fields))
        : t('study.no_template');
    const backContent = resolvedTemplate
        ? (isAnkiCard
            ? renderAnkiTemplate(resolvedTemplate.back_template, fields, userId, frontContent)
            : renderCardContent(resolvedTemplate.back_template, fields))
        : t('study.no_template');

    return (
        <div className="study-session" data-testid="study-session">
            <div className="study-header">
                <Button variant="secondary" onClick={() => goToDeck(deckId)} data-testid="back-btn" icon={<ArrowLeft size={16} />}>
                    {t('common.back')}
                </Button>
                <StudyTimer
                    elapsedSeconds={elapsedSeconds}
                    maxSeconds={maxSeconds}
                    visible={showTimer}
                />
                {examProfile && isExamDateSet(examProfile.exam_date) && (
                    <UrgencyChip
                        examDate={examProfile.exam_date}
                        sessionMode={examProfile.session_mode}
                    />
                )}
                <span className="progress-text">
                    {currentIndex + 1} / {cards.length}
                </span>
            </div>

            <div
                className="study-content"
                onClick={() => { if (!isRevealed) handleReveal(); else handleUnreveal(); }}
                style={{ cursor: 'pointer' }}
            >
                {currentYield && examKey && (
                    <YieldBadge
                        level={currentYield.yieldLevel}
                        score={currentYield.yieldScore}
                        cardId={currentYield.cardId}
                        examKey={examKey}
                    />
                )}
                <CardViewer
                    front={frontContent}
                    back={backContent}
                    isRevealed={isRevealed}
                    onReveal={handleReveal}
                    onUnreveal={handleUnreveal}
                />
            </div>

            {/* Action zone — pinned at bottom, outside scrollable area */}
            <div className="rating-zone">
                {!isRevealed ? (
                    <button className="classic-show-answer" onClick={handleReveal}>
                        {t('study.show_answer')}
                    </button>
                ) : fsrsEnabled && schedulingOptions ? (
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
    );
}
