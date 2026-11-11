import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@sekel/components';
import type { AIProgress } from '../../types/electron';
import './GenerationProgress.css';

// ── Card shuffle ────────────────────────────────────────────────────────────
// A stack of three cards. The front card's loading bar fills, the card lifts
// off and tucks in at the back, the next card comes forward and its bar fills.
// Purely decorative: it loops at a fixed pace through every pipeline stage and
// never reflects real progress. All motion is CSS (GenerationProgress.css), so
// it costs no re-renders.

export type CardShuffleSize = 'large' | 'compact';

/** Must match --cs-cycle in GenerationProgress.css. */
export const SHUFFLE_CYCLE_MS = 6000;

/**
 * Negative animation offset that pins the loop to a shared clock. A stack
 * mounted later (analysis screen → generation screen) picks up exactly where
 * the previous one was, so the handoff never restarts the animation.
 */
export function shuffleSyncOffset(now: number): string {
    return `${-(now % SHUFFLE_CYCLE_MS)}ms`;
}

export function CardShuffleStack({ size = 'large' }: { size?: CardShuffleSize }) {
    const [offset] = useState(() => shuffleSyncOffset(performance.now()));
    return (
        <div
            className={`card-shuffle card-shuffle--${size}`}
            style={{ '--cs-sync': offset } as CSSProperties}
            aria-hidden="true"
        >
            <div className="card-shuffle__deck">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="card-shuffle__card">
                        <span className="card-shuffle__line" />
                        <span className="card-shuffle__line card-shuffle__line--short" />
                        <span className="card-shuffle__line card-shuffle__line--answer" />
                        <span className="card-shuffle__bar">
                            <span className="card-shuffle__fill" />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Stage text ──────────────────────────────────────────────────────────────
// Shown instead of a progress bar. Before the first `ai-progress` event (and on
// the non-streaming path, which sends none) the stage is "Generating cards…".

const PHASE_LABEL_KEYS: Record<AIProgress['phase'], string> = {
    chunking: 'ai.progress_chunking',
    generating: 'ai.progress_generating',
    refining: 'ai.progress_refining',
    done: 'ai.progress_done',
};

export function stageLabelKey(progress: AIProgress | null): string {
    return progress ? PHASE_LABEL_KEYS[progress.phase] : PHASE_LABEL_KEYS.generating;
}

export function GenerationStatus({ label, size = 'large' }: { label: string; size?: CardShuffleSize }) {
    return (
        <p className={`gen-status gen-status--${size}`} role="status" aria-live="polite">
            <span className="gen-status__dot" aria-hidden="true" />
            {/* keyed so each new stage fades in */}
            <span key={label} className="gen-status__text">{label}</span>
        </p>
    );
}

// ── Full loading screen ─────────────────────────────────────────────────────
// No container box: text on the left, the large stack on the right. Used for
// both the document analysis step (DocumentsPage) and the first generation
// pass (AICardGenerator), so the two read as one continuous screen.

interface GenerationScreenProps {
    /** Current stage, already translated. */
    status: string;
    /** Optional extra line under the stage, e.g. files that failed to parse. */
    note?: string;
    onCancel?: () => void;
}

export function GenerationScreen({ status, note, onCancel }: GenerationScreenProps) {
    const { t } = useTranslation();
    return (
        <div className="gen-screen">
            <div className="gen-screen__text">
                <h2 className="gen-screen__title">{t('ai.auto_generating_title')}</h2>
                <p className="gen-screen__subtitle">{t('ai.auto_generating_subtitle')}</p>
                <GenerationStatus label={status} size="large" />
                {note && <p className="gen-screen__note">{note}</p>}
                {onCancel && (
                    <div className="gen-screen__actions">
                        <Button variant="secondary" size="sm" onClick={onCancel}>
                            {t('ai.cancel_pipeline')}
                        </Button>
                    </div>
                )}
            </div>
            <div className="gen-screen__visual">
                <CardShuffleStack size="large" />
            </div>
        </div>
    );
}

/** Compact stack + stage text on one row, for regenerating from the settings panel. */
export function InlineGenerationProgress({ progress }: { progress: AIProgress | null }) {
    const { t } = useTranslation();
    return (
        <div className="ai-progress-inline">
            <CardShuffleStack size="compact" />
            <GenerationStatus label={t(stageLabelKey(progress))} size="compact" />
        </div>
    );
}
