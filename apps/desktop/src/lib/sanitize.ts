import DOMPurify from 'dompurify';

// Allow sekel-media:// protocol so imported card images render correctly
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'src' && data.attrValue.startsWith('sekel-media://')) {
        data.forceKeepAttr = true;
    }
});

export const sanitize = (html: string) => DOMPurify.sanitize(html);
