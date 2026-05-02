import { useState, useRef, ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Input, useToast } from '../UI';
import './DocumentUpload.css';

interface DocumentUploadProps {
    onTextExtracted?: (text: string) => void;
    onFilesSelected?: (files: File[]) => void;
    onUrlSelected?: (url: string) => void;
    isProcessing?: boolean;
    children?: ReactNode;
}

export default function DocumentUpload({ onFilesSelected, onUrlSelected, isProcessing = false, children }: DocumentUploadProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [urlInput, setUrlInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        // Reject images — they aren't supported as flashcard source documents.
        // The file-picker `accept` filters this for click-to-upload, but
        // drag-drop bypasses `accept` entirely, so filter here too.
        const all = Array.from(files);
        const accepted = all.filter(f => !f.type.startsWith('image/'));
        const rejected = all.length - accepted.length;
        if (rejected > 0) {
            showToast(`Skipped ${rejected} image${rejected === 1 ? '' : 's'} — only documents are supported.`, 'error');
        }
        if (accepted.length > 0 && onFilesSelected) {
            onFilesSelected(accepted);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isProcessing) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (!isProcessing) handleFiles(e.dataTransfer.files);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
        e.target.value = '';
    };

    const handleUrlImport = () => {
        if (!urlInput.trim()) return;

        // Simple YouTube URL validation
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
        if (youtubeRegex.test(urlInput)) {
            onUrlSelected?.(urlInput);
            setUrlInput('');
        } else {
            showToast(t('errors.invalid_youtube_url'), 'error');
        }
    };

    return (
        <div className="document-upload-container">
            <h3 className="upload-header">{t('ai.upload_header')}</h3>

            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{ opacity: isProcessing ? 0.6 : 1, pointerEvents: isProcessing ? 'none' : 'auto' }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md"
                    disabled={isProcessing}
                />

                <div className="upload-content">
                    <div className="upload-icon-wrapper">
                        <Upload className="upload-icon" size={24} />
                    </div>
                    <p className="upload-text">
                        <Trans
                            i18nKey="ai.drag_drop"
                            components={[
                                <button type="button" className="action-link" onClick={() => inputRef.current?.click()}>text</button>
                            ]}
                        />
                    </p>
                    <p className="upload-hint">
                        {t('ai.formats')}
                    </p>
                </div>
            </div>

            <div className="upload-divider">
                <span className="divider-text">{t('ai.or')}</span>
            </div>

            <div className="url-import-section">
                <label>{t('ai.import_youtube')}</label>
                <div className="url-input-group">
                    <Input
                        placeholder={t('ai.paste_link')}
                        value={urlInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrlInput(e.target.value)}
                        disabled={isProcessing}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') handleUrlImport();
                        }}
                        containerClassName="flex-1"
                    />
                    <Button
                        variant="ghost"
                        className="btn-upload-url"
                        onClick={handleUrlImport}
                        disabled={!urlInput || isProcessing}
                    >
                        {t('ai.add_video')}
                    </Button>
                </div>
            </div>

            {children && (
                <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                    {children}
                </div>
            )}
        </div>
    );
}
