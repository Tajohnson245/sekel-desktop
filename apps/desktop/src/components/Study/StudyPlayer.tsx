import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpdateCard } from '../../hooks/useDecks';
import { useCompleteSession, useDeleteReview, useInsertReview } from '../../hooks/useSessions';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useYieldScores } from '../../hooks/useYield';
import { getSchedulingOptions } from '../../lib/fsrs';
import { isExamDateSet } from '../../lib/queries';
import type { YieldScoreRow } from '../../lib/queries';
import { useProfileStore } from '../../stores/profileStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiPrefsStore } from '../../stores/uiPrefsStore';
import CardViewer from '../Card/CardViewer';
import RatingButtons from './RatingButtons';
import StudyTimer from './StudyTimer';
import { sourceKey, isFocusedSource, type StudySource, type ResolveFsrs } from './studySource';

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
    /** The review row written for this rating, deleted again on Undo. */
    reviewId: string | null;
}

export interface StudyPlayerProps {
    /** Describes how the queue was assembled — drives reset key + focus chip. */
    source: StudySource;
    /** Heading shown in the top bar and post-session analytics (deck name or a cross-deck label). */
    title: string;
    /**
     * The live card queue from the wrapper's query. The player snapshots it
     * once per session (see `queue` below) and ignores later refetches.
     */
    cards: CardWithNote[];
    isLoading: boolean;
    /** True while the queue query is (re)fetching — the snapshot waits for fresh data. */
    isFetching: boolean;
    /** Re-fetch the queue (used by "Study again"); resolves once fresh data is in. */
    refetch: () => Promise<unknown>;
    /** Open a session row for this source; resolves to its id. */
    createSession: () => Promise<string>;
    /** Whether the current card's deck uses FSRS (per-card so cross-deck sessions can mix algorithms). */
    resolveFsrs: ResolveFsrs;
    /** Leave the player (deck → deck detail; cross-deck → study hub / dashboard). */
    onExit: () => void;
}

/**
 * The study session engine. Extracted from the old single-deck StudySession so
 * that both the per-deck wrapper and the cross-deck wrapper (SEKEL-137) share
 * one presentational + review-recording implementation. Everything source-
 * specific (which cards, which session row, per-card algorithm, where "back"
 * goes) is injected; the engine itself is queue-agnostic.
 */
