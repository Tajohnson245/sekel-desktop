import { useEffect, useState } from 'react';

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface SpotlightProps {
    selector: string;
    padding?: number;
}

const PADDING = 8;
const TARGET_LOOKUP_TIMEOUT_MS = 2000;
const TARGET_LOOKUP_INTERVAL_MS = 80;

export function Spotlight({ selector, padding = PADDING }: SpotlightProps) {
    const [rect, setRect] = useState<Rect | null>(null);

    useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | null = null;
        let element: Element | null = null;
        let pollTimer: number | null = null;
        const elapsedAt = Date.now();

        const measure = () => {
            if (!element) return;
            const r = element.getBoundingClientRect();
            setRect({
                top: r.top - padding,
                left: r.left - padding,
                width: r.width + padding * 2,
                height: r.height + padding * 2,
            });
        };

        const onScrollOrResize = () => measure();

        const findTarget = () => {
            if (cancelled) return;
            const el = document.querySelector(selector);
            if (el) {
                element = el;
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                // Wait a frame for scroll to settle, then measure.
                requestAnimationFrame(() => {
                    measure();
                    observer = new ResizeObserver(measure);
                    observer.observe(el);
                });
                window.addEventListener('scroll', onScrollOrResize, true);
                window.addEventListener('resize', onScrollOrResize);
                return;
            }
            if (Date.now() - elapsedAt < TARGET_LOOKUP_TIMEOUT_MS) {
                pollTimer = window.setTimeout(findTarget, TARGET_LOOKUP_INTERVAL_MS);
            } else {
                // Couldn't find target — leave rect null so the parent can render card-only.
                setRect(null);
            }
        };

        findTarget();

        return () => {
            cancelled = true;
            if (pollTimer != null) window.clearTimeout(pollTimer);
            if (observer) observer.disconnect();
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [selector, padding]);

    if (!rect) {
        // No target found — render a full-screen dim so the card still has a backdrop.
        return <div className="onboarding-backdrop onboarding-backdrop-fallback" aria-hidden="true" />;
    }

    return (
        <div className="onboarding-spotlight-layer" aria-hidden="true">
            <div className="onboarding-backdrop onboarding-backdrop-top" style={{ height: Math.max(0, rect.top) }} />
            <div
                className="onboarding-backdrop onboarding-backdrop-bottom"
                style={{ top: rect.top + rect.height, height: `calc(100vh - ${rect.top + rect.height}px)` }}
            />
            <div
                className="onboarding-backdrop onboarding-backdrop-left"
                style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }}
            />
            <div
                className="onboarding-backdrop onboarding-backdrop-right"
                style={{
                    top: rect.top,
                    left: rect.left + rect.width,
                    width: `calc(100vw - ${rect.left + rect.width}px)`,
                    height: rect.height,
                }}
            />
            <div
                className="onboarding-spotlight-ring"
                style={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                }}
            />
        </div>
    );
}
