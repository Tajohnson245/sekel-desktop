import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader, FileText, CheckCircle, AlertCircle, RefreshCw, ArrowRight, Trash2, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DocumentUpload from './DocumentUpload';
import AICardGenerator from './AICardGenerator';
import { Button, YouTubeIcon, useToast, ErrorBoundary } from '../UI';
import { useDocsWorkStore } from '../../stores/docsWorkStore';
import { parseFile, parseYoutube } from '../../lib/documentParser';
import type { DocumentSection, DocumentChunk } from '../../types/electron';
import './DocumentsPage.css';

interface DocumentsPageProps {
    userId: string;
}

type ParsingStatus = 'idle' | 'parsing' | 'success' | 'error';

interface ParsedFile {
    id: string;
    name: string;
    status: ParsingStatus;
    content?: string;
    error?: string;
    type: 'file' | 'youtube';
    originalFile?: File;
    url?: string;
    thumbnail?: string;
}

interface ChapterCardProps {
    chapter: DocumentSection;
    estimatedCards: number;
    isGenerated: boolean;
    onGenerate: () => void;
}

function ChapterCard({ chapter, estimatedCards, isGenerated, onGenerate }: ChapterCardProps) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className={`chapter-card ${isGenerated ? 'is-generated' : ''}`}
            onClick={onGenerate}
            data-testid={`chapter-card-${chapter.id}`}
        >
            <div className="chapter-card__header">
                <span className="chapter-card__icon" aria-hidden="true"><BookOpen size={18} /></span>
                {isGenerated && (
                    <span className="chapter-card__status" aria-label={t('ai.chapter_generated_aria')}>
                        <CheckCircle size={16} />
                    </span>
                )}
            </div>
            <h4 className="chapter-card__title">{chapter.title}</h4>
            <div className="chapter-card__meta">
                <span>{t('ai.chapter_word_count', { words: chapter.wordCount.toLocaleString() })}</span>
                <span>{t('ai.chapter_capacity', { n: estimatedCards })}</span>
            </div>
            <span className="chapter-card__action">
                {isGenerated ? t('ai.chapter_regenerate') : t('ai.chapter_generate')}
                <ArrowRight size={14} />
            </span>
        </button>
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
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [step, setStep] = useState<'upload' | 'review' | 'generate'>('upload');
    const [contextChunks, setContextChunks] = useState<DocumentChunk[]>([]);
    const [sections, setSections] = useState<DocumentSection[]>([]);
    const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
    const [generatedChapterIds, setGeneratedChapterIds] = useState<Set<number>>(new Set());
    const [generatedCardCount, setGeneratedCardCount] = useState(0);

    useEffect(() => {
        let hasUnfinished = false;
        if (step === 'upload' && files.length > 0) hasUnfinished = true;
        if (step === 'review') hasUnfinished = true;
        if (step === 'generate' && generatedCardCount > 0) hasUnfinished = true;
        setHasUnfinishedWork(hasUnfinished);
    }, [files.length, step, generatedCardCount, setHasUnfinishedWork]);

    const isProcessing = files.some(f => f.status === 'parsing');

    const handleFilesSelected = async (selectedFiles: File[]) => {
        const newFiles: ParsedFile[] = selectedFiles.map(f => ({
            id: Math.random().toString(36).slice(2, 11),
            name: f.name,
            status: 'parsing',
            type: 'file',
            originalFile: f,
        }));

        setFiles(prev => [...prev, ...newFiles]);

        let successCount = 0;
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const fileId = newFiles[i].id;

            try {
                const result = await parseFile(file, i18n.language);

                setFiles(prev => prev.map(f => f.id === fileId ? {
                    ...f,
                    status: 'success',
                    content: result.content,
                    name: result.filename,
                } : f));
                successCount++;
            } catch (error: unknown) {
                const errCode = (error as { errorCode?: string })?.errorCode;
                let message: string;
                if (errCode === 'pdf_page_limit') {
                    const numPages = (error as { numPages?: number })?.numPages ?? 0;
                    const maxPages = (error as { maxPages?: number })?.maxPages ?? 500;
                    message = t('ai.error_pdf_too_large', { numPages, maxPages });
                } else {
                    message = t('ai.error_parsing');
                }
                showToast(`${message}: ${file.name}`, 'error');
                setFiles(prev => prev.map(f => f.id === fileId ? {
                    ...f,
                    status: 'error',
                    error: message,
                } : f));
            }
        }

        if (successCount > 0) {
            window.electronAPI?.notify?.show?.(
                t('ai.notify_upload_done_title'),
                t('ai.notify_upload_done_body'),
            );
        }
    };

    const handleUrlSelected = async (url: string) => {
        const videoIdMatch = url.match(new RegExp('(?:youtube\\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\\.be/)([^"&?/\\s]{11})'));
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : undefined;

        const newFile: ParsedFile = {
            id: Math.random().toString(36).slice(2, 11),
            name: url,
            status: 'parsing',
            type: 'youtube',
            url: url,
            thumbnail: thumbnail,
        };

        setFiles(prev => [...prev, newFile]);

        try {
            const result = await parseYoutube(url, i18n.language);

            setFiles(prev => prev.map(f => f.id === newFile.id ? {
                ...f,
                status: 'success',
                content: result.content,
                name: result.filename || f.name,
            } : f));

            window.electronAPI?.notify?.show?.(
                t('ai.notify_upload_done_title'),
                t('ai.notify_upload_done_body'),
            );
        } catch (error: unknown) {
            const errorCode = (error as { errorCode?: string })?.errorCode;
            const i18nKey = errorCode ? `errors.youtube_${errorCode}` : '';
            const message = (i18nKey && t(i18nKey) !== i18nKey) ? t(i18nKey) : t('ai.error_video');
            showToast(message, 'error');
            setFiles(prev => prev.map(f => f.id === newFile.id ? {
                ...f,
                status: 'error',
                error: message,
            } : f));
        }
    };

    const handleRemoveFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const generateContextSummary = async () => {
        const completedFiles = files.filter(f => f.status === 'success');
        if (completedFiles.length === 0) return;

        setIsGeneratingSummary(true);
        try {
            const documentsObj = completedFiles.reduce((acc, file) => {
                acc[file.name] = file.content || '';
                return acc;
            }, {} as Record<string, string>);

            const overview = await window.electronAPI.generateSummary(documentsObj, i18n.language);

            setSummaryText(overview.summary);
            setContextChunks(overview.chunks ?? []);
            setSections(overview.sections ?? []);
            setGeneratedChapterIds(new Set());
            setStep('review');

            window.electronAPI?.notify?.show?.(
                t('ai.notify_analyze_done_title'),
                t('ai.notify_analyze_done_body'),
            );
        } catch (_error) {
            showToast(t('ai.error_summary'), 'error');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleRestart = () => {
        setFiles([]);
        setSummaryText('');
        setStep('upload');
        setContextChunks([]);
        setSections([]);
        setActiveChapterId(null);
        setGeneratedChapterIds(new Set());
        setGeneratedCardCount(0);
    };

    // Chapters shown in the grid: strictly kind === 'chapter' when at least one
    // is detected, otherwise fall back to all sections (covers unstructured
    // docs, where chunkDocumentWithSections emits a single "Document content"
    // section).
    const chapterSections = useMemo(() => {
        const chapters = sections.filter((s) => s.kind === 'chapter');
        return chapters.length > 0 ? chapters : sections;
    }, [sections]);

    const filteredOutSections = useMemo(() => {
        if (chapterSections.length === sections.length) return [] as DocumentSection[];
        const includedIds = new Set(chapterSections.map((s) => s.id));
        return sections.filter((s) => !includedIds.has(s.id));
    }, [sections, chapterSections]);

    const activeChapter = useMemo(
        () => (activeChapterId == null ? null : chapterSections.find((s) => s.id === activeChapterId) ?? null),
        [activeChapterId, chapterSections],
    );

    const activeChapterChunks = useMemo<DocumentChunk[]>(() => {
        if (!activeChapter) return [];
        const allowed = new Set(activeChapter.chunkIds);
        return contextChunks.filter((c) => allowed.has(c.id));
    }, [activeChapter, contextChunks]);

    const activeChapterText = useMemo(
        () => activeChapterChunks.map((c) => c.text).join('\n\n'),
        [activeChapterChunks],
    );

    const activeChapterEstimatedCards = useMemo(
        () => Math.min(activeChapterChunks.length * 2, 500),
        [activeChapterChunks.length],
    );

    const handleChapterGenerate = (chapterId: number) => {
        setActiveChapterId(chapterId);
        setGeneratedCardCount(0);
        setStep('generate');
    };

    const handleChapterComplete = () => {
        if (activeChapterId != null) {
            setGeneratedChapterIds((prev) => {
                const next = new Set(prev);
                next.add(activeChapterId);
                return next;
            });
        }
        setActiveChapterId(null);
        setGeneratedCardCount(0);
        setStep('review');
    };

    if (step === 'generate' && activeChapter) {
        return (
            <ErrorBoundary variant="inline" onReset={handleChapterComplete}>
                <AICardGenerator
                    extractedText={activeChapterText}
                    contextSummary={summaryText}
                    contextChunks={activeChapterChunks}
                    estimatedCardCount={activeChapterEstimatedCards}
                    userId={userId}
                    onComplete={handleChapterComplete}
                    initialDeckId={initialDeckId}
                    onCardCountChange={setGeneratedCardCount}
                />
            </ErrorBoundary>
        );
    }

    const completedCount = files.filter(f => f.status === 'success').length;

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
                <p className="text-muted">{t('ai.subtitle')}</p>
            </div>

            {step === 'upload' && (
                <div className="upload-section" data-tour-id="documents-upload-zone">
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
                <div className="chapter-grid-container">
                    <div className="chapter-grid-overview">
                        <p className="chapter-grid-overview__label">{t('ai.overview_label')}</p>
                        <p className="chapter-grid-overview__text">{summaryText}</p>
                    </div>

                    {chapterSections.length === 0 ? (
                        <div className="chapter-grid-empty">{t('ai.no_chapters_found')}</div>
                    ) : (
                        <div className="chapter-grid">
                            {chapterSections.map((chapter) => (
                                <ChapterCard
                                    key={chapter.id}
                                    chapter={chapter}
                                    estimatedCards={Math.min(chapter.chunkIds.length * 2, 500)}
                                    isGenerated={generatedChapterIds.has(chapter.id)}
                                    onGenerate={() => handleChapterGenerate(chapter.id)}
                                />
                            ))}
                        </div>
                    )}

                    {filteredOutSections.length > 0 && (
                        <div className="chapter-grid-filtered">
                            <span className="chapter-grid-filtered__label">{t('ai.filtered_out_label')}</span>
                            <span className="chapter-grid-filtered__list">
                                {filteredOutSections.map((s) => s.title).join(' · ')}
                            </span>
                            <span className="chapter-grid-filtered__count">
                                {t('ai.filtered_out_count', { count: filteredOutSections.length })}
                            </span>
                        </div>
                    )}

                    <div className="chapter-grid-footer">
                        <Button variant="secondary" onClick={handleRestart} icon={<RefreshCw size={16} />}>
                            {t('ai.reupload')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
