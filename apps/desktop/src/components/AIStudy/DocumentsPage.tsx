import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader, FileText, CheckCircle, AlertCircle, RefreshCw, ArrowRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DocumentUpload from './DocumentUpload';
import AICardGenerator from './AICardGenerator';
import { Button, MetaChip, YouTubeIcon, useToast, ErrorBoundary } from '../UI';
import { useDocsWorkStore } from '../../stores/docsWorkStore';
import { parseFile, parseYoutube } from '../../lib/documentParser';
import './DocumentsPage.css';

interface DocumentsPageProps {
    userId: string;
}

type ParsingStatus = 'idle' | 'parsing' | 'success' | 'error';

interface ParsedFile {
    id: string; // Unique identifier for React keys
    name: string;
    status: ParsingStatus;
    content?: string;
    error?: string;
    type: 'file' | 'youtube';
    originalFile?: File; // Only for files
    url?: string;        // Only for YouTube
    thumbnail?: string;  // Only for YouTube
}

interface SectionItemProps {
    index: number;
    label: string;
}

function SectionItem({ index, label }: SectionItemProps) {
    return (
        <div className="section-item">
            <span className="section-item__number">{index + 1}</span>
            <span className="section-item__dot" />
            <span className="section-item__label">{label}</span>
        </div>
    );
}

