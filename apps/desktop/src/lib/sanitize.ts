import DOMPurify from 'dompurify';

// Allow sekel-media:// protocol so imported card images render correctly
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'src' && data.attrValue.startsWith('sekel-media://')) {
        data.forceKeepAttr = true;
    }
});

// Links inside card content (imported decks are untrusted) must never navigate
// the app window. Forcing target=_blank routes every click through the main
// process's window-open handler, which hands http(s) links to the OS browser.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

export const sanitize = (html: string) => DOMPurify.sanitize(html);
