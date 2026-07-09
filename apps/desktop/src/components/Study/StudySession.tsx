import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDueCards, useDueCardsFocused, useAllCardsForStudy, useUpdateCard, useDeck } from '../../hooks/useDecks';
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

import { Button, SessionAnalytics, useToast } from '../UI';
import type { Rating, CardUpdate } from '../../lib/types';
import { DEFAULT_NOTE_TYPES } from '../../lib/types';
import type { CardWithNote } from '../../lib/queries';
import { renderAnkiTemplate } from '../../lib/mediaResolver';
import './StudySession.css';

interface RateSnapshot {
    card: CardWithNote;
    index: number;
    rating: Rating;
    durationMs: number;
}

export default function StudySession() {
    const { deckId: deckIdParam } = useParams<{ deckId: string }>();
    const deckId = deckIdParam!;
    const [searchParams] = useSearchParams();
    const mode = (searchParams.get('mode') as 'due' | 'all') || 'due';
    const focusMode = searchParams.get('focus');
    const systemsParam = searchParams.get('systems');
    const focusSystemKeys = focusMode === 'intelligence' && systemsParam
        ? systemsParam.split(',').filter(Boolean)
        : [];
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { goToDeck } = useAppNavigation();
    const { data: deck } = useDeck(deckId);
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;
    const dueCardsResult = useDueCards(mode === 'due' && focusSystemKeys.length === 0 ? deckId : null);
    const allCardsResult = useAllCardsForStudy(mode === 'all' ? deckId : null);
    const focusedCardsResult = useDueCardsFocused(
        mode === 'due' && focusSystemKeys.length > 0 ? deckId : null,
        focusSystemKeys,
        examKey,
    );

    const { data: cards = [], isLoading, refetch } = focusSystemKeys.length > 0
        ? focusedCardsResult
        : mode === 'due' ? dueCardsResult : allCardsResult;
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
    const [againCount, setAgainCount] = useState(0);
    const [totalDurationMs, setTotalDurationMs] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const lastRatedRef = useRef<RateSnapshot | null>(null);

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
        setAgainCount(0);
        setTotalDurationMs(0);
        setSessionId(null);
        lastRatedRef.current = null;
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

    // Safety net: clear the interval on unmount.
    useEffect(() => {
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, []);

    // Timer lifecycle: reset and start on each new card
    useEffect(() => {
        if (!currentCard) return;
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
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

    const handleReveal = useCallback(() => setIsRevealed(true), []);
    const handleUnreveal = useCallback(() => setIsRevealed(false), []);

    const handleRate = useCallback(async (rating: Rating) => {
        if (!currentCard || !schedulingOptions) return;

        const updates = schedulingOptions[rating];
        const isLastCard = currentIndex + 1 >= cards.length;
        const durationMs = Math.min(Date.now() - cardStartTimeRef.current, maxSeconds * 1000);

        // Snapshot for single-level Undo (spec §8, key U).
        lastRatedRef.current = { card: currentCard, index: currentIndex, rating, durationMs };

        await updateCard.mutateAsync({ cardId: currentCard.id, updates });

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
        if (rating === 'again') setAgainCount((prev) => prev + 1);
        setTotalDurationMs((prev) => prev + durationMs);
        setIsRevealed(false);
        setCurrentIndex((prev) => prev + 1);
    }, [currentCard, schedulingOptions, currentIndex, cards.length, maxSeconds, sessionId, userId, deckId, reviewedCount]);

    // Undo last rating (spec §8). Restores the previous card's pre-review FSRS
    // state from the local snapshot (scheduling writes absolute values, so this
    // is a clean revert) and steps the view back, revealed, for re-rating.
    const handleUndo = useCallback(async () => {
        const snap = lastRatedRef.current;
        if (!snap || updateCard.isPending) return;
        // Guard: the previous card must still occupy its slot.
        if (cards[snap.index]?.id !== snap.card.id) {
            showToast(t('study.undo_unavailable', { defaultValue: "Can't undo — the list changed" }), 'error');
            return;
        }
        const c = snap.card;
        const revert: CardUpdate = {
            state: c.state,
            due: c.due,
            stability: c.stability,
            difficulty: c.difficulty,
            elapsed_days: c.elapsed_days,
            scheduled_days: c.scheduled_days,
            reps: c.reps,
            lapses: c.lapses,
            last_review: c.last_review,
        };
        await updateCard.mutateAsync({ cardId: c.id, updates: revert });
        setReviewedCount((p) => Math.max(0, p - 1));
        if (snap.rating === 'again') setAgainCount((p) => Math.max(0, p - 1));
        setTotalDurationMs((p) => Math.max(0, p - snap.durationMs));
        setCurrentIndex(snap.index);
        setIsRevealed(true);
        lastRatedRef.current = null;
        showToast(t('study.undo_done', { defaultValue: 'Undid last rating' }), 'success');
    }, [cards, updateCard, showToast, t]);

    const requestExit = useCallback(() => {
        if (reviewedCount > 0 || isRevealed) setShowExitConfirm(true);
        else goToDeck(deckId);
    }, [reviewedCount, isRevealed, goToDeck, deckId]);

    // ── Consolidated study keyboard map (spec §8) ────────────────────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (!isRevealed) handleReveal();
                    else handleUnreveal();
                    break;
                case '1': case '2': case '3': case '4': {
                    if (!isRevealed || !fsrsEnabled || !schedulingOptions) return;
                    e.preventDefault();
                    const map: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
                    handleRate(map[e.key]);
                    break;
                }
                case 'u': case 'U':
                    e.preventDefault();
                    handleUndo();
                    break;
                case 'e': case 'E':
                    e.preventDefault();
                    showToast(t('study.edit_soon', { defaultValue: 'In-session card editing is coming soon' }), 'success');
                    break;
                case 'Escape':
                    e.preventDefault();
                    requestExit();
                    break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isRevealed, fsrsEnabled, schedulingOptions, handleReveal, handleUnreveal, handleRate, handleUndo, requestExit, showToast, t]);

    // Auto-advance on timeout
    useEffect(() => {
        if (!autoAdvance || elapsedSeconds < maxSeconds) return;
        if (updateCard.isPending || !currentCard) return;
        if (!isRevealed) {
            handleReveal();
            cardStartTimeRef.current = Date.now();
            setElapsedSeconds(0);
            showToast(t('study.timer.auto_flipped'), 'success');
        } else {
            showToast(t('study.timer.auto_graded_again'), 'error');
            handleRate('again');
        }
    }, [elapsedSeconds, maxSeconds, autoAdvance, isRevealed, updateCard.isPending, currentCard]);

    const handleStudyAgain = () => {
        setSessionId(null);
        refetch();
        setCurrentIndex(0);
        setReviewedCount(0);
        setAgainCount(0);
        setTotalDurationMs(0);
        setIsRevealed(false);
        setElapsedSeconds(0);
        lastRatedRef.current = null;
        cardStartTimeRef.current = Date.now();
    };

    const renderCardContent = (template: string, fields: Record<string, string>) => {
        let content = template;
        Object.entries(fields).forEach(([key, value]) => {
            content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
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
                <div className="study-topbar">
                    <Button variant="ghost" onClick={() => goToDeck(deckId)} icon={<ArrowLeft size={16} />}>
                        {t('common.back')}
                    </Button>
                </div>
                <div className="empty-v2" data-testid="no-cards-due">
                    <CheckCircle2 size={34} style={{ color: 'var(--teal)' }} />
                    <p className="empty-v2__line">{t('study.session_complete')}</p>
                    <Button variant="primary" onClick={() => goToDeck(deckId)}>{t('study.back_to_decks')}</Button>
                </div>
            </div>
        );
    }

    if (isComplete && sessionId) {
        return (
            <SessionAnalytics
                sessionId={sessionId}
                reviewedCount={reviewedCount}
                userId={userId}
                deckName={deck?.name ?? ''}
                onBack={() => goToDeck(deckId)}
                onStudyAgain={handleStudyAgain}
            />
        );
    }

    if (isComplete && !sessionId) {
        return (
            <div className="study-session" data-testid="study-session">
                <div className="empty-v2" data-testid="study-complete">
                    <p className="empty-v2__line">{t('study.congratulations')}</p>
                    <p className="page-subtitle">{t('study.cards_studied')}: {reviewedCount}</p>
                    <div className="complete-actions">
                        <Button variant="ghost" onClick={() => goToDeck(deckId)}>{t('study.back_to_decks')}</Button>
                        <Button variant="primary" onClick={handleStudyAgain}>{t('study.study_again')}</Button>
                    </div>
                </div>
            </div>
        );
    }

    const noteType = currentCard?.note?.note_type;
    const templateIndex = currentCard?.template_index ?? 0;
    const fields = currentCard?.note?.fields ?? {};

    const resolvedTemplate = (() => {
        if (noteType?.name === 'Image Occlusion') {
            const canonical = DEFAULT_NOTE_TYPES.find(nt => nt.name === 'Image Occlusion');
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

    const retention = reviewedCount > 0
        ? Math.round(((reviewedCount - againCount) / reviewedCount) * 100)
        : null;
    const avgSeconds = reviewedCount > 0 ? Math.round(totalDurationMs / reviewedCount / 1000) : null;
    const progressPct = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0;
    const yieldScore = currentYield?.yieldScore ?? null;
    const isHighYield = currentYield?.yieldLevel === 'high';

    return (
        <div className="study-session" data-testid="study-session">
            {/* Top bar (spec §7.2) */}
            <div className="study-topbar">
                <button className="study-back" onClick={requestExit} data-testid="back-btn" aria-label={t('common.back')}>
                    <ArrowLeft size={16} />
                </button>
                <div className="study-breadcrumb">
                    <span className="study-deck-name">{deck?.name}</span>
                    <span className="study-session-line">
                        {t('study.review_session_of', {
                            defaultValue: 'Review session · {{current}} of {{total}} due',
                            current: currentIndex + 1,
                            total: cards.length,
                        })}
                    </span>
                </div>
                <div className="study-topbar__right">
                    <StudyTimer elapsedSeconds={elapsedSeconds} maxSeconds={maxSeconds} visible={showTimer} />
                    {fsrsEnabled && (
                        <span className="chip chip-neutral">{t('study.fsrs_optimal', { defaultValue: 'FSRS · optimal' })}</span>
                    )}
                    {focusMode === 'intelligence' && (
                        <span className="chip chip-teal" title={t('study.focus_mode_no_limits_tooltip')}>
                            {t('study.focus_mode_chip')}
                        </span>
                    )}
                </div>
            </div>
            <div className="study-progress"><span style={{ width: `${progressPct}%` }} /></div>

            {/* Card + metadata */}
            <div className="study-content">
                <div className="study-card-col">
                    <div className="study-meta-chips">
                        {yieldScore != null && (
                            <span className={isHighYield ? 'chip chip-solid-teal' : 'chip chip-amber'}>
                                {t('study.high_yield', { defaultValue: 'HIGH YIELD' })} · {yieldScore}
                            </span>
                        )}
                        {currentYield?.systemKey && (
                            <span className="chip chip-neutral">
                                {t('study.blueprint', { defaultValue: 'Blueprint' })}: {currentYield.systemKey}
                            </span>
                        )}
                    </div>

                    <div
                        className="study-card-surface"
                        role="button"
                        tabIndex={0}
                        aria-label={isRevealed ? t('study.tap_to_flip') : t('study.show_answer')}
                        onClick={() => { if (!isRevealed) handleReveal(); else handleUnreveal(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { if (!isRevealed) handleReveal(); else handleUnreveal(); } }}
                    >
                        {/* No forced mode — CardViewer honors the user's card-style,
                            flip-animation, and card-size settings (spec §7.2's stacked
                            reveal is the card_style=off default). */}
                        <CardViewer
                            front={frontContent}
                            back={backContent}
                            isRevealed={isRevealed}
                            onReveal={handleReveal}
                            onUnreveal={handleUnreveal}
                            format={currentCard?.note?.format ?? null}
                        />
                    </div>

                </div>
            </div>

            {/* Rating row — always visible, disabled pre-reveal (zero shift, spec §7.2) */}
            <div className="rating-zone">
                {fsrsEnabled ? (
                    <RatingButtons
                        options={schedulingOptions}
                        onRate={handleRate}
                        isLoading={updateCard.isPending}
                        disabled={!isRevealed}
                    />
                ) : (
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={() => handleRate('good')}
                        disabled={!isRevealed}
                        isLoading={updateCard.isPending}
                    >
                        {t('common.next')}
                    </Button>
                )}
            </div>

            {/* Session footer + shortcut hints */}
            <div className="study-footer">
                <div className="study-stats">
                    <span><em>{reviewedCount}</em> {t('study.footer.reviewed', { defaultValue: 'reviewed' })}</span>
                    <span><em>{againCount}</em> {t('study.footer.again', { defaultValue: 'again' })}</span>
                    <span><em>{avgSeconds != null ? `${avgSeconds}s` : '—'}</em> {t('study.footer.avg_time', { defaultValue: 'avg' })}</span>
                    <span><em>{retention != null ? `${retention}%` : '—'}</em> {t('study.footer.retention', { defaultValue: 'retention' })}</span>
                </div>
                <div className="study-shortcuts">
                    <span><span className="kbd">Space</span> {t('study.sc_reveal', { defaultValue: 'reveal' })}</span>
                    <span><span className="kbd">1–4</span> {t('study.sc_rate', { defaultValue: 'rate' })}</span>
                    <span><span className="kbd">U</span> {t('study.sc_undo', { defaultValue: 'undo' })}</span>
                    <span><span className="kbd">Esc</span> {t('study.sc_exit', { defaultValue: 'exit' })}</span>
                </div>
            </div>

            {showExitConfirm && (
                <div className="study-exit-confirm" role="dialog" aria-modal="true">
                    <div className="study-exit-confirm__panel">
                        <p className="study-exit-confirm__title">{t('study.exit_title', { defaultValue: 'Exit session?' })}</p>
                        <p className="study-exit-confirm__body">{t('study.exit_body', { defaultValue: 'Your progress is kept.' })}</p>
                        <div className="study-exit-confirm__actions">
                            <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
                                {t('study.keep_studying', { defaultValue: 'Keep studying' })}
                            </Button>
                            <Button variant="primary" onClick={() => goToDeck(deckId)}>
                                {t('study.exit', { defaultValue: 'Exit' })}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
