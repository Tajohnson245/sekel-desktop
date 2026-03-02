import { useTranslation } from '../../../node_modules/react-i18next';
import { useProfileStore } from '../../stores/profileStore';

interface CardViewerProps {
    front: string;
    back: string;
    isRevealed: boolean;
    onReveal: () => void;
    onUnreveal?: () => void;
}

// ─── Cloze renderer ──────────────────────────────────────────────
const CLOZE_RE = /\{\{c\d+::(.+?)\}\}/g;

function renderClozeFront(html: string): string {
    return html.replace(
        CLOZE_RE,
        '<span class="cloze-blank">[&hellip;]</span>',
    );
}

function renderClozeBack(html: string): string {
    return html.replace(
        CLOZE_RE,
        '<span class="cloze-reveal">$1</span>',
    );
}

// ─── Occlusion overlay (inline SVG in HTML string) ──────────────
function renderOcclusionOverlay(html: string): string {
    // Match the occlusion-card div and extract data attributes
    const occlusionRe = /<div\s+class="occlusion-card([^"]*)"[^>]*data-rects="([^"]*)"[^>]*data-active="(\d+)"[^>]*>/;
    const match = html.match(occlusionRe);
    if (!match) return html;

    const extraClasses = match[1]; // e.g. " occlusion-reveal"
    const rectsEncoded = match[2];
    const activeIndex = parseInt(match[3], 10);
    const isReveal = extraClasses.includes('occlusion-reveal');

    let rects: { x: number; y: number; w: number; h: number }[];
    try {
        // The rects are HTML-entity encoded (&quot; for ")
        const decoded = rectsEncoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        rects = JSON.parse(decoded);
    } catch {
        return html;
    }

    const r = rects[activeIndex];
    if (!r) return html;

    // Build an SVG overlay that sits on top of the image
    const svgRect = isReveal
        ? `<rect x="${r.x}%" y="${r.y}%" width="${r.w}%" height="${r.h}%" fill="rgba(34,197,94,0.15)" stroke="#22c55e" stroke-width="3" rx="4"/>`
        : `<rect x="${r.x}%" y="${r.y}%" width="${r.w}%" height="${r.h}%" fill="#3b82f6" rx="4"/>`;

    const svg = `<svg style="position:absolute;inset:0;width:100%;height:100%;z-index:10;pointer-events:none">${svgRect}</svg>`;

    // Insert the SVG right before the closing </div> of the occlusion-card
    // The occlusion-card structure is: <div class="occlusion-card ..."><img ... /></div>
    // We insert the SVG after the <img> tag
    return html.replace(
        /(<div\s+class="occlusion-card[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,
        `$1$2${svg}$3`,
    );
}

export default function CardViewer({ front, back, isRevealed, onReveal, onUnreveal }: CardViewerProps) {
    const { t } = useTranslation();
    const { profile } = useProfileStore();
    const animationEnabled = profile?.flip_animation ?? true;

    const handleClick = () => {
        if (isRevealed && onUnreveal) {
            onUnreveal();
        } else if (!isRevealed) {
            onReveal();
        }
    };

    const renderedFront = renderOcclusionOverlay(renderClozeFront(front));
    const renderedBack = renderOcclusionOverlay(renderClozeBack(back));

    // ── No-animation mode: skip the 3D flipper entirely ───────────
    if (!animationEnabled) {
        return (
            <div className="card-viewer" data-testid="card-viewer">
                <div className="flashcard-container" onClick={handleClick}>
                    {!isRevealed ? (
                        <div className="flashcard-face flashcard-face-front" style={{ position: 'relative', transform: 'none' }}>
                            <div
                                className="flashcard-content"
                                dangerouslySetInnerHTML={{ __html: renderedFront }}
                            />
                            <div className="tap-hint">
                                <span>{t('study.tap_to_flip')}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flashcard-face flashcard-face-back" style={{ position: 'relative', transform: 'none' }}>
                            <div className="flashcard-label">{t('study.answer')}</div>
                            <div
                                className="flashcard-content"
                                dangerouslySetInnerHTML={{ __html: renderedBack }}
                            />
                            {onUnreveal && (
                                <div className="tap-hint">
                                    <span>{t('study.tap_to_flip')}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Animated mode: standard 3D flip ───────────────────────────
    return (
        <div className="card-viewer" data-testid="card-viewer">
            <div
                className={`flashcard-container ${isRevealed ? 'flipped' : ''}`}
                onClick={handleClick}
            >
                <div className="flashcard-flipper">
                    {/* Front side */}
                    <div className="flashcard-face flashcard-face-front">
                        <div
                            className="flashcard-content"
                            dangerouslySetInnerHTML={{ __html: renderedFront }}
                        />
                        {!isRevealed && (
                            <div className="tap-hint">
                                <span>{t('study.tap_to_flip')}</span>
                            </div>
                        )}
                    </div>

                    {/* Back side */}
                    <div className="flashcard-face flashcard-face-back">
                        <div className="flashcard-label">{t('study.answer')}</div>
                        <div
                            className="flashcard-content"
                            dangerouslySetInnerHTML={{ __html: renderedBack }}
                        />
                        {isRevealed && onUnreveal && (
                            <div className="tap-hint">
                                <span>{t('study.tap_to_flip')}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