export default function DocumentsPage({ userId }: DocumentsPageProps) {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const initialDeckId = searchParams.get('deckId') || undefined;
    const setHasUnfinishedWork = useDocsWorkStore((s) => s.setHasUnfinishedWork);
    const [files, setFiles] = useState<ParsedFile[]>([]);
    const [summaryText, setSummaryText] = useState<string>('');
    const [summaryTopics, setSummaryTopics] = useState<string[]>([]);
    const [estimatedCardCount, setEstimatedCardCount] = useState<number>(5);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [step, setStep] = useState<'upload' | 'review' | 'generate'>('upload');
    const [fullContextContent, setFullContextContent] = useState<string>('');
    const [contextChunks, setContextChunks] = useState<Array<{ id: number; text: string }>>([]);
    const [generatedCardCount, setGeneratedCardCount] = useState(0);

    // Notify parent about unfinished work status
    useEffect(() => {
        // Unfinished work is:
        // 1. Files uploaded but not generated (step 'upload', 'review')
        // 2. Cards generated but not added/discarded (step 'generate' AND card count > 0)

        let hasUnfinished = false;
        if (step === 'upload' && files.length > 0) hasUnfinished = true;
        if (step === 'review') hasUnfinished = true;
        if (step === 'generate' && generatedCardCount > 0) hasUnfinished = true;

        setHasUnfinishedWork(hasUnfinished);
    }, [files.length, step, generatedCardCount, setHasUnfinishedWork]);

    const isProcessing = files.some(f => f.status === 'parsing');

    // Process selected files via backend parser
    const handleFilesSelected = async (selectedFiles: File[]) => {
        const newFiles: ParsedFile[] = selectedFiles.map(f => ({
            id: Math.random().toString(36).substr(2, 9),
            name: f.name,
            status: 'parsing',
            type: 'file',
            originalFile: f
        }));

        setFiles(prev => [...prev, ...newFiles]);

        // Process files
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const fileId = newFiles[i].id;

            try {
                const result = await parseFile(file, i18n.language);

                setFiles(prev => prev.map(f => f.id === fileId ? {
                    ...f,
                    status: 'success',
                    content: result.content,
                    name: result.filename
                } : f));
            } catch (_error) {
                showToast(`${t('ai.error_parsing')}: ${file.name}`, 'error');
                setFiles(prev => prev.map(f => f.id === fileId ? {
                    ...f,
                    status: 'error',
                    error: t('ai.error_parsing')
                } : f));
            }
        }
    };

    const handleUrlSelected = async (url: string) => {
        // Extract video ID for thumbnail
        const videoIdMatch = url.match(new RegExp('(?:youtube\\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\\.be/)([^"&?/\\s]{11})'));
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : undefined;

        const newFile: ParsedFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: url, // Temporary name until parsed
            status: 'parsing',
            type: 'youtube',
            url: url,
            thumbnail: thumbnail
        };

        setFiles(prev => [...prev, newFile]);

        try {
            const result = await parseYoutube(url, i18n.language); // Backend fetches title and transcript

            setFiles(prev => prev.map(f => f.id === newFile.id ? {
                ...f,
                status: 'success',
                content: result.content,
                name: result.filename || f.name
            } : f));
        } catch (error: unknown) {
            const errorCode = (error as { errorCode?: string })?.errorCode;
            const i18nKey = errorCode ? `errors.youtube_${errorCode}` : '';
            const message = (i18nKey && t(i18nKey) !== i18nKey) ? t(i18nKey) : t('ai.error_video');
            showToast(message, 'error');
            setFiles(prev => prev.map(f => f.id === newFile.id ? {
                ...f,
                status: 'error',
                error: message
            } : f));
        }
    };

    const handleRemoveFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    // Request AI summary for all successfully parsed documents
    const generateContextSummary = async () => {
        const completedFiles = files.filter(f => f.status === 'success');
        if (completedFiles.length === 0) return;

        setIsGeneratingSummary(true);
        try {
            const documentsObj = completedFiles.reduce((acc, file) => {
                acc[file.name] = file.content || '';
                return acc;
            }, {} as Record<string, string>);

            const combinedContent = Object.entries(documentsObj)
                .map(([name, content]) => `--- Document: ${name} ---\n${content}`)
                .join('\n\n');
            setFullContextContent(combinedContent);

            const overview = await window.electronAPI.generateSummary(documentsObj, i18n.language);

            setSummaryText(overview.summary);
            setSummaryTopics(overview.topics);
            setEstimatedCardCount(overview.estimatedCardCount);
            setContextChunks(overview.chunks ?? []);
            setStep('review');
        } catch (_error) {
            showToast(t('ai.error_summary'), 'error');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleConfirmSummary = () => {
        setStep('generate');
    };

    const handleRestart = () => {
        setFiles([]);
        setSummaryText('');
        setSummaryTopics([]);
        setEstimatedCardCount(5);
        setStep('upload');
        setFullContextContent('');
        setContextChunks([]);
    };

    if (step === 'generate') {
        return (
            <ErrorBoundary variant="inline" onReset={handleRestart}>
                <AICardGenerator
                    extractedText={fullContextContent}
                    contextSummary={summaryText}
                    contextChunks={contextChunks}
                    estimatedCardCount={estimatedCardCount}
                    userId={userId}
                    onComplete={handleRestart}
                    initialDeckId={initialDeckId}
                    onCardCountChange={setGeneratedCardCount}
                />
            </ErrorBoundary>
        );
    }

    const completedCount = files.filter(f => f.status === 'success').length;

    // Determine context for UI labels
    const hasVideos = files.some(f => f.type === 'youtube');
    const hasDocs = files.some(f => f.type === 'file');

    let itemsLabel = t('ai.items');
    if (hasVideos && !hasDocs) itemsLabel = t('ai.videos');
    else if (!hasVideos && hasDocs) itemsLabel = t('ai.documents');
    else if (hasVideos && hasDocs) itemsLabel = t('ai.content');

    let actionLabel = t('ai.analyze');
    if (hasVideos && !hasDocs) actionLabel = t('ai.process_video');
    else if (hasVideos && hasDocs) actionLabel = t('ai.process_content');

    return (
        <div className="documents-page">
            <div className="documents-header">
                <h2>{t('ai.title')}</h2>
                <p className="text-muted">
                    {t('ai.subtitle')}
                </p>
            </div>

            {step === 'upload' && (
                <div className="upload-section">
                    <DocumentUpload
                        onFilesSelected={handleFilesSelected}
                        onUrlSelected={handleUrlSelected}
                        isProcessing={isProcessing}
                    >
                        {files.length > 0 && (
                            <div className="files-list">
                                <h4>{t('ai.processed', { label: itemsLabel })} ({completedCount}/{files.length})</h4>
                                <div className="files-grid" style={{ marginTop: '1.5rem' }}>
                                    {files.map((f, idx) => (
                                        <div key={f.id} className={`file-status-item ${f.status}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--bg)', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border-color, #eee)' }}>
                                            {f.type === 'youtube' && f.thumbnail ? (
                                                <div style={{ width: '60px', height: '45px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                                                    <img src={f.thumbnail} alt="Video thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                                                        <YouTubeIcon size={16} color="white" />
                                                    </div>
                                                </div>
                                            ) : (
                                                f.type === 'youtube' ? <div style={{ padding: '8px' }}><YouTubeIcon size={24} color="#FF0000" /></div>
                                                    : <div style={{ padding: '8px' }}><FileText size={24} color="#555" /></div>
                                            )}

                                            <div className="file-info" style={{ flex: 1, overflow: 'hidden' }}>
                                                <span className="file-name" style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</span>
                                                {f.status === 'error' && <span className="error-text" style={{ color: 'red', fontSize: '12px' }}>{f.error}</span>}
                                                {f.status === 'parsing' && <span className="status-text" style={{ fontSize: '12px', color: '#666' }}>{t('ai.processing')}</span>}
                                            </div>

                                            <div className="file-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {f.status === 'parsing' && <Loader className="animate-spin" size={20} />}
                                                {f.status === 'success' && <CheckCircle size={20} color="green" />}
                                                {f.status === 'error' && <AlertCircle size={20} color="red" />}
                                                <button
                                                    onClick={() => handleRemoveFile(idx)}
                                                    className="btn-icon"
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', opacity: 0.7 }}
                                                    title={t('modals.remove_tooltip')}
                                                >
                                                    <Trash2 size={18} color="#888" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="actions-bar" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        variant="primary"
                                        disabled={completedCount === 0 || isProcessing || isGeneratingSummary}
                                        onClick={generateContextSummary}
                                        isLoading={isGeneratingSummary}
                                        icon={!isGeneratingSummary && <ArrowRight size={18} />}
                                    >
                                        {isGeneratingSummary ? t('ai.analyzing') : actionLabel}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DocumentUpload>
                </div>
            )}

            {step === 'review' && (
                <div className="review-split-container">
                    <aside className="review-sidebar">
                        <p className="review-sidebar__heading">{t('ai.sections_label')}</p>
                        <div className="review-sidebar__list">
                            {summaryTopics.map((topic, i) => (
                                <SectionItem
                                    key={i}
                                    index={i}
                                    label={topic}
                                />
                            ))}
                        </div>
                    </aside>

                    <div className="review-main">
                        <div className="review-meta-row">
                            <MetaChip label={t('ai.chip_sections')} value={summaryTopics.length} />
                            <MetaChip label={t('ai.chip_cards')} value={`~${estimatedCardCount}`} />
                        </div>
                        <p className="review-summary-label">{t('ai.review_title')}</p>
                        <div className="review-summary-readonly">{summaryText}</div>
                    </div>

                    <div className="review-footer">
                        <Button variant="secondary" onClick={handleRestart} icon={<RefreshCw size={16} />}>
                            {t('ai.reupload')}
                        </Button>
                        <Button variant="primary" onClick={handleConfirmSummary} icon={<ArrowRight size={16} />}>
                            {t('ai.confirm_generate')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