export default function StudyPlayer({
    source, title, cards: liveCards, isLoading, isFetching, refetch, createSession, resolveFsrs, onExit,
}: StudyPlayerProps) {
    const key = sourceKey(source);
    const showFocusChip = isFocusedSource(source);
    const userId = useAuthStore((s) => s.user?.id ?? '');
    const { data: examProfile } = useExamProfile();
    const examKey = examProfile?.exam_key;

    const updateCard = useUpdateCard();
    const completeSession = useCompleteSession();
    const insertReview = useInsertReview();
    const deleteReview = useDeleteReview();

    // ── Frozen queue ────────────────────────────────────────────────
    // The queue is captured once per session from fresh query data and never
    // replaced mid-session. Rating a card changes what the due-cards query
    // returns (the card is no longer due), and swapping that shorter list in
    // under `currentIndex` used to skip the next card.
    const [queue, setQueue] = useState<CardWithNote[] | null>(null);
    const [awaitingFresh, setAwaitingFresh] = useState(false);
    const cards = useMemo(() => queue ?? [], [queue]);
    const { t } = useTranslation();
    const { showToast } = useToast();
    const minimalStudyView = useUiPrefsStore((s) => s.minimalStudyView);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [schedulingOptions, setSchedulingOptions] = useState<Record<Rating, CardUpdate> | null>(null);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [againCount, setAgainCount] = useState(0);
    const [totalDurationMs, setTotalDurationMs] = useState(0);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const lastRatedRef = useRef<RateSnapshot | null>(null);
    // One in-flight/settled createSession() per session, shared by the start-up
    // effect and handleRate (createSession is a fresh closure each render, so we
    // can't lean on its identity). Cleared on failure so the next rating retries.
    const sessionPromiseRef = useRef<Promise<string> | null>(null);
    const createSessionRef = useRef(createSession);
    createSessionRef.current = createSession;
    // Set while a rating is being saved: blocks key auto-repeat / double presses
    // from writing two reviews for one card and skipping the next card.
    const ratingInFlightRef = useRef(false);

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
    const isQueueLoading = queue === null;
    const isEmpty = queue !== null && queue.length === 0;
    const fsrsEnabled = currentCard ? resolveFsrs(currentCard) : false;

    // ── Yield data overlay ──────────────────────────────────────────
    const cardIds = useMemo(() => cards.map(c => c.id), [cards]);
    const { data: yieldScores } = useYieldScores(examKey, cardIds.length > 0 ? cardIds : undefined);
    const yieldMap = useMemo(() => {
        if (!yieldScores) return new Map<string, YieldScoreRow>();
        return new Map(yieldScores.map(s => [s.cardId, s]));
    }, [yieldScores]);
    const currentYield = currentCard ? yieldMap.get(currentCard.id) : undefined;

    useEffect(() => {
        setQueue(null);
        setAwaitingFresh(false);
        setCurrentIndex(0);
        setReviewedCount(0);
        setAgainCount(0);
        setTotalDurationMs(0);
        setSessionId(null);
        sessionPromiseRef.current = null;
        lastRatedRef.current = null;
    }, [key]);

    // Snapshot the queue once the query has settled on fresh data. Waiting for
    // !isFetching matters: a cached list from an earlier session is stale (every
    // rating marks it so) and would still contain cards already reviewed.
    useEffect(() => {
        if (queue !== null || isLoading || isFetching || awaitingFresh) return;
        setQueue(liveCards);
    }, [queue, isLoading, isFetching, awaitingFresh, liveCards]);

    const ensureSession = useCallback((): Promise<string> => {
        if (!sessionPromiseRef.current) {
            const pending = createSessionRef.current().then((id) => {
                // Ignore a late result from a session that has since been reset.
                if (sessionPromiseRef.current === pending) setSessionId(id);
                return id;
            });
            pending.catch(() => {
                if (sessionPromiseRef.current === pending) sessionPromiseRef.current = null;
            });
            sessionPromiseRef.current = pending;
        }
        return sessionPromiseRef.current;
    }, []);

    useEffect(() => {
        if (queue && queue.length > 0 && userId) {
            ensureSession().catch(() => showToast(t('errors.session_create'), 'error'));
        }
    }, [queue, userId]);

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
        if (!currentCard || !schedulingOptions || !userId) return;
        if (ratingInFlightRef.current) return;
        ratingInFlightRef.current = true;
        try {
            // Every rating must land in a session so it counts toward stats, plan
            // progress and the new-card cap. If the session row failed to create
            // earlier, retry now rather than silently dropping reviews.
            let activeSessionId: string;
            try {
                activeSessionId = await ensureSession();
            } catch {
                showToast(t('errors.session_create'), 'error');
                return;
            }

            const updates = schedulingOptions[rating];
            const isLastCard = currentIndex + 1 >= cards.length;
            const durationMs = Math.min(Date.now() - cardStartTimeRef.current, maxSeconds * 1000);

            await updateCard.mutateAsync({ cardId: currentCard.id, updates });

            const review = await insertReview.mutateAsync({
                user_id: userId,
                card_id: currentCard.id,
                rating,
                session_id: activeSessionId,
                // Per-card deck attribution — correct for cross-deck sessions where
                // the session row only holds a representative deck.
                deck_id: currentCard.note.deck_id,
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

            // Snapshot for single-level Undo (spec §8, key U).
            lastRatedRef.current = { card: currentCard, index: currentIndex, rating, durationMs, reviewId: review?.id ?? null };

            // Cheap, fire-and-forget: lets the main process count reviews and
            // fire a cloud snapshot once the 25-review threshold is crossed.
            void window.electronAPI?.cloudBackup?.requestCheck()?.catch(() => { /* best effort */ });

            if (isLastCard) {
                await completeSession.mutateAsync(activeSessionId);
                window.electronAPI?.notify.streak(userId);
            }

            setReviewedCount((prev) => prev + 1);
            if (rating === 'again') setAgainCount((prev) => prev + 1);
            setTotalDurationMs((prev) => prev + durationMs);
            setIsRevealed(false);
            setCurrentIndex((prev) => prev + 1);
        } catch {
            showToast(t('errors.generic', { defaultValue: 'Something went wrong — please try again' }), 'error');
        } finally {
            ratingInFlightRef.current = false;
        }
    }, [currentCard, schedulingOptions, currentIndex, cards.length, maxSeconds, userId, reviewedCount, ensureSession, showToast, t]);

    // Undo last rating (spec §8). Restores the previous card's pre-review FSRS
    // state from the local snapshot (scheduling writes absolute values, so this
    // is a clean revert) and steps the view back, revealed, for re-rating.
    const handleUndo = useCallback(async () => {
        const snap = lastRatedRef.current;
        if (!snap || updateCard.isPending || ratingInFlightRef.current) return;
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
            learning_steps: c.learning_steps ?? 0,
        };
        await updateCard.mutateAsync({ cardId: c.id, updates: revert });
        // Remove the review row too, so an undone rating doesn't linger in
        // retention, lapse and plan-progress stats (re-rating writes a new one).
        if (snap.reviewId && userId) {
            await deleteReview.mutateAsync({ reviewId: snap.reviewId, userId }).catch(() => { /* card already reverted */ });
        }
        setReviewedCount((p) => Math.max(0, p - 1));
        if (snap.rating === 'again') setAgainCount((p) => Math.max(0, p - 1));
        setTotalDurationMs((p) => Math.max(0, p - snap.durationMs));
        setCurrentIndex(snap.index);
        setIsRevealed(true);
        lastRatedRef.current = null;
        showToast(t('study.undo_done', { defaultValue: 'Undid last rating' }), 'success');
    }, [cards, updateCard, deleteReview, userId, showToast, t]);

    const requestExit = useCallback(() => {
        if (reviewedCount > 0 || isRevealed) setShowExitConfirm(true);
        else onExit();
    }, [reviewedCount, isRevealed, onExit]);

    // ── Consolidated study keyboard map (spec §8) ────────────────────
    useEffect(() => {
        // Once the session is over (analytics screen) the study keys are inert —
        // e.g. U must not pull the user back into a completed session.
        if (isComplete) return;
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
                    // A held key auto-repeats; never let one press rate twice.
                    if (e.repeat || ratingInFlightRef.current) return;
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
    }, [isComplete, isRevealed, fsrsEnabled, schedulingOptions, handleReveal, handleUnreveal, handleRate, handleUndo, requestExit, showToast, t]);

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
        sessionPromiseRef.current = null;
        // Drop the finished queue and take a fresh snapshot once the refetch lands.
        setQueue(null);
        setAwaitingFresh(true);
        void refetch().finally(() => setAwaitingFresh(false));
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

    if (isQueueLoading) {
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
                    <Button variant="ghost" onClick={onExit} icon={<ArrowLeft size={16} />}>
                        {t('common.back')}
                    </Button>
                </div>
                <div className="empty-v2" data-testid="no-cards-due">
                    <CheckCircle2 size={34} style={{ color: 'var(--teal)' }} />
                    <p className="empty-v2__line">{t('study.session_complete')}</p>
                    <Button variant="primary" onClick={onExit}>{t('study.back_to_decks')}</Button>
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
                deckName={title}
                onBack={onExit}
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
                        <Button variant="ghost" onClick={onExit}>{t('study.back_to_decks')}</Button>
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
                    <span className="study-deck-name">{title}</span>
                    <span className="study-session-line">
                        {t('study.review_session_of', {
                            defaultValue: 'Review session · {{current}} of {{total}} due',
                            current: currentIndex + 1,
                            total: cards.length,
                        })}
                    </span>
                </div>
                {!minimalStudyView && (
                    <div className="study-topbar__right">
                        <StudyTimer elapsedSeconds={elapsedSeconds} maxSeconds={maxSeconds} visible={showTimer} />
                        {fsrsEnabled && (
                            <span className="chip chip-neutral">{t('study.fsrs_optimal', { defaultValue: 'FSRS · optimal' })}</span>
                        )}
                        {showFocusChip && (
                            <span className="chip chip-teal" title={t('study.focus_mode_no_limits_tooltip')}>
                                {t('study.focus_mode_chip')}
                            </span>
                        )}
                    </div>
                )}
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

            {/* Session footer + shortcut hints (hidden in minimal study view) */}
            {!minimalStudyView && (
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
            )}

            {showExitConfirm && (
                <div className="study-exit-confirm" role="dialog" aria-modal="true">
                    <div className="study-exit-confirm__panel">
                        <p className="study-exit-confirm__title">{t('study.exit_title', { defaultValue: 'Exit session?' })}</p>
                        <p className="study-exit-confirm__body">{t('study.exit_body', { defaultValue: 'Your progress is kept.' })}</p>
                        <div className="study-exit-confirm__actions">
                            <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
                                {t('study.keep_studying', { defaultValue: 'Keep studying' })}
                            </Button>
                            <Button variant="primary" onClick={onExit}>
                                {t('study.exit', { defaultValue: 'Exit' })}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
