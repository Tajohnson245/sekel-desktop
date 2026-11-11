import { useTranslation } from 'react-i18next';
import type { AIProgress } from '../../types/electron';
import './GenerationProgress.css';

// ── Card shuffle ────────────────────────────────────────────────────────────
// A stack of three cards. The front card's loading bar fills, the card slides
// off and tucks in at the back, the next card comes forward and its bar fills.
// Purely decorative: it loops at a fixed pace through every pipeline stage
// (chunking, generating, refining) and never reflects real progress. The real
// progress is the thin bar in GenerationProgressBar. All motion is CSS (see
// GenerationProgress.css), so it costs no re-renders.

export type CardShuffleSize = 'large' | 'compact';

export function CardShuffleStack({ size = 'large' }: { size?: CardShuffleSize }) {
    return (
        <div className={`card-shuffle card-shuffle--${size}`} aria-hidden="true">
            <div className="card-shuffle__deck">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="card-shuffle__card">
                        <span className="card-shuffle__line" />
                        <span className="card-shuffle__line card-shuffle__line--short" />
                        <span className="card-shuffle__bar">
                            <span className="card-shuffle__fill" />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Real progress ───────────────────────────────────────────────────────────
// Determinate bar driven by `ai-progress` events. Before the first event
// arrives (or on the non-streaming path, which sends none) it shows an
// indeterminate bar with a generic label.

const PHASE_LABEL_KEYS: Record<AIProgress['phase'], string> = {
    chunking: 'ai.progress_chunking',
    generating: 'ai.progress_generating',
    refining: 'ai.progress_refining',
    done: 'ai.progress_done',
};

export function progressPercent(progress: AIProgress | null): number | null {
    if (!progress) return null;
    if (progress.total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)));
}

export function GenerationProgressBar({ progress }: { progress: AIProgress | null }) {
    const { t } = useTranslation();
    const pct = progressPercent(progress);
    const label = progress ? t(PHASE_LABEL_KEYS[progress.phase]) : t('ai.progress_working');

    return (
        <div className="ai-progress" aria-live="polite">
            <div className="ai-progress__label">{label}</div>
            <div
                className="ai-progress__track"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct ?? undefined}
            >
                {pct === null ? (
                    <div className="ai-progress__fill ai-progress__fill--indeterminate" />
                ) : (
                    <div className="ai-progress__fill" style={{ width: `${pct}%` }} />
                )}
            </div>
        </div>
    );
}

/** Compact stack + progress bar on one row, for the settings panel. */
export function InlineGenerationProgress({ progress }: { progress: AIProgress | null }) {
    return (
        <div className="ai-progress-inline">
            <CardShuffleStack size="compact" />
            <GenerationProgressBar progress={progress} />
        </div>
    );
}
