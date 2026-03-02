import React, { useRef, useMemo, useCallback } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { uploadImage } from '../../lib/storage';
import './RichTextEditor.css';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    userId: string;
    id?: string;
    style?: React.CSSProperties;
}

export default function RichTextEditor({ value, onChange, placeholder, userId, id, style }: RichTextEditorProps) {
    const quillRef = useRef<ReactQuill>(null);

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
                } catch (error) {
                    console.error('Error uploading image:', error);
                    alert('Failed to upload image');
                }
            }
        };
    }, [userId]);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
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
                        // Check if the previous character is an image
                        // This uses generic Quill types, so we use 'any' for the handler signature to avoid strict type errors for now
                        // In a real app we'd define proper Quill types or extend them.
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
                }
            }
        }
    }), [imageHandler]);

    // Handle paste events to catch images from clipboard
    // Note: react-quill doesn't expose a clean onPaste prop, so we could add a listener
    // But for now, let's rely on standard browser behavior or adding a matcher if needed.
    // Modern Quill handles image paste reasonably well as base64, but we want to upload them.
    // A robust solution for paste interception usually requires a custom matcher or module overriding.
    // For MVP, we stick to the toolbar handler. Enhancing paste is a "nice to have".

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
