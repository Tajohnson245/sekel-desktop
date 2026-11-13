// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import type { CardWithNote } from '../lib/queries';

// ── Mocks: everything around the engine, so the test exercises StudyPlayer's
//    own queue / rating / undo logic against a controllable `cards` prop. ──────

// A rating and its Undo are each one atomic call (card + review row).
const recordReviewMutate = vi.fn(async () => ({ card: {}, review: { id: `review-${recordReviewMutate.mock.calls.length}` } }));
const undoReviewMutate = vi.fn(async () => ({}));
const completeSessionMutate = vi.fn(async (id: string) => ({ id }));

vi.mock('../hooks/useSessions', () => ({
    useRecordReview: () => ({ mutateAsync: recordReviewMutate, isPending: false }),
    useUndoReview: () => ({ mutateAsync: undoReviewMutate, isPending: false }),
    useCompleteSession: () => ({ mutateAsync: completeSessionMutate }),
}));
vi.mock('../hooks/useExamProfile', () => ({ useExamProfile: () => ({ data: undefined }) }));
vi.mock('../hooks/useYield', () => ({ useYieldScores: () => ({ data: undefined }) }));
vi.mock('../stores/authStore', () => ({
    useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'user-1' } }),
}));
vi.mock('../stores/profileStore', () => ({
    useProfileStore: () => ({ profile: { show_timer: false, auto_advance_on_timeout: false, max_answer_seconds: 60 } }),
}));
vi.mock('../stores/uiPrefsStore', () => ({
    useUiPrefsStore: (sel: (s: unknown) => unknown) => sel({ minimalStudyView: true }),
}));
vi.mock('../components/Card/CardViewer', () => ({
    default: ({ front }: { front: string }) => <div data-testid="card-front">{front}</div>,
}));
vi.mock('../components/Study/RatingButtons', () => ({ default: () => null }));
vi.mock('../components/Study/StudyTimer', () => ({ default: () => null }));
const showToast = vi.fn();
vi.mock('../components/UI', () => ({
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
    SessionAnalytics: () => <div data-testid="analytics" />,
    useToast: () => ({ showToast }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));

import StudyPlayer from '../components/Study/StudyPlayer';
import type { StudyPlayerProps } from '../components/Study/StudyPlayer';

function card(id: string): CardWithNote {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    return {
        id, user_id: 'user-1', note_id: `n-${id}`, template_index: 0,
        state: 'review', due: past, stability: 5, difficulty: 5,
        elapsed_days: 3, scheduled_days: 3, reps: 3, lapses: 0, last_review: past,
        created_at: past, updated_at: past,
        note: {
            id: `n-${id}`, deck_id: 'deck-1', fields: { Front: id }, format: null,
            note_type: { name: 'Basic', anki_id: null, card_templates: [{ front_template: '{{Front}}', back_template: '{{Front}}' }] },
        },
    } as unknown as CardWithNote;
}

function props(overrides: Partial<StudyPlayerProps> = {}): StudyPlayerProps {
    return {
        source: { kind: 'deck', deckId: 'deck-1', mode: 'due', systemKeys: [] },
        title: 'Deck',
        cards: [card('A'), card('B'), card('C')],
        isLoading: false,
        isFetching: false,
        refetch: vi.fn(async () => undefined),
        createSession: vi.fn(async () => 'session-1'),
        resolveFsrs: () => true,
        onExit: vi.fn(),
        ...overrides,
    };
}

const front = () => screen.getByTestId('card-front').textContent;
const press = (key: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(document, { key, ...init });

async function rateCurrent(key = '3') {
    const before = recordReviewMutate.mock.calls.length;
    press(' ');
    press(key);
    await waitFor(() => expect(recordReviewMutate.mock.calls.length).toBe(before + 1));
}

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('StudyPlayer queue', () => {
    it('does not skip a card when the query refetches a shorter list after a rating', async () => {
        const p = props();
        const { rerender } = render(<StudyPlayer {...p} />);
        await waitFor(() => expect(front()).toBe('A'));

        await rateCurrent();
        // What the due-cards query returns after A was rated: A is no longer due.
        rerender(<StudyPlayer {...p} cards={[card('B'), card('C')]} />);

        await waitFor(() => expect(front()).toBe('B'));
        await rateCurrent();
        rerender(<StudyPlayer {...p} cards={[card('C')]} />);
        await waitFor(() => expect(front()).toBe('C'));
    });

    it('waits for a background refetch before snapshotting a cached queue', async () => {
        const p = props({ cards: [card('STALE')], isFetching: true });
        const { rerender } = render(<StudyPlayer {...p} />);
        expect(screen.queryByTestId('card-front')).toBeNull();

        rerender(<StudyPlayer {...p} cards={[card('FRESH')]} isFetching={false} />);
        await waitFor(() => expect(front()).toBe('FRESH'));
    });

    it('completes the session after the last card of the frozen queue', async () => {
        const p = props({ cards: [card('A'), card('B')] });
        const { rerender } = render(<StudyPlayer {...p} />);
        await waitFor(() => expect(front()).toBe('A'));
        await rateCurrent();
        rerender(<StudyPlayer {...p} cards={[card('B')]} />);
        await rateCurrent();
        await waitFor(() => expect(completeSessionMutate).toHaveBeenCalledWith('session-1'));
    });
});

describe('StudyPlayer rating', () => {
    it('records one review per card when the rating key is pressed twice or auto-repeats', async () => {
        render(<StudyPlayer {...props()} />);
        await waitFor(() => expect(front()).toBe('A'));
        press(' ');
        await act(async () => {
            press('3');
            press('3');
            press('3', { repeat: true });
        });
        await waitFor(() => expect(recordReviewMutate).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(front()).toBe('B'));
    });

    it('retries session creation on the next rating instead of dropping the review', async () => {
        const createSession = vi.fn()
            .mockRejectedValueOnce(new Error('db busy'))
            .mockResolvedValue('session-2');
        render(<StudyPlayer {...props({ createSession })} />);
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('errors.session_create', 'error'));

        await rateCurrent();
        expect(createSession).toHaveBeenCalledTimes(2);
        expect(recordReviewMutate).toHaveBeenCalledWith(expect.objectContaining({
            cardId: 'A',
            review: expect.objectContaining({ session_id: 'session-2', card_id: 'A' }),
        }));
    });
});

describe('StudyPlayer undo', () => {
    it('reverts the card and deletes the review row it wrote', async () => {
        render(<StudyPlayer {...props()} />);
        await waitFor(() => expect(front()).toBe('A'));
        await rateCurrent('1');
        const reviewId = (await recordReviewMutate.mock.results[0].value as { review: { id: string } }).review.id;
        await waitFor(() => expect(front()).toBe('B'));

        press('u');
        // One call reverts A's original scheduling and deletes the review row it wrote.
        await waitFor(() => expect(undoReviewMutate).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'A', reviewId, userId: 'user-1' })));
        await waitFor(() => expect(front()).toBe('A'));
    });
});
