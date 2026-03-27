/**
 * Import-time HTML sanitization for note fields and card templates.
 *
 * Uses isomorphic-dompurify (DOMPurify + jsdom) to sanitize HTML in the
 * main process before database insertion. This is defense-in-depth:
 * the renderer also sanitizes at render time via lib/sanitize.ts.
 */

import DOMPurify from 'isomorphic-dompurify';

// Match the renderer's DOMPurify config: allow sekel-media:// protocol
// so imported card images survive sanitization.
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'src' && data.attrValue.startsWith('sekel-media://')) {
        data.forceKeepAttr = true;
    }
});

/**
 * Sanitizes a single HTML string, stripping scripts, event handlers,
 * javascript: URIs, etc. while preserving safe markup.
 */
export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html);
}

/**
 * Sanitizes every string value in a note's fields object/JSON.
 *
 * @param fields - Either a JSON string or an object whose values are HTML strings
 * @returns A JSON string with all values sanitized
 */
export function sanitizeNoteFields(fields: string | Record<string, unknown> | unknown): string {
    let obj: Record<string, unknown>;

    if (typeof fields === 'string') {
        try {
            obj = JSON.parse(fields);
        } catch {
            // If it's not valid JSON, sanitize the raw string and return it
            return DOMPurify.sanitize(fields);
        }
    } else if (fields != null && typeof fields === 'object' && !Array.isArray(fields)) {
        obj = fields as Record<string, unknown>;
    } else {
        return JSON.stringify(fields);
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = typeof value === 'string' ? DOMPurify.sanitize(value) : value;
    }
    return JSON.stringify(sanitized);
}

/**
 * Sanitizes card template HTML (Anki qfmt/afmt or Sekel front/back templates).
 *
 * Preserves Anki template syntax like {{FieldName}}, {{#Conditional}}, {{FrontSide}},
 * and cloze patterns like {{c1::answer}} by temporarily replacing them before sanitization.
 */
export function sanitizeTemplateHtml(html: string): string {
    // Temporarily replace Anki template tags to protect them from DOMPurify
    const placeholders: string[] = [];
    const withPlaceholders = html.replace(/\{\{[^}]+\}\}/g, (match) => {
        const idx = placeholders.length;
        placeholders.push(match);
        return `__TMPL_${idx}__`;
    });

    const sanitized = DOMPurify.sanitize(withPlaceholders);

    // Restore template tags
    return sanitized.replace(/__TMPL_(\d+)__/g, (_match, idx) => {
        return placeholders[Number(idx)] ?? '';
    });
}

/**
 * Sanitizes card_templates JSON (array of template objects with front_template/back_template).
 */
export function sanitizeCardTemplates(templates: string | unknown): string {
    let arr: unknown[];

    if (typeof templates === 'string') {
        try {
            arr = JSON.parse(templates);
        } catch {
            return DOMPurify.sanitize(templates);
        }
    } else if (Array.isArray(templates)) {
        arr = templates;
    } else {
        return JSON.stringify(templates);
    }

    if (!Array.isArray(arr)) return JSON.stringify(arr);

    const sanitized = arr.map((tmpl) => {
        if (tmpl == null || typeof tmpl !== 'object') return tmpl;
        const t = tmpl as Record<string, unknown>;
        return {
            ...t,
            ...(typeof t.front_template === 'string' && { front_template: sanitizeTemplateHtml(t.front_template) }),
            ...(typeof t.back_template === 'string' && { back_template: sanitizeTemplateHtml(t.back_template) }),
            // Anki template fields (qfmt/afmt)
            ...(typeof t.qfmt === 'string' && { qfmt: sanitizeTemplateHtml(t.qfmt) }),
            ...(typeof t.afmt === 'string' && { afmt: sanitizeTemplateHtml(t.afmt) }),
        };
    });

    return JSON.stringify(sanitized);
}
