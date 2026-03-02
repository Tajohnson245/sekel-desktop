/**
 * FSRS (Free Spaced Repetition Scheduler) wrapper
 * Uses ts-fsrs library with default FSRS-5 parameters
 */

import {
    fsrs,
    generatorParameters,
    FSRS,
    Card as FSRSCard,
    Rating as FSRSRating,
    Grade,
    State,
    RecordLog,
} from 'ts-fsrs';
import type { Card, CardState, Rating, CardUpdate } from './types';

// ─────────────────────────────────────────────────────────────────
// FSRS Parameters (using defaults)
// ─────────────────────────────────────────────────────────────────
const params = generatorParameters({
    request_retention: 0.9, // target 90% recall probability
    maximum_interval: 36500, // max 100 years between reviews
    enable_fuzz: true, // add randomness to prevent same-day clusters
});

const scheduler: FSRS = fsrs(params);

// ─────────────────────────────────────────────────────────────────
// Rating conversion (using Grade which excludes Manual)
// ─────────────────────────────────────────────────────────────────
const _RATING_MAP: Record<Rating, Grade> = {
    again: FSRSRating.Again,
    hard: FSRSRating.Hard,
    good: FSRSRating.Good,
    easy: FSRSRating.Easy,
};

// Exported for future use
export { _RATING_MAP as RATING_MAP };

// ─────────────────────────────────────────────────────────────────
// State conversion
// ─────────────────────────────────────────────────────────────────
const STATE_MAP: Record<CardState, State> = {
    new: State.New,
    learning: State.Learning,
    review: State.Review,
    relearning: State.Relearning,
};

const STATE_REVERSE_MAP: Record<State, CardState> = {
    [State.New]: 'new',
    [State.Learning]: 'learning',
    [State.Review]: 'review',
    [State.Relearning]: 'relearning',
};

// ─────────────────────────────────────────────────────────────────
// Convert between app Card and FSRS Card
// ─────────────────────────────────────────────────────────────────
function toFSRSCard(card: Card): FSRSCard {
    return {
        due: new Date(card.due),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: STATE_MAP[card.state],
        last_review: card.last_review ? new Date(card.last_review) : undefined,
        learning_steps: 0, // managed by FSRS internally
    };
}

function fromFSRSCard(fsrsCard: FSRSCard): CardUpdate {
    return {
        due: fsrsCard.due.toISOString(),
        stability: fsrsCard.stability,
        difficulty: fsrsCard.difficulty,
        elapsed_days: fsrsCard.elapsed_days,
        scheduled_days: fsrsCard.scheduled_days,
        reps: fsrsCard.reps,
        lapses: fsrsCard.lapses,
        state: STATE_REVERSE_MAP[fsrsCard.state],
        last_review: fsrsCard.last_review?.toISOString() ?? null,
    };
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * Get all possible scheduling outcomes for a card
 * Returns updates for each rating option (again, hard, good, easy)
 */
export function getSchedulingOptions(card: Card): Record<Rating, CardUpdate> {
    const fsrsCard = toFSRSCard(card);
    const now = new Date();
    const log: RecordLog = scheduler.repeat(fsrsCard, now);

    return {
        again: fromFSRSCard(log[FSRSRating.Again].card),
        hard: fromFSRSCard(log[FSRSRating.Hard].card),
        good: fromFSRSCard(log[FSRSRating.Good].card),
        easy: fromFSRSCard(log[FSRSRating.Easy].card),
    };
}

/**
 * Schedule a card based on user rating
 * Returns the updated card fields to persist
 */
export function scheduleCard(card: Card, rating: Rating): CardUpdate {
    const options = getSchedulingOptions(card);
    return options[rating];
}

/**
 * Get the current retrievability (memory retention) of a card
 * Returns a value between 0 and 1 (0% to 100% recall probability)
 */
export function getRetrievability(card: Card): number {
    if (card.state === 'new') {
        return 0;
    }

    const fsrsCard = toFSRSCard(card);
    return scheduler.get_retrievability(fsrsCard, new Date(), false);
}

/**
 * Create a new card with initial FSRS state
 */
export function createInitialCardState(): Pick<Card, 'state' | 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'reps' | 'lapses' | 'last_review'> {
    return {
        state: 'new',
        due: new Date().toISOString(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        last_review: null,
    };
}

/**
 * Get human-readable interval for next review
 */
export function formatInterval(days: number): string {
    if (days < 1) {
        const minutes = Math.round(days * 24 * 60);
        if (minutes < 60) {
            return `${minutes}m`;
        }
        return `${Math.round(minutes / 60)}h`;
    }
    if (days < 30) {
        return `${Math.round(days)}d`;
    }
    if (days < 365) {
        return `${Math.round(days / 30)}mo`;
    }
    return `${(days / 365).toFixed(1)}y`;
}

// Re-export types for convenience
export type { Rating, CardState } from './types';
