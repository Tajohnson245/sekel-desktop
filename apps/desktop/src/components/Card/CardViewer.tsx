import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../stores/profileStore';

interface CardViewerProps {
    front: string;
    back: string;
    isRevealed: boolean;
    onReveal: () => void;
    onUnreveal?: () => void;
}

const sanitize = (html: string) => DOMPurify.sanitize(html);

// ─── Content transforms ─────────────────────────────────────────
// These pure functions process the raw HTML before rendering.

const CLOZE_RE = /\{\{c\d+::(.+?)\}\}/g;

function renderClozeFront(html: string): string {
    return html.replace(CLOZE_RE, '<span class="cloze-blank">[&hellip;]</span>');
}

function renderClozeBack(html: string): string {
    return html.replace(CLOZE_RE, '<span class="cloze-reveal">$1</span>');
}

function renderOcclusionOverlay(html: string): string {
    const occlusionRe = /<div\s+class="occlusion-card([^"]*)"[^>]*data-rects="([^"]*)"[^>]*data-active="(\d+)"[^>]*>/;
    const match = html.match(occlusionRe);
    if (!match) return html;

    const extraClasses = match[1];
    const rectsEncoded = match[2];
    const activeIndex = parseInt(match[3], 10);
    const isReveal = extraClasses.includes('occlusion-reveal');

    let rects: { x: number; y: number; w: number; h: number }[];
    try {
        const decoded = rectsEncoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        rects = JSON.parse(decoded);
    } catch {
        return html;
    }

    const r = rects[activeIndex];
    if (!r) return html;

    const svgRect = isReveal
        ? `<rect x="${r.x}%" y="${r.y}%" width="${r.w}%" height="${r.h}%" fill="rgba(34,197,94,0.15)" stroke="#22c55e" stroke-width="3" rx="4"/>`
        : `<rect x="${r.x}%" y="${r.y}%" width="${r.w}%" height="${r.h}%" fill="#3b82f6" rx="4"/>`;

    const svg = `<svg style="position:absolute;inset:0;width:100%;height:100%;z-index:10;pointer-events:none">${svgRect}</svg>`;

    return html.replace(
        /(<div\s+class="occlusion-card[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,
        `$1$2${svg}$3`,
    );
}

/**
 * Strip the duplicated front content and <hr> from an Anki back template.
 * Anki back templates typically render as: {{FrontSide}}<hr>answer
 * In classic mode the question is already visible, so we only want the answer.
 */
function stripFrontFromBack(backHtml: string, frontHtml: string): string {
    return backHtml
        .replace(/<hr\s*\/?>/gi, '')
        .replace(frontHtml, '')
        .trim();
}

// ─── Render modes ────────────────────────────────────────────────
// The viewer supports three display modes based on user preferences:
//   1. Classic  — no card, question + divider + answer (card_style OFF)
//   2. Static   — styled card, instant show/hide      (card_style ON, flip_animation OFF)
//   3. Animated — styled card, 3D flip transition     (card_style ON, flip_animation ON)

export default function CardViewer({ front, back, isRevealed, onReveal, onUnreveal }: CardViewerProps) {
    const { t } = useTranslation();
    const { profile } = useProfileStore();
    const cardStyleEnabled = profile?.card_style ?? true;
    const animationEnabled = profile?.flip_animation ?? true;

    const renderedFront = renderOcclusionOverlay(renderClozeFront(front));
    const renderedBack = renderOcclusionOverlay(renderClozeBack(back));

    // ── Classic mode ─────────────────────────────────────────────
    if (!cardStyleEnabled) {
        const answerOnly = stripFrontFromBack(renderedBack, renderedFront);

        return (
            <div className="card-viewer card-viewer--classic" data-testid="card-viewer">
                <div className="classic-front">
                    <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                </div>

                {!isRevealed ? (
                    <button className="classic-show-answer" onClick={onReveal}>
                        {t('study.show_answer')}
                    </button>
                ) : (
                    <>
                        <hr className="classic-divider" />
                        <div className="classic-back">
                            <div className="flashcard-label">{t('study.answer')}</div>
                            <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(answerOnly) }} />
                        </div>
                    </>
                )}
            </div>
        );
    }

    const handleClick = () => {
        if (isRevealed && onUnreveal) onUnreveal();
        else if (!isRevealed) onReveal();
    };

    // ── Static mode (no animation) ───────────────────────────────
    if (!animationEnabled) {
        return (
            <div className="card-viewer" data-testid="card-viewer">
                <div className="flashcard-container" onClick={handleClick}>
                    {!isRevealed ? (
                        <div className="flashcard-face flashcard-face-front flashcard-face--static">
                            <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        </div>
                    ) : (
                        <div className="flashcard-face flashcard-face-back flashcard-face--static">
                            <div className="flashcard-label">{t('study.answer')}</div>
                            <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedBack) }} />
                            {onUnreveal && (
                                <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Animated mode (3D flip) ──────────────────────────────────
    return (
        <div className="card-viewer" data-testid="card-viewer">
            <div className={`flashcard-container ${isRevealed ? 'flipped' : ''}`} onClick={handleClick}>
                <div className="flashcard-flipper">
                    <div className="flashcard-face flashcard-face-front">
                        <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                        {!isRevealed && (
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        )}
                    </div>

                    <div className="flashcard-face flashcard-face-back">
                        <div className="flashcard-label">{t('study.answer')}</div>
                        <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedBack) }} />
                        {isRevealed && onUnreveal && (
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
