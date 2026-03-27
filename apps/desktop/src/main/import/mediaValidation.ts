/**
 * Media file validation using magic-byte detection.
 *
 * Verifies that media files are actually the type their extension claims,
 * preventing disguised executables or malicious files from being imported.
 * SVG files are sanitized since they can contain embedded scripts.
 */

import { fileTypeFromBuffer } from 'file-type';
import DOMPurify from 'isomorphic-dompurify';

/** MIME types we allow for imported media files. */
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'audio/flac',
    'audio/x-flac',
]);

/** Extensions that map to allowed MIME types. */
const EXTENSION_TO_MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
};

export interface MediaValidationResult {
    valid: boolean;
    detectedMime?: string;
    warning?: string;
    /** For SVG files: the sanitized content buffer to write instead of the original. */
    sanitizedBuffer?: Buffer;
}

/**
 * Validates a media file buffer by checking its magic bytes against the declared extension.
 *
 * - Binary formats (JPEG, PNG, GIF, etc.): detected via magic bytes
 * - SVG files: detected by extension (no magic bytes), then sanitized to remove scripts
 * - Unknown/disallowed types: rejected
 */
export async function validateMediaBuffer(
    buf: Buffer,
    declaredFilename: string,
): Promise<MediaValidationResult> {
    const ext = declaredFilename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';

    // SVG special case: magic bytes don't detect SVGs (they're XML text)
    if (ext === '.svg') {
        return validateSvg(buf);
    }

    // Check if extension is in our allowed set
    const expectedMime = EXTENSION_TO_MIME[ext];
    if (!expectedMime) {
        return {
            valid: false,
            warning: `File "${declaredFilename}" has unrecognized extension "${ext}".`,
        };
    }

    // Detect actual file type from magic bytes
    const detected = await fileTypeFromBuffer(buf);

    if (!detected) {
        // Could not detect type from magic bytes — reject for safety
        return {
            valid: false,
            warning: `File "${declaredFilename}" could not be identified by its content.`,
        };
    }

    if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
        return {
            valid: false,
            detectedMime: detected.mime,
            warning: `File "${declaredFilename}" claims to be ${expectedMime} but is actually ${detected.mime}.`,
        };
    }

    // Warn on mismatch but still allow if detected type is in allowed set
    if (detected.mime !== expectedMime) {
        return {
            valid: true,
            detectedMime: detected.mime,
            warning: `File "${declaredFilename}" extension suggests ${expectedMime} but content is ${detected.mime}.`,
        };
    }

    return { valid: true, detectedMime: detected.mime };
}

/**
 * Validates and sanitizes an SVG file.
 * Strips <script>, event handlers, and other dangerous content.
 */
function validateSvg(buf: Buffer): MediaValidationResult {
    const svgString = buf.toString('utf-8');

    // Quick check: does it look like SVG at all?
    if (!svgString.includes('<svg') && !svgString.includes('<SVG')) {
        return {
            valid: false,
            warning: 'File with .svg extension does not contain SVG content.',
        };
    }

    // Sanitize SVG content using DOMPurify's SVG profile
    const sanitized = DOMPurify.sanitize(svgString, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });

    return {
        valid: true,
        detectedMime: 'image/svg+xml',
        sanitizedBuffer: Buffer.from(sanitized, 'utf-8'),
    };
}
