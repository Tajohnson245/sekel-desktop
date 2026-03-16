import { useState, useEffect } from 'react';
import { Loader, FileText, CheckCircle, AlertCircle, RefreshCw, ArrowRight, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DocumentUpload from './DocumentUpload';
import AICardGenerator from './AICardGenerator';
import { Button } from '../UI/Button';
import { YouTubeIcon } from '../UI/Icons';
import { parseFile, parseYoutube } from '../../lib/documentParser';
import './DocumentsPage.css';

interface DocumentsPageProps {
    userId: string;
    initialDeckId?: string;
    onUnfinishedWorkChange?: (hasWork: boolean) => void;
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

export default function DocumentsPage({ userId, initialDeckId, onUnfinishedWorkChange }: DocumentsPageProps) {
    const { t, i18n } = useTranslation();
    const [files, setFiles] = useState<ParsedFile[]>([]);
    const [summaryText, setSummaryText] = useState<string>('');
    const [summaryTopics, setSummaryTopics] = useState<string[]>([]);
    const [estimatedCardCount, setEstimatedCardCount] = useState<number>(5);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [step, setStep] = useState<'upload' | 'review' | 'generate'>('upload');
    const [fullContextContent, setFullContextContent] = useState<string>('');
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

        onUnfinishedWorkChange?.(hasUnfinished);
    }, [files.length, step, generatedCardCount, onUnfinishedWorkChange]);

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
            } catch (error) {
                console.error(`Error parsing ${file.name}`, error);
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
        } catch (error) {
            console.error(`Error parsing YouTube URL ${url}:`, error);
            setFiles(prev => prev.map(f => f.id === newFile.id ? {
                ...f,
                status: 'error',
                error: t('ai.error_video')
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
            setStep('review');
        } catch (error) {
            console.error("Error generating summary:", error);
            alert(t('ai.error_summary'));
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
    };

    if (step === 'generate') {
        return (
            <AICardGenerator
                extractedText={fullContextContent}
                contextSummary={summaryText}
                estimatedCardCount={estimatedCardCount}
                userId={userId}
                onComplete={handleRestart}
                initialDeckId={initialDeckId}
                onCardCountChange={setGeneratedCardCount}
            />
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
                <div className="summary-review-section">
                    <h3>{t('ai.review_title')}</h3>
                    <p className="description">
                        {t('ai.review_desc')}
                    </p>

                    {summaryTopics.length > 0 && (
                        <ul style={{ margin: '0 0 12px', paddingLeft: '20px', color: 'var(--text-muted, #666)', fontSize: '14px' }}>
                            {summaryTopics.map((topic, i) => <li key={i}>{topic}</li>)}
                        </ul>
                    )}

                    <div className="summary-editor">
                        <textarea
                            value={summaryText}
                            onChange={(e) => setSummaryText(e.target.value)}
                            rows={15}
                            className="summary-textarea"
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'monospace' }}
                        />
                    </div>

                    <div className="review-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                        <button className="btn btn-secondary" onClick={handleRestart} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <RefreshCw size={16} /> {t('ai.reupload')}
                        </button>
                        <button className="btn btn-primary" onClick={handleConfirmSummary} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {t('ai.confirm_generate')} <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
