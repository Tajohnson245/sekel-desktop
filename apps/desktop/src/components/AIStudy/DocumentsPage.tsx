import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader, FileText, CheckCircle, AlertCircle, RefreshCw, Trash2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DocumentUpload from './DocumentUpload';
import AICardGenerator, { ALL_CARD_FORMATS } from './AICardGenerator';
import { Button, Input, YouTubeIcon, useToast, ErrorBoundary } from '../UI';
import { useDocsWorkStore } from '../../stores/docsWorkStore';
import { parseFile, parseYoutube } from '../../lib/documentParser';
import type { AIGenerationOptions } from '../../hooks/useAI';
import type { DocumentSection, DocumentChunk } from '../../types/electron';
import './DocumentsPage.css';

type CardFormat = AIGenerationOptions['cardFormats'][number];

const DEFAULT_CARD_COUNT = 100;

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

type Phase = 'upload' | 'analyzing' | 'ready';

export default function DocumentsPage({ userId }: DocumentsPageProps) {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const initialDeckId = searchParams.get('deckId') || undefined;
    const setHasUnfinishedWork = useDocsWorkStore((s) => s.setHasUnfinishedWork);

    const [files, setFiles] = useState<ParsedFile[]>([]);
    const [phase, setPhase] = useState<Phase>('upload');
    const [summaryText, setSummaryText] = useState<string>('');
    const [contextChunks, setContextChunks] = useState<DocumentChunk[]>([]);
    const [sections, setSections] = useState<DocumentSection[]>([]);
    const [estimatedCardCount, setEstimatedCardCount] = useState<number>(20);
    const [generatedCardCount, setGeneratedCardCount] = useState(0);

    // Pre-flight settings: chosen on the upload page before the user clicks
    // Generate. Default to all six formats + 100 cards (the cap-aware
    // first-run default). These flow into AICardGenerator as initial state;
    // the user can still tweak them post-generation via the collapsed
    // settings panel and regenerate.
    const [selectedFormats, setSelectedFormats] = useState<Set<CardFormat>>(new Set(ALL_CARD_FORMATS));
    const [cardCount, setCardCount] = useState<number>(DEFAULT_CARD_COUNT);

    const toggleFormat = (fmt: CardFormat) => {
        setSelectedFormats(prev => {
            const next = new Set(prev);
            if (next.has(fmt)) next.delete(fmt);
            else next.add(fmt);
            return next;
        });
    };

    useEffect(() => {
        let hasUnfinished = false;
        if (phase === 'upload' && files.length > 0) hasUnfinished = true;
        if (phase === 'analyzing') hasUnfinished = true;
        if (phase === 'ready' && generatedCardCount > 0) hasUnfinished = true;
        setHasUnfinishedWork(hasUnfinished);
    }, [files.length, phase, generatedCardCount, setHasUnfinishedWork]);

    const isProcessing = files.some(f => f.status === 'parsing');

    // One-shot kickoff: after parsing completes, immediately run the analyze
    // step. No user click required — that's the whole point of this rework.
    const runAnalyze = async (parsedFiles: ParsedFile[]) => {
        const completed = parsedFiles.filter(f => f.status === 'success');
        if (completed.length === 0) return;

        // Transition synchronously so the upload zone locks before any await.
        setPhase('analyzing');

        try {
            const documentsObj = completed.reduce((acc, file) => {
                acc[file.name] = file.content || '';
                return acc;
            }, {} as Record<string, string>);

            const overview = await window.electronAPI.generateSummary(documentsObj, i18n.language);

            setSummaryText(overview.summary);
            setContextChunks(overview.chunks ?? []);
            setSections(overview.sections ?? []);
            setEstimatedCardCount(overview.estimatedCardCount);
            setPhase('ready');

            window.electronAPI?.notify?.show?.(
                t('ai.notify_analyze_done_title'),
                t('ai.notify_analyze_done_body'),
            );
        } catch (_error) {
            showToast(t('ai.error_summary'), 'error');
            // Drop back to upload so the user can retry without losing files.
            setPhase('upload');
        }
    };

    const handleFilesSelected = async (selectedFiles: File[]) => {
        if (phase !== 'upload') return;

        const newFiles: ParsedFile[] = selectedFiles.map(f => ({
            id: Math.random().toString(36).slice(2, 11),
            name: f.name,
            status: 'parsing',
            type: 'file',
            originalFile: f,
        }));

        setFiles(prev => [...prev, ...newFiles]);

        // Build a local copy alongside React state so we can hand the final
        // statuses to runAnalyze without racing the setFiles updates.
        const parsedResults: ParsedFile[] = [];
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const id = newFiles[i].id;

            try {
                const result = await parseFile(file, i18n.language);
                const updated: ParsedFile = {
                    ...newFiles[i],
                    status: 'success',
                    content: result.content,
                    name: result.filename,
                };
                setFiles(prev => prev.map(f => f.id === id ? updated : f));
                parsedResults.push(updated);
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
                const updated: ParsedFile = {
                    ...newFiles[i],
                    status: 'error',
                    error: message,
                };
                setFiles(prev => prev.map(f => f.id === id ? updated : f));
                parsedResults.push(updated);
            }
        }

        const successCount = parsedResults.filter(p => p.status === 'success').length;
        if (successCount > 0) {
            window.electronAPI?.notify?.show?.(
                t('ai.notify_upload_done_title'),
                t('ai.notify_upload_done_body'),
            );
        }
    };

    const handleUrlSelected = async (url: string) => {
        if (phase !== 'upload') return;

        const videoIdMatch = url.match(new RegExp('(?:youtube\\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\\.be/)([^"&?/\\s]{11})'));
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : undefined;

        const newFile: ParsedFile = {
            id: Math.random().toString(36).slice(2, 11),
            name: url,
            status: 'parsing',
            type: 'youtube',
            url,
            thumbnail,
        };

        setFiles(prev => [...prev, newFile]);

        try {
            const result = await parseYoutube(url, i18n.language);
            const updated: ParsedFile = {
                ...newFile,
                status: 'success',
                content: result.content,
                name: result.filename || newFile.name,
            };
            setFiles(prev => prev.map(f => f.id === newFile.id ? updated : f));

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

    const handleGenerateClick = async () => {
        const completed = files.filter(f => f.status === 'success');
        if (completed.length === 0 || selectedFormats.size === 0 || cardCount <= 0) return;
        await runAnalyze(completed);
    };

    const handleRestart = () => {
        setFiles([]);
        setSummaryText('');
        setContextChunks([]);
        setSections([]);
        setEstimatedCardCount(20);
        setGeneratedCardCount(0);
        setPhase('upload');
        setSelectedFormats(new Set(ALL_CARD_FORMATS));
        setCardCount(DEFAULT_CARD_COUNT);
    };

    // Restrict to content-classified chapter sections when the chunker
    // detected them. For unstructured docs (no chapter sections), the whole
    // document flows through.
    const contentChunks = useMemo<DocumentChunk[]>(() => {
        const chapters = sections.filter(s => s.kind === 'chapter');
        if (chapters.length === 0) return contextChunks;
        const allowed = new Set(chapters.flatMap(c => c.chunkIds));
        return contextChunks.filter(c => allowed.has(c.id));
    }, [sections, contextChunks]);

    const contentText = useMemo(
        () => contentChunks.map(c => c.text).join('\n\n'),
        [contentChunks],
    );

    if (phase === 'ready') {
        return (
            <ErrorBoundary variant="inline" onReset={handleRestart}>
                <AICardGenerator
                    extractedText={contentText}
                    contextSummary={summaryText}
                    contextChunks={contentChunks}
                    estimatedCardCount={estimatedCardCount}
                    userId={userId}
                    onComplete={handleRestart}
                    initialDeckId={initialDeckId}
                    onCardCountChange={setGeneratedCardCount}
                    autoStart
                    defaultFormats={Array.from(selectedFormats) as AIGenerationOptions['cardFormats']}
                    initialCardCount={cardCount}
                />
            </ErrorBoundary>
        );
    }

    const completedCount = files.filter(f => f.status === 'success').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    const hasVideos = files.some(f => f.type === 'youtube');
    const hasDocs = files.some(f => f.type === 'file');

    let itemsLabel = t('ai.items');
    if (hasVideos && !hasDocs) itemsLabel = t('ai.videos');
    else if (!hasVideos && hasDocs) itemsLabel = t('ai.documents');
    else if (hasVideos && hasDocs) itemsLabel = t('ai.content');

    return (
        <div className="documents-page">
            <div className="documents-header">
                <h2>{t('ai.title')}</h2>
                <p className="text-muted">{t('ai.subtitle')}</p>
            </div>

            {phase === 'upload' && (
                <div className="documents-page__upload-grid">
                    {/* Left column — pre-flight generation settings */}
                    <aside className="preflight-settings">
                        <h3 className="preflight-settings__title">{t('ai.generation_options')}</h3>

                        <div className="preflight-settings__section">
                            <Input
                                type="number"
                                label={t('ai.cards_to_generate')}
                                min={1}
                                max={500}
                                value={cardCount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardCount(Number(e.target.value))}
                            />
                            <p className="preflight-settings__hint">{t('ai.preflight_count_hint')}</p>
                        </div>

                        <div className="preflight-settings__section">
                            <label className="ai-format-picker__label">{t('ai.card_format')}</label>
                            <div className="ai-format-picker__pills" role="group" aria-label={t('ai.card_format')}>
                                {([
                                    { value: 'basic',            label: t('ai.format_basic') },
                                    { value: 'cloze',            label: t('ai.format_cloze') },
                                    { value: 'reversed',         label: t('ai.format_reversed') },
                                    { value: 'true-false',       label: t('ai.format_true_false') },
                                    { value: 'compare-contrast', label: t('ai.format_compare_contrast') },
                                    { value: 'multiple-choice',  label: t('ai.format_multiple_choice') },
                                ] as const).map((opt) => {
                                    const active = selectedFormats.has(opt.value);
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`ai-format-pill${active ? ' ai-format-pill--active' : ''}`}
                                            onClick={() => toggleFormat(opt.value)}
                                            aria-pressed={active}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="preflight-settings__hint">{t('ai.preflight_formats_hint')}</p>
                        </div>
                    </aside>

                    {/* Right column — upload zone + file list + Generate CTA */}
                    <section className="upload-column" data-tour-id="documents-upload-zone">
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
                                </div>
                            )}
                        </DocumentUpload>

                        <div className="generate-cta">
                            <Button
                                variant="primary"
                                onClick={handleGenerateClick}
                                disabled={isProcessing || completedCount === 0 || selectedFormats.size === 0 || cardCount <= 0}
                                icon={<Sparkles size={16} />}
                                title={
                                    completedCount === 0 ? t('ai.preflight_need_files')
                                    : selectedFormats.size === 0 ? t('ai.preflight_need_formats')
                                    : undefined
                                }
                            >
                                {t('ai.generate_button')}
                            </Button>
                        </div>
                    </section>
                </div>
            )}

            {phase === 'analyzing' && (
                <div className="pipeline-stepper" role="status" aria-live="polite">
                    <ol className="pipeline-stepper__steps">
                        <li className="pipeline-stepper__step is-done">
                            <span className="pipeline-stepper__marker"><CheckCircle size={18} /></span>
                            <span className="pipeline-stepper__label">{t('ai.pipeline_parsed', { count: completedCount })}</span>
                        </li>
                        <li className="pipeline-stepper__step is-active">
                            <span className="pipeline-stepper__marker"><Loader className="animate-spin" size={18} /></span>
                            <span className="pipeline-stepper__label">{t('ai.pipeline_analyzing')}</span>
                        </li>
                        <li className="pipeline-stepper__step">
                            <span className="pipeline-stepper__marker pipeline-stepper__marker--dot" aria-hidden="true" />
                            <span className="pipeline-stepper__label">{t('ai.pipeline_generating')}</span>
                        </li>
                    </ol>
                    {errorCount > 0 && (
                        <p className="pipeline-stepper__warn">
                            {t('ai.pipeline_skipped_failed', { count: errorCount })}
                        </p>
                    )}
                    <Button variant="secondary" onClick={handleRestart} icon={<RefreshCw size={14} />}>
                        {t('ai.cancel_pipeline')}
                    </Button>
                </div>
            )}
        </div>
    );
}
