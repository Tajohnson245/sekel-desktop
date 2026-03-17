/**
 * Resolves Anki media references in rendered card HTML to sekel-media:// URLs.
 *
 * Anki stores media files by their original filename. During card rendering,
 * two kinds of references appear:
 *   - <img src="filename.jpg"> — direct image references
 *   - [sound:filename.mp3]    — audio references (Anki's custom syntax)
 *
 * This module replaces them with sekel-media://{userId}/{filename} URLs so
 * the Electron protocol handler can serve the files from disk.
 *
 * Only bare filenames (no scheme) are rewritten. URLs with a scheme
 * (http://, https://, data:, sekel-media://, file://) are left unchanged.
 */

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;

/**
 * Resolves Anki media references in HTML to sekel-media:// URLs.
 *
 * @param html   Rendered card HTML (may contain img src and [sound:] tags)
 * @param userId The current user's ID (used as the protocol URL hostname)
 * @returns      HTML with media references replaced by sekel-media:// URLs
 */
export function resolveMediaInHtml(html: string, userId: string): string {
    // Replace <img src="bare-filename"> — only bare filenames, not URLs
    let result = html.replace(
        /(<img\s[^>]*?)src="([^"]+)"/gi,
        (_match, prefix: string, src: string) => {
            if (HAS_SCHEME.test(src)) return _match; // already a URL, leave alone
            const encoded = encodeURIComponent(userId) + '/' + encodeURIComponent(src);
            return `${prefix}src="sekel-media://${encoded}"`;
        },
    );

    // Replace [sound:filename] with <audio> element
    result = result.replace(
        /\[sound:([^\]]+)\]/g,
        (_match, filename: string) => {
            const encoded = encodeURIComponent(userId) + '/' + encodeURIComponent(filename);
            return `<audio controls src="sekel-media://${encoded}"></audio>`;
        },
    );

    return result;
}

/**
 * Processes Anki conditional blocks in a template string.
 *
 * Handles:
 *   {{#FieldName}}...{{/FieldName}}  — show if field is non-empty
 *   {{^FieldName}}...{{/FieldName}}  — show if field is empty/missing
 *
 * @param template  Template string containing conditional blocks
 * @param fields    Field name → value map
 * @returns         Template with conditionals resolved
 */
export function resolveConditionals(template: string, fields: Record<string, string>): string {
    // Positive conditionals: {{#FieldName}}...{{/FieldName}}
    let result = template.replace(
        /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
        (_match, fieldName: string, content: string) => {
            const value = fields[fieldName.trim()] ?? '';
            return value.trim() ? content : '';
        },
    );

    // Negative conditionals: {{^FieldName}}...{{/FieldName}}
    result = result.replace(
        /\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
        (_match, fieldName: string, content: string) => {
            const value = fields[fieldName.trim()] ?? '';
            return value.trim() ? '' : content;
        },
    );

    return result;
}

/**
 * Substitutes {{FieldName}} placeholders in a template with field values.
 * Preserves cloze syntax ({{c1::answer}}) — does NOT replace those.
 *
 * @param template  Template string with {{FieldName}} placeholders
 * @param fields    Field name → value map
 * @returns         Template with placeholders replaced
 */
export function substituteFields(template: string, fields: Record<string, string>): string {
    return template.replace(
        /\{\{(?!c\d+::)(?!FrontSide\}\})([^}]+)\}\}/gi,
        (_match, fieldName: string) => fields[fieldName.trim()] ?? '',
    );
}

/**
 * Renders an Anki card template (front or back) with full field substitution,
 * conditional processing, FrontSide replacement, and media resolution.
 *
 * @param template    The qfmt or afmt template string
 * @param fields      Field name → value map from the note
 * @param userId      Current user's ID for media URL construction
 * @param frontHtml   Already-rendered front HTML (for {{FrontSide}} on back templates)
 * @returns           Fully rendered HTML string
 */
export function renderAnkiTemplate(
    template: string,
    fields: Record<string, string>,
    userId: string,
    frontHtml?: string,
): string {
    let html = template;

    // 1. Resolve conditional blocks before field substitution
    html = resolveConditionals(html, fields);

    // 2. Replace {{FrontSide}} before field substitution (special directive, not a user field)
    if (frontHtml !== undefined) {
        html = html.replace(/\{\{FrontSide\}\}/gi, frontHtml);
    }

    // 3. Substitute {{FieldName}} placeholders ({{FrontSide}} is excluded by the regex)
    html = substituteFields(html, fields);

    // 4. Resolve media references to sekel-media:// URLs
    html = resolveMediaInHtml(html, userId);

    return html;
}
