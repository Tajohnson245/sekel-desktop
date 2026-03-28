import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStore } from '../../stores/profileStore';
import { sanitize } from '../../lib/sanitize';
import type { OcclusionShape, IOMode } from '../../lib/types';
import './CardViewer.css';

interface CardViewerProps {
    front: string;
    back: string;
    isRevealed: boolean;
    onReveal: () => void;
    onUnreveal?: () => void;
}

// ─── Content transforms ─────────────────────────────────────────
// These pure functions process the raw HTML before rendering.

const CLOZE_RE = /\{\{c\d+::(.+?)\}\}/g;

function renderClozeFront(html: string): string {
    return html.replace(CLOZE_RE, '<span class="cloze-blank">[&hellip;]</span>');
}

function renderClozeBack(html: string): string {
    return html.replace(CLOZE_RE, '<span class="cloze-reveal">$1</span>');
}

// ─── Shape SVG rendering ────────────────────────────────────────

function renderShapeSVG(shape: OcclusionShape, fill: string, stroke?: string, strokeWidth = 0.5): string {
    const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : '';
    switch (shape.type) {
        case 'rect':
            return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${fill}"${strokeAttr} rx="0.5"/>`;
        case 'ellipse':
            return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${fill}"${strokeAttr}/>`;
        case 'polygon':
            return `<polygon points="${shape.points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${fill}"${strokeAttr}/>`;
    }
}

/** Compute card units from shapes (groups + ungrouped) */
function computeCardUnits(shapes: OcclusionShape[]): OcclusionShape[][] {
    const units: OcclusionShape[][] = [];
    const groupMap = new Map<string, number>();

    for (const s of shapes) {
        if (s.groupId) {
            if (groupMap.has(s.groupId)) {
                units[groupMap.get(s.groupId)!].push(s);
            } else {
                groupMap.set(s.groupId, units.length);
                units.push([s]);
            }
        } else {
            units.push([s]);
        }
    }
    return units;
}

/** Convert legacy OcclusionRect[] to OcclusionShape[] */
function legacyRectsToShapes(rects: { x: number; y: number; w: number; h: number }[]): OcclusionShape[] {
    return rects.map((r, i) => ({
        type: 'rect' as const,
        id: String(i),
        x: r.x, y: r.y, w: r.w, h: r.h,
    }));
}

