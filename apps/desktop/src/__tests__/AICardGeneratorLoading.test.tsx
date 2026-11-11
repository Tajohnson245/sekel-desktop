// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../hooks/useAI', () => ({
    useGenerateCards: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('../hooks/useDrafts', () => ({
    useSaveDraft: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useDrafts: () => ({ data: [] }),
    DRAFT_LIMIT: 10,
}));
vi.mock('../hooks/useNotes', () => ({
    useCreateNote: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useNoteTypes: () => ({ data: [] }),
    useCreateNoteType: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../hooks/useDecks', () => ({ useDecks: () => ({ data: [] }) }));
vi.mock('../hooks/useExamProfile', () => ({ useExamProfile: () => ({ data: null }) }));
vi.mock('../components/Deck/DeckEditor', () => ({ default: () => null }));
const { StubButton } = vi.hoisted(() => ({
    StubButton: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>{children}</button>
    ),
}));
// The shared package's source isn't JSX-transformed for vitest.
vi.mock('@sekel/components', () => ({ Button: StubButton }));
vi.mock('../components/UI', () => ({
    Button: StubButton,
    Input: () => null,
    Select: () => null,
    ImageUpload: () => null,
    useToast: () => ({ showToast: vi.fn() }),
}));

import AICardGenerator from '../components/AIStudy/AICardGenerator';

const baseProps = {
    extractedText: 'Some document text',
    contextSummary: 'Summary',
    userId: 'user-1',
    onComplete: () => {},
};

let resolveGeneration: (value: { cards: unknown[]; stats: null }) => void;
const notifyShow = vi.fn();

beforeEach(() => {
    notifyShow.mockClear();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
        generateCardsFromContext: vi.fn(() => new Promise((resolve) => { resolveGeneration = resolve; })),
        onAIProgress: () => () => {},
        notify: { show: notifyShow },
    };
});
afterEach(cleanup);

describe('AICardGenerator first frame', () => {
    // Server rendering runs no effects, so this is exactly the first frame the
    // user sees before the autoStart effect fires.
    it('is the loading screen when generation auto-starts (no flash of the settings view)', () => {
        const html = renderToStaticMarkup(<AICardGenerator {...baseProps} autoStart />);
        expect(html).toContain('ai.auto_generating_title');
        expect(html).toContain('card-shuffle--large');
        expect(html).not.toContain('ai.show_settings');
        expect(html).not.toContain('ai.hide_settings');
    });

    it('is the settings view when not auto-starting', () => {
        const html = renderToStaticMarkup(<AICardGenerator {...baseProps} />);
        expect(html).toContain('ai.hide_settings');
        expect(html).not.toContain('ai.auto_generating_title');
    });

    it('is the settings view when auto-start has nothing to generate from', () => {
        const html = renderToStaticMarkup(<AICardGenerator {...baseProps} extractedText="" autoStart />);
        expect(html).not.toContain('ai.auto_generating_title');
    });
});

describe('AICardGenerator cancel', () => {
    it('calls onCancel and discards the in-flight result', async () => {
        const onCancel = vi.fn();
        render(<AICardGenerator {...baseProps} autoStart onCancel={onCancel} loadingNote="Skipped 1 file" />);
        expect(screen.getByText('Skipped 1 file')).toBeTruthy();

        fireEvent.click(screen.getByText('ai.cancel_pipeline'));
        expect(onCancel).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveGeneration({ cards: [{ front: 'Q', back: 'A' }], stats: null });
        });
        expect(notifyShow).not.toHaveBeenCalled();
    });

    it('still notifies when the run is not cancelled', async () => {
        render(<AICardGenerator {...baseProps} autoStart onCancel={() => {}} />);
        await act(async () => {
            resolveGeneration({ cards: [{ front: 'Q', back: 'A' }], stats: null });
        });
        expect(notifyShow).toHaveBeenCalledTimes(1);
    });
});
