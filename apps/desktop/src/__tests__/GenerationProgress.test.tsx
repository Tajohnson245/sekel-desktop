// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import {
    CardShuffleStack,
    GenerationProgressBar,
    InlineGenerationProgress,
    progressPercent,
} from '../components/AIStudy/GenerationProgress';

afterEach(cleanup);

describe('progressPercent', () => {
    it('is null before any progress event', () => {
        expect(progressPercent(null)).toBeNull();
    });

    it('rounds and clamps to 0–100', () => {
        expect(progressPercent({ phase: 'generating', current: 3, total: 8 })).toBe(38);
        expect(progressPercent({ phase: 'generating', current: 0, total: 0 })).toBe(0);
        expect(progressPercent({ phase: 'refining', current: 12, total: 10 })).toBe(100);
        expect(progressPercent({ phase: 'refining', current: -1, total: 10 })).toBe(0);
    });
});

describe('GenerationProgressBar', () => {
    it('shows the generic label and an indeterminate bar before the first event', () => {
        const { container } = render(<GenerationProgressBar progress={null} />);
        expect(screen.getByText('ai.progress_working')).toBeTruthy();
        const bar = screen.getByRole('progressbar');
        expect(bar.getAttribute('aria-valuenow')).toBeNull();
        expect(container.querySelector('.ai-progress__fill--indeterminate')).not.toBeNull();
    });

    it.each([
        ['chunking', 'ai.progress_chunking'],
        ['generating', 'ai.progress_generating'],
        ['refining', 'ai.progress_refining'],
        ['done', 'ai.progress_done'],
    ] as const)('labels the %s phase with a translated string', (phase, key) => {
        render(<GenerationProgressBar progress={{ phase, current: 1, total: 4 }} />);
        expect(screen.getByText(key)).toBeTruthy();
    });

    it('shows real progress as a determinate bar', () => {
        const { container } = render(
            <GenerationProgressBar progress={{ phase: 'refining', current: 5, total: 10 }} />,
        );
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
        const fill = container.querySelector<HTMLElement>('.ai-progress__fill');
        expect(fill?.style.width).toBe('50%');
        expect(fill?.classList.contains('ai-progress__fill--indeterminate')).toBe(false);
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

    it('keeps animating no matter which phase is reported', () => {
        const { container, rerender } = render(<InlineGenerationProgress progress={null} />);
        for (const phase of ['chunking', 'generating', 'refining', 'done'] as const) {
            rerender(<InlineGenerationProgress progress={{ phase, current: 1, total: 2 }} />);
            expect(container.querySelectorAll('.card-shuffle--compact .card-shuffle__card')).toHaveLength(3);
        }
    });
});
