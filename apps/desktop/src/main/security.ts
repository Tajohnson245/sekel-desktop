import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Trust boundary helpers for the main process.
 *
 * The renderer runs a memory router, so the top-level document never
 * legitimately navigates away from index.html. Anything else that tries to
 * load in a window (a link inside an imported card, a redirect, a script
 * setting `location`) is treated as hostile: it must not inherit the preload's
 * `window.electronAPI`, and IPC from it must be refused.
 */

export interface TrustedOrigins {
    /** Absolute path to the bundled renderer index.html. */
    rendererFile: string;
    /** Dev-server URL (electron-vite). Only set for unpackaged builds. */
    devServerUrl?: string;
}

function normalisePath(p: string, platform: NodeJS.Platform): string {
    const resolved = path.resolve(p);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * True when `rawUrl` is the app's own renderer page (bundled file or, in
 * development, the electron-vite dev server). Hash fragments and query strings
 * are ignored; any other file, scheme, host or port is untrusted.
 */
export function isTrustedRendererUrl(
    rawUrl: string,
    origins: TrustedOrigins,
    platform: NodeJS.Platform = process.platform,
): boolean {
    if (!rawUrl) return false;
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }

    if (url.protocol === 'file:') {
        let filePath: string;
        try {
            filePath = fileURLToPath(url, { windows: platform === 'win32' });
        } catch {
            return false;
        }
        return normalisePath(filePath, platform) === normalisePath(origins.rendererFile, platform);
    }

    if (origins.devServerUrl) {
        try {
            return url.origin === new URL(origins.devServerUrl).origin;
        } catch {
            return false;
        }
    }

    return false;
}

/** Only plain web links are handed to the OS browser. */
export function isExternalWebUrl(rawUrl: string): boolean {
    try {
        const { protocol } = new URL(rawUrl);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
}

/**
 * Renderer permissions we actually use. Everything else (camera, microphone,
 * geolocation, HID/serial/USB, display capture, notifications from the page —
 * desktop notifications are sent from main) is denied.
 */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
    'clipboard-sanitized-write',
    'fullscreen',
]);
