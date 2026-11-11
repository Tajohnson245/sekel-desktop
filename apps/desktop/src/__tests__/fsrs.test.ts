import { describe, it, expect, vi } from 'vitest';
import {
    scheduleCard,
    getSchedulingOptions,
    getRetrievability,
    createInitialCardState,
    formatInterval,
} from '../lib/fsrs';
import type { Card } from '../lib/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNewCard(overrides: Partial<Card> = {}): Card {
    return {
        id: 'card-1',
        user_id: 'user-1',
        anki_id: null,
        ease_factor: null,
        note_id: 'note-1',
        template_index: 0,
        state: 'new',
        due: new Date().toISOString(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        last_review: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

function makeReviewCard(overrides: Partial<Card> = {}): Card {
    return makeNewCard({
        state: 'review',
        stability: 10,
        difficulty: 5,
        elapsed_days: 5,
        scheduled_days: 10,
        reps: 3,
        lapses: 0,
        last_review: new Date(Date.now() - 5 * 86400000).toISOString(),
        due: new Date(Date.now() - 86400000).toISOString(), // 1 day overdue
        ...overrides,
    });
}

// ── Learning-step progression (SEKEL-153) ───────────────────────────────────────

describe('learning steps round-trip', () => {
    /** Rate Good, persisting only what CardUpdate carries — exactly what the DB stores. */
    function rateGoodAndReload(card: Card): Card {
        const update = getSchedulingOptions(card).good;
        return { ...card, ...update } as Card;
    }

    it('a new card rated Good repeatedly graduates to review instead of looping on the 10-minute step', () => {
        let card = makeNewCard();
        const states: string[] = [];
        for (let i = 0; i < 4 && card.state !== 'review'; i++) {
            card = rateGoodAndReload(card);
            states.push(card.state);
        }
        expect(states).toEqual(['learning', 'review']);
        expect(card.scheduled_days).toBeGreaterThanOrEqual(1);
    });

    it('labels learning-step intervals from the due time, not scheduled_days (was "0m")', async () => {
        const { intervalDays } = await import('../components/Study/RatingButtons');
        const now = Date.now();
        const opts = getSchedulingOptions(makeNewCard());
        expect(opts.good.scheduled_days).toBe(0);
        expect(formatInterval(intervalDays(opts.good, now))).toBe('10m');
        expect(formatInterval(intervalDays(opts.again, now))).toBe('1m');
        expect(intervalDays({ scheduled_days: 3 })).toBe(3);
    });

    it('carries the step index in the CardUpdate so it can be stored', () => {
        const update = getSchedulingOptions(makeNewCard()).good;
        expect(update.state).toBe('learning');
        expect(update.learning_steps).toBe(1);
    });

    it('cards loaded without a stored step (pre-migration rows) still progress', () => {
        let card = makeNewCard({ state: 'learning', reps: 1, last_review: new Date(Date.now() - 600_000).toISOString() });
        delete (card as Partial<Card>).learning_steps;
        card = rateGoodAndReload(card);  // step 0 → step 1
        card = rateGoodAndReload(card);  // step 1 → graduate
        expect(card.state).toBe('review');
    });
});

// ── createInitialCardState ─────────────────────────────────────────────────────

describe('createInitialCardState', () => {
    it('returns state: new', () => {
        expect(createInitialCardState().state).toBe('new');
    });

    it('returns zeroed FSRS fields', () => {
        const state = createInitialCardState();
        expect(state.stability).toBe(0);
        expect(state.difficulty).toBe(0);
        expect(state.elapsed_days).toBe(0);
        expect(state.scheduled_days).toBe(0);
        expect(state.reps).toBe(0);
        expect(state.lapses).toBe(0);
    });

    it('returns null last_review', () => {
        expect(createInitialCardState().last_review).toBeNull();
    });

    it('returns a valid ISO date string for due', () => {
        const { due } = createInitialCardState();
        expect(() => new Date(due)).not.toThrow();
        expect(new Date(due).getTime()).toBeGreaterThan(0);
    });
});

// ── formatInterval ─────────────────────────────────────────────────────────────

describe('formatInterval', () => {
    it('formats < 1 hour as minutes', () => {
        expect(formatInterval(0)).toBe('0m');
        expect(formatInterval(1 / 24 / 60 * 10)).toBe('10m'); // 10 minutes
    });

    it('formats hours when >= 60 minutes but < 1 day', () => {
        expect(formatInterval(1 / 24 * 2)).toBe('2h'); // 2 hours
    });

    it('formats days for 1–29 days', () => {
        expect(formatInterval(1)).toBe('1d');
        expect(formatInterval(7)).toBe('7d');
        expect(formatInterval(29)).toBe('29d');
    });

    it('formats months for 30–364 days', () => {
        expect(formatInterval(30)).toBe('1mo');
        expect(formatInterval(60)).toBe('2mo');
        expect(formatInterval(180)).toBe('6mo');
    });

    it('formats years for >= 365 days', () => {
        expect(formatInterval(365)).toBe('1.0y');
        expect(formatInterval(730)).toBe('2.0y');
    });
});

// ── getRetrievability ──────────────────────────────────────────────────────────

describe('getRetrievability', () => {
    it('returns 0 for a new card', () => {
        const card = makeNewCard();
        expect(getRetrievability(card)).toBe(0);
    });

    it('returns a value between 0 and 1 for a review card', () => {
        const card = makeReviewCard();
        const r = getRetrievability(card);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(1);
    });

    it('returns higher retrievability for a card reviewed recently', () => {
        const recent = makeReviewCard({ last_review: new Date().toISOString(), elapsed_days: 0 });
        const old = makeReviewCard({ last_review: new Date(Date.now() - 30 * 86400000).toISOString(), elapsed_days: 30 });
        expect(getRetrievability(recent)).toBeGreaterThan(getRetrievability(old));
    });
});

// ── getSchedulingOptions ───────────────────────────────────────────────────────

describe('getSchedulingOptions', () => {
    it('returns options for all four ratings', () => {
        const card = makeNewCard();
        const options = getSchedulingOptions(card);
        expect(options).toHaveProperty('again');
        expect(options).toHaveProperty('hard');
        expect(options).toHaveProperty('good');
        expect(options).toHaveProperty('easy');
    });

    it('again rating results in more lapses for a review card', () => {
        const card = makeReviewCard();
        const options = getSchedulingOptions(card);
        expect(options.again.lapses).toBeGreaterThan(card.lapses);
    });

    it('easy has a longer interval than good', () => {
        const card = makeNewCard();
        const options = getSchedulingOptions(card);
        expect((options.easy.scheduled_days ?? 0)).toBeGreaterThanOrEqual(options.good.scheduled_days ?? 0);
    });

    it('each option returns a valid ISO due date', () => {
        const card = makeNewCard();
        const options = getSchedulingOptions(card);
        for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
            expect(options[rating].due).toBeTruthy();
            expect(() => new Date(options[rating].due!)).not.toThrow();
        }
    });

    it('each option returns a valid card state', () => {
        const card = makeNewCard();
        const options = getSchedulingOptions(card);
        const validStates = ['new', 'learning', 'review', 'relearning'];
        for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
            expect(validStates).toContain(options[rating].state);
        }
    });
});

// ── scheduleCard ───────────────────────────────────────────────────────────────

describe('scheduleCard', () => {
    it('returns the same result as getSchedulingOptions for the given rating', () => {
        vi.useFakeTimers();
        try {
            const card = makeNewCard();
            const options = getSchedulingOptions(card);
            expect(scheduleCard(card, 'good')).toEqual(options.good);
        } finally {
            vi.useRealTimers();
        }
    });

    it('incrementing reps on good/easy rating from a new card', () => {
        const card = makeNewCard();
        const result = scheduleCard(card, 'good');
        expect(result.reps).toBeGreaterThan(0);
    });

    it('again rating on a review card moves state to relearning', () => {
        const card = makeReviewCard();
        const result = scheduleCard(card, 'again');
        expect(result.state).toBe('relearning');
    });

    it('easy rating on a new card schedules further out than good', () => {
        const card = makeNewCard();
        const easy = scheduleCard(card, 'easy');
        const good = scheduleCard(card, 'good');
        expect(easy.scheduled_days ?? 0).toBeGreaterThanOrEqual(good.scheduled_days ?? 0);
    });
});
