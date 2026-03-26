import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import ReactQuill from 'react-quill-new';
import Quill from 'quill';
import 'react-quill-new/dist/quill.snow.css';
import { useTranslation } from 'react-i18next';
import { uploadImage } from '../../lib/storage';
import { useToast } from './Toast';
import './RichTextEditor.css';

// Override Quill's Image format to allow sekel-media:// URLs.
// By default Quill only permits http:, https:, and data: in <img src>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BaseImage = Quill.import('formats/image') as any;
class SekelImage extends BaseImage {
    static sanitize(url: string): string {
        if (url?.startsWith('sekel-media://')) return url;
        return BaseImage.sanitize(url);
    }
}
Quill.register('formats/image', SekelImage, true);

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    userId: string;
    id?: string;
    style?: React.CSSProperties;
    cloze?: boolean;
}

/** Find the next cloze number (c1, c2, …) not yet used in the text */
function getNextClozeNumber(text: string): number {
    const used = new Set<number>();
    for (const m of text.matchAll(/\{\{c(\d+)::/g)) used.add(Number(m[1]));
    return used.size === 0 ? 1 : Math.max(...used) + 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapSelectionInCloze(quill: any): boolean {
    const range = quill.getSelection();
    if (!range || range.length === 0) return false;
    const selected = quill.getText(range.index, range.length);
    const n = getNextClozeNumber(quill.getText());
    quill.deleteText(range.index, range.length);
    const replacement = `{{c${n}::${selected}}}`;
    quill.insertText(range.index, replacement);
    quill.setSelection(range.index + replacement.length, 0);
    return true;
}

export default function RichTextEditor({ value, onChange, placeholder, userId, id, style, cloze }: RichTextEditorProps) {
    const quillRef = useRef<ReactQuill>(null);
    const { t } = useTranslation();
    const { showToast } = useToast();

    // Custom image handler
    const imageHandler = useCallback(() => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files ? input.files[0] : null;
            if (file) {
                try {
                    const url = await uploadImage(file, userId);
                    const quill = quillRef.current?.getEditor();
                    const range = quill?.getSelection();
                    if (quill && range) {
                        quill.insertEmbed(range.index, 'image', url);
                    }
                } catch (_error) {
                    showToast(t('errors.upload_image'), 'error');
                }
            }
        };
    }, [userId]);

    // Cloze handler — wraps selected text in {{cN::…}}
    const clozeHandler = useCallback(() => {
        const quill = quillRef.current?.getEditor();
        if (!quill) return;
        if (!wrapSelectionInCloze(quill)) {
            showToast(t('editor.cloze_select_text'), 'error');
        }
    }, [showToast, t]);

    // Set tooltip on cloze button after mount
    useEffect(() => {
        if (!cloze) return;
        const container = quillRef.current?.getEditor()?.container;
        const toolbar = container?.previousElementSibling;
        const btn = toolbar?.querySelector('.ql-cloze');
        if (btn) btn.setAttribute('title', t('editor.cloze_tooltip'));
    }, [cloze, t]);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image'],
                ...(cloze ? [['cloze']] : []),
                ['clean']
            ],
            handlers: {
                image: imageHandler,
                ...(cloze ? { cloze: clozeHandler } : {}),
            }
        },
        clipboard: {
            matchVisual: false
        },
        keyboard: {
            bindings: {
                // Better handling for deleting images with Backspace
                backspace: {
                    key: 8, // Backspace
                    handler: function (range: any) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const quill = (this as any).quill;
                        if (range.index > 0) {
                            const [prev] = quill.getLeaf(range.index - 1);
                            if (prev && prev.domNode && prev.domNode.tagName === 'IMG') {
                                quill.deleteText(range.index - 1, 1);
                                return false; // Prevent default
                            }
                        }
                        return true; // Propagate to default
                    }
                },
                // Handle Delete key (forward delete)
                delete: {
                    key: 46, // Delete
                    handler: function (range: any) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const quill = (this as any).quill;
                        const [next] = quill.getLeaf(range.index);
                        if (next && next.domNode && next.domNode.tagName === 'IMG') {
                            quill.deleteText(range.index, 1);
                            return false;
                        }
                        return true;
                    }
                },
                // Ctrl+Shift+C for cloze wrapping
                ...(cloze ? {
                    clozeShortcut: {
                        key: 'C',
                        shortKey: true,
                        shiftKey: true,
                        handler: function () {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            wrapSelectionInCloze((this as any).quill);
                            return false;
                        }
                    }
                } : {})
            }
        }
    }), [imageHandler, cloze, clozeHandler]);

    return (
        <div className="rich-text-editor-container" id={id} style={style}>
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value}
                onChange={onChange}
                modules={modules}
                placeholder={placeholder}
            />
        </div>
    );
}
