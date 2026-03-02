import { useState, useRef, ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { Trans, useTranslation } from '../../../node_modules/react-i18next';
import { Button, Input } from '../UI';

interface DocumentUploadProps {
    onTextExtracted?: (text: string) => void;
    onFilesSelected?: (files: File[]) => void;
    onUrlSelected?: (url: string) => void;
    isProcessing?: boolean;
    children?: ReactNode;
}

export default function DocumentUpload({ onFilesSelected, onUrlSelected, isProcessing = false, children }: DocumentUploadProps) {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [urlInput, setUrlInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const validFiles = Array.from(files);
        if (onFilesSelected) {
            onFilesSelected(validFiles);
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
            if (onUrlSelected) {
                onUrlSelected(urlInput);
            } else {
                console.warn("onUrlSelected not implemented");
            }
            setUrlInput('');
        } else {
            alert("Please enter a valid YouTube URL");
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
                    accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.png,.jpg,.jpeg,.webp"
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
                                <span className="action-link" onClick={() => inputRef.current?.click()}>text</span>
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
