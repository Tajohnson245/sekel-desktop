// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// The shared package's source isn't JSX-transformed for vitest; a plain button is enough here.
vi.mock('@sekel/components', () => ({
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>{children}</button>
    ),
}));

import {
    CardShuffleStack,
    GenerationScreen,
    GenerationStatus,
    InlineGenerationProgress,
    SHUFFLE_CYCLE_MS,
    shuffleSyncOffset,
    stageLabelKey,
} from '../components/AIStudy/GenerationProgress';

afterEach(cleanup);

describe('stageLabelKey', () => {
    it('defaults to "generating" before the first progress event', () => {
        expect(stageLabelKey(null)).toBe('ai.progress_generating');
    });

    it.each([
        ['chunking', 'ai.progress_chunking'],
        ['generating', 'ai.progress_generating'],
        ['refining', 'ai.progress_refining'],
        ['done', 'ai.progress_done'],
    ] as const)('maps the %s phase to its label', (phase, key) => {
        expect(stageLabelKey({ phase, current: 1, total: 4 })).toBe(key);
    });
});

describe('shuffleSyncOffset', () => {
    it('pins every stack to the same point in the cycle, whenever it mounts', () => {
        expect(shuffleSyncOffset(0)).toBe('0ms');
        expect(shuffleSyncOffset(1500)).toBe('-1500ms');
        expect(shuffleSyncOffset(SHUFFLE_CYCLE_MS + 1500)).toBe('-1500ms');
        expect(shuffleSyncOffset(SHUFFLE_CYCLE_MS * 3)).toBe('0ms');
    });

    it('is applied to the stack as --cs-sync', () => {
        const { container } = render(<CardShuffleStack size="large" />);
        const root = container.querySelector<HTMLElement>('.card-shuffle');
        expect(root?.style.getPropertyValue('--cs-sync')).toMatch(/^-?\d+(\.\d+)?ms$/);
    });
});

describe('CardShuffleStack', () => {
    it('renders three decorative cards, each with a loading bar', () => {
        const { container } = render(<CardShuffleStack size="large" />);
        const root = container.querySelector('.card-shuffle');
        expect(root?.classList.contains('card-shuffle--large')).toBe(true);
        expect(root?.getAttribute('aria-hidden')).toBe('true');
        const cards = container.querySelectorAll('.card-shuffle__card');
        expect(cards).toHaveLength(3);
        cards.forEach((card) => expect(card.querySelector('.card-shuffle__fill')).not.toBeNull());
    });
});

describe('GenerationStatus', () => {
    it('announces the stage as text', () => {
        render(<GenerationStatus label="Refining cards…" />);
        expect(screen.getByRole('status').textContent).toBe('Refining cards…');
    });
});

describe('GenerationScreen', () => {
    it('shows the title, subtitle, stage text and the large stack, with no progress bar', () => {
        const { container } = render(<GenerationScreen status="Analyzing your document…" />);
        expect(screen.getByText('ai.auto_generating_title')).toBeTruthy();
        expect(screen.getByText('ai.auto_generating_subtitle')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('Analyzing your document…');
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(container.querySelectorAll('.card-shuffle--large .card-shuffle__card')).toHaveLength(3);
        expect(screen.queryByText('ai.cancel_pipeline')).toBeNull();
    });

    it('shows the note and a working Cancel button when given', () => {
        const onCancel = vi.fn();
        render(<GenerationScreen status="x" note="Skipped 1 file" onCancel={onCancel} />);
        expect(screen.getByText('Skipped 1 file')).toBeTruthy();
        fireEvent.click(screen.getByText('ai.cancel_pipeline'));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

describe('InlineGenerationProgress', () => {
    it('shows the compact stack and the stage text, with no progress bar', () => {
        const { container, rerender } = render(<InlineGenerationProgress progress={null} />);
        expect(screen.getByRole('status').textContent).toBe('ai.progress_generating');
        for (const phase of ['chunking', 'generating', 'refining', 'done'] as const) {
            rerender(<InlineGenerationProgress progress={{ phase, current: 1, total: 2 }} />);
            expect(screen.getByRole('status').textContent).toBe(`ai.progress_${phase}`);
            expect(container.querySelectorAll('.card-shuffle--compact .card-shuffle__card')).toHaveLength(3);
        }
        expect(screen.queryByRole('progressbar')).toBeNull();
    });
});