function renderOcclusionOverlay(html: string): string {
    // Try new format first: data-shapes
    const newFormatRe = /<div\s+class="occlusion-card([^"]*)"[^>]*data-shapes="([^"]*)"[^>]*data-active="(\d+)"[^>]*(?:data-iomode="([^"]*)")?[^>]*>/;
    // Legacy format: data-rects
    const legacyRe = /<div\s+class="occlusion-card([^"]*)"[^>]*data-rects="([^"]*)"[^>]*data-active="(\d+)"[^>]*>/;

    let match = html.match(newFormatRe);
    let isLegacy = false;

    if (!match || !match[2].includes('type')) {
        match = html.match(legacyRe);
        if (!match) return html;
        isLegacy = true;
    }

    const extraClasses = match[1];
    const encodedData = match[2];
    const activeIndex = parseInt(match[3], 10);
    const isReveal = extraClasses.includes('occlusion-reveal');

    let shapes: OcclusionShape[];
    let ioMode: IOMode;

    try {
        const decoded = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        if (isLegacy) {
            const rects = JSON.parse(decoded) as { x: number; y: number; w: number; h: number }[];
            shapes = legacyRectsToShapes(rects);
            ioMode = 'hide-one-guess-one'; // preserve legacy behavior
        } else {
            shapes = JSON.parse(decoded) as OcclusionShape[];
            // Extract iomode from data attribute
            const iomodeMatch = html.match(/data-iomode="([^"]*)"/);
            ioMode = (iomodeMatch?.[1] as IOMode) || 'hide-all-guess-one';
        }
    } catch {
        return html;
    }

    // Build SVG elements based on IO mode
    let svgContent = '';

    if (ioMode === 'hide-all-reveal-all') {
        // HARA: all shapes masked on front, all revealed on back — 1 card total
        for (const shape of shapes) {
            if (isReveal) {
                svgContent += renderShapeSVG(shape, 'rgba(34,197,94,0.15)', '#22c55e', 0.8);
            } else {
                svgContent += renderShapeSVG(shape, '#3b82f6');
            }
        }
    } else if (ioMode === 'hide-all-guess-one') {
        const cardUnits = computeCardUnits(shapes);
        if (activeIndex >= cardUnits.length) return html;
        const activeShapeIds = new Set(cardUnits[activeIndex].map(s => s.id));

        // HAGO: all units masked, active revealed on back
        for (let u = 0; u < cardUnits.length; u++) {
            for (const shape of cardUnits[u]) {
                if (isReveal && activeShapeIds.has(shape.id)) {
                    svgContent += renderShapeSVG(shape, 'rgba(34,197,94,0.15)', '#22c55e', 0.8);
                } else {
                    svgContent += renderShapeSVG(shape, '#3b82f6');
                }
            }
        }
    } else {
        const cardUnits = computeCardUnits(shapes);
        if (activeIndex >= cardUnits.length) return html;
        const activeShapeIds = new Set(cardUnits[activeIndex].map(s => s.id));

        // HOGO: only active unit masked
        for (let u = 0; u < cardUnits.length; u++) {
            for (const shape of cardUnits[u]) {
                if (activeShapeIds.has(shape.id)) {
                    if (isReveal) {
                        svgContent += renderShapeSVG(shape, 'rgba(34,197,94,0.15)', '#22c55e', 0.8);
                    } else {
                        svgContent += renderShapeSVG(shape, '#3b82f6');
                    }
                }
            }
        }
    }

    const svg = `<svg style="position:absolute;inset:0;width:100%;height:100%;z-index:10;pointer-events:none" viewBox="0 0 100 100" preserveAspectRatio="none">${svgContent}</svg>`;

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

    const frontInnerRef = useRef<HTMLDivElement>(null);
    const backInnerRef = useRef<HTMLDivElement>(null);

    const checkOverflow = useCallback((el: HTMLDivElement | null) => {
        if (!el) return;
        const face = el.closest('.flashcard-face') as HTMLElement | null;
        if (!face) return;
        face.classList.toggle('has-overflow', el.scrollHeight > el.clientHeight + 2);
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
        face.classList.toggle('scrolled-to-bottom', atBottom);
    }, []);

    useEffect(() => {
        checkOverflow(frontInnerRef.current);
        checkOverflow(backInnerRef.current);
    }, [front, back, isRevealed, checkOverflow]);

    const handleInnerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        checkOverflow(e.currentTarget);
    }, [checkOverflow]);

    const handleClick = () => {
        if (isRevealed && onUnreveal) onUnreveal();
        else if (!isRevealed) onReveal();
    };

    // ── Classic mode ─────────────────────────────────────────────
    if (!cardStyleEnabled) {
        const answerOnly = stripFrontFromBack(renderedBack, renderedFront);

        return (
            <div
                className="card-viewer card-viewer--classic"
                data-testid="card-viewer"
                role="button"
                tabIndex={0}
                aria-label={isRevealed ? t('study.tap_to_flip') : t('study.show_answer')}
                onClick={handleClick}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
            >
                <div className="classic-front">
                    <div className="flashcard-face-inner">
                        <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                    </div>
                </div>

                <hr className={`classic-divider${isRevealed ? '' : ' classic-divider--hidden'}`} />
                <div className={`classic-back${isRevealed ? '' : ' classic-back--hidden'}`}>
                    <div className="flashcard-label">{t('study.answer')}</div>
                    <div className="flashcard-face-inner">
                        <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(answerOnly) }} />
                    </div>
                </div>
            </div>
        );
    }

    // ── Static mode (no animation) ───────────────────────────────
    if (!animationEnabled) {
        return (
            <div className="card-viewer" data-testid="card-viewer">
                <div
                    className="flashcard-container"
                    role="button"
                    tabIndex={0}
                    aria-label={isRevealed ? t('study.tap_to_flip') : t('study.show_answer')}
                    onClick={handleClick}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
                >
                    {!isRevealed ? (
                        <div className="flashcard-face flashcard-face-front flashcard-face--static">
                            <div className="flashcard-face-inner" ref={frontInnerRef} onScroll={handleInnerScroll}>
                                <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                            </div>
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        </div>
                    ) : (
                        <div className="flashcard-face flashcard-face-back flashcard-face--static">
                            <div className="flashcard-face-inner" ref={backInnerRef} onScroll={handleInnerScroll}>
                                <div className="flashcard-label">{t('study.answer')}</div>
                                <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedBack) }} />
                            </div>
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
            <div
                className={`flashcard-container ${isRevealed ? 'flipped' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={isRevealed ? t('study.tap_to_flip') : t('study.show_answer')}
                onClick={handleClick}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
            >
                <div className="flashcard-flipper">
                    <div className="flashcard-face flashcard-face-front">
                        <div className="flashcard-face-inner" ref={frontInnerRef} onScroll={handleInnerScroll}>
                            <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedFront) }} />
                        </div>
                        {!isRevealed && (
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        )}
                    </div>

                    <div className="flashcard-face flashcard-face-back">
                        <div className="flashcard-face-inner" ref={backInnerRef} onScroll={handleInnerScroll}>
                            <div className="flashcard-label">{t('study.answer')}</div>
                            <div className="flashcard-content" dangerouslySetInnerHTML={{ __html: sanitize(renderedBack) }} />
                        </div>
                        {isRevealed && onUnreveal && (
                            <div className="tap-hint"><span>{t('study.tap_to_flip')}</span></div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
