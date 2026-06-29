/**
 * Document Parsing Logic (Backend)
 * 
 * This file handles parsing of various document formats (PDF, DOCX, PPTX, XLSX, Images)
 * and generates summaries using OpenAI.
 */

import { instrumentedHandle, trackedCompletion, createLogger, consoleTransport } from '@sekel/observability';
import { OpenAI } from "openai";

const log = createLogger({ module: 'document-parsing', transports: [consoleTransport] });
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
    YoutubeTranscript,
    YoutubeTranscriptError,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptVideoUnavailableError,
    YoutubeTranscriptTooManyRequestError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
} from 'youtube-transcript';
const pdfParse = require('pdf-parse');
import { stripMarkdown } from '../lib/stringUtils';
import {
    chunkDocumentWithSections,
    sampleChunksForOverview,
    type Chunk,
    type DocumentSection,
} from '../lib/textChunker';

// Hard cap on pages parsed from a PDF. pdf-parse honors this via its `max`
// option — pages beyond this index are skipped entirely (not extracted, not
// summarized, not chunked). Large textbooks get a consistent first-N-pages
// experience instead of unbounded processing time.
export const MAX_PDF_PAGES = 500;

// YouTube guardrails
const YOUTUBE_MAX_DURATION_SECONDS = 7200;          // 2 hours
const YOUTUBE_MAX_TRANSCRIPT_CHARS = 50_000;        // ~12,500 words
const YOUTUBE_ALLOWED_PARAMS = new Set(['v', 'si', 't', 'list']);

class YoutubeValidationError extends Error {
    constructor(public errorCode: string, message: string) {
        super(message);
        this.name = 'YoutubeValidationError';
    }
}

class PdfPageLimitError extends Error {
    constructor(public numPages: number, public maxPages: number) {
        super(`PDF has ${numPages} pages; maximum supported is ${maxPages}.`);
        this.name = 'PdfPageLimitError';
    }
}

// Lazy-initialize OpenAI client (avoids crash on startup when key is absent)
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!_openai) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing OPENAI_API_KEY. Set it in your .env.local file.');
        }
        _openai = new OpenAI({ apiKey });
    }
    return _openai;
}

export const setupDocumentHandlers = () => {
    // Handle document parsing requests from renderer
    instrumentedHandle('parse-document', async (event, file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => {
        try {
            if (file.type === 'youtube' && file.url) {
                const { title, text } = await parseYoutubeVideo(file.url);
                // Rollback path: restore summarizeDocumentContent here to return to
                // summary-based parsing. Downstream accepts either raw text or summary.
                return buildParseResponse(title, text);
            }

            if (!file.buffer) {
                throw new Error("File buffer is missing for non-YouTube file");
            }
            const buffer = Buffer.from(file.buffer);
            const extension = file.name.split('.').pop()?.toLowerCase();

            let extractedText = '';

            // Select parsing strategy based on file extension
            switch (extension) {
                case 'pdf':
                case 'png':
                case 'jpg':
                case 'jpeg':
                case 'gif':
                case 'webp':
                    extractedText = await parseWithOpenAIVision(file.name, buffer, extension);
                    break;
                case 'docx':
                    extractedText = await parseDocx(buffer);
                    break;
                case 'pptx':
                    extractedText = await parsePptx(buffer);
                    break;
                case 'xlsx':
                case 'xls':
                case 'csv':
                    extractedText = await parseXlsx(buffer);
                    break;
                case 'txt':
                case 'md':
                case 'tsv':
                    extractedText = buffer.toString('utf-8');
                    break;
                default:
                    throw new Error(`Unsupported file type: .${extension}`);
            }

            // Rollback path: restore summarizeDocumentContent here to return to
            // summary-based parsing. Downstream accepts either raw text or summary.
            return buildParseResponse(file.name, extractedText);

        } catch (error) {
            console.error(`Error parsing ${file.name}:`, error);
            if (error instanceof YoutubeValidationError) {
                // Encode errorCode in the message so it survives Electron IPC serialization
                // Format: [YOUTUBE_ERROR:code] message
                throw new Error(`[YOUTUBE_ERROR:${error.errorCode}] ${error.message}`);
            }
            if (error instanceof PdfPageLimitError) {
                // Format: [PDF_PAGE_LIMIT:numPages:maxPages] message
                throw new Error(`[PDF_PAGE_LIMIT:${error.numPages}:${error.maxPages}] ${error.message}`);
            }
            throw error;
        }
    });

    // Handle global summary generation for multiple documents
    instrumentedHandle('generate-summary', async (_event, documents: Record<string, string>, language: string = 'English') => {
        return generateGlobalSummary(documents, language);
    });
};

// Use OpenAI Vision for Images, local PDF parser for PDFs
export async function parseWithOpenAIVision(filename: string, buffer: Buffer, extension: string): Promise<string> {
    const base64 = buffer.toString('base64');

    // For images, use Vision API
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
        const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            {
                type: "text",
                text: "Please extract all text, data, and visual content from this file. Preserve the logical structure."
            },
            {
                type: "image_url",
                image_url: {
                    url: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${base64}`,
                    detail: "high"
                }
            }
        ];

        const response = await trackedCompletion({
            operation: 'parse-image',
            logger: log,
            call: getOpenAI().chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content }],
                max_tokens: 4000,
            }),
        });

        return response.choices[0].message.content || "";
    } else if (extension === 'pdf') {
        return parsePdfLocal(buffer);
    }

    return "";
}

// Extract text from PDF, with an up-front page count check.
//
// First call: `{ max: 1 }` — pdf-parse still reports `numpages` from the PDF
// catalog while only rendering the first page, so this is a cheap probe.
// If the document exceeds MAX_PDF_PAGES, throw PdfPageLimitError so the
// renderer can show a clear upload-time message instead of silently
// processing only the first N pages.
//
// Second call: render up to MAX_PDF_PAGES for documents that pass the probe.
export async function parsePdfLocal(buffer: Buffer): Promise<string> {
    const probe = await pdfParse(buffer, { max: 1 });
    if (probe.numpages > MAX_PDF_PAGES) {
        throw new PdfPageLimitError(probe.numpages, MAX_PDF_PAGES);
    }
    const data = await pdfParse(buffer, { max: MAX_PDF_PAGES });
    return data.text;
}

// Extract text from DOCX using mammoth
export async function parseDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

// Extract text from PPTX slides using JSZip and XML parsing
export async function parsePptx(buffer: Buffer): Promise<string> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);
    const parser = new XMLParser();
    let text = "";

    // Filter for slide XML files
    const slideFiles = Object.keys(zip.files).filter(f => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"));

    // Sort slides by number
    slideFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        return numA - numB;
    });

    // Extract text from each slide
    for (const slide of slideFiles) {
        const content = await zip.file(slide)?.async("string");
        if (content) {
            const parsed = parser.parse(content);
            text += `\n--- Slide ${slide} ---\n` + extractValuesByKey(parsed, "a:t").join(" ") + "\n";
        }
    }
    return text;
}

// Extract text/CSV from Excel sheets
export function parseXlsx(buffer: Buffer): Promise<string> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = "";
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += `\n--- Sheet: ${sheetName} ---\n`;
        text += XLSX.utils.sheet_to_csv(sheet);
    });
    return Promise.resolve(text);
}

// Recursively find values by key in an object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractValuesByKey(obj: any, key: string): string[] {
    let values: string[] = [];
    if (!obj) return values;
    if (typeof obj === 'object') {
        for (const k in obj) {
            if (k === key) {
                if (typeof obj[k] === 'string' || typeof obj[k] === 'number') {
                    values.push(String(obj[k]));
                } else if (Array.isArray(obj[k])) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    obj[k].forEach((val: any) => values.push(String(val)));
                } else if (typeof obj[k] === 'object' && obj[k]['#text']) {
                    values.push(String(obj[k]['#text']));
                }
            } else {
                values = values.concat(extractValuesByKey(obj[k], key));
            }
        }
    } else if (Array.isArray(obj)) {
        obj.forEach(item => values = values.concat(extractValuesByKey(item, key)));
    }
    return values;
}

// Build the parse-document IPC response. No truncation — full extracted text
// flows downstream; the renderer's section classifier handles relevance.
function buildParseResponse(filename: string, extractedText: string): {
    filename: string;
    content: string;
} {
    return { filename, content: extractedText };
}

// Summarize a single document's content. No longer called from parse-document
// (the pipeline now passes raw text through); kept for the rollback escape
// hatch documented in the parse-document handler, and for potential future
// preview-style features.
export async function summarizeDocumentContent(filename: string, content: string, language: string = 'English'): Promise<string> {
    const response = await trackedCompletion({
        operation: 'summarize',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a document analyzer. Extract key concepts, definitions, and important facts from the text. Preserve logical structure. Output clean human readable PLAIN TEXT without markdown formatting (no #, **, _, etc.). Use indentation for hierarchy. Output summary in ${language}.`
                },
                {
                    role: "user",
                    content: `Document: ${filename}\n\nContent:\n${content.substring(0, 100000)}`
                }
            ]
        }),
    });
    const rawContent = response.choices[0].message.content || "";
    return stripMarkdown(rawContent);
}

function validateAndCanonicalizeYoutubeUrl(rawUrl: string): string {
    let urlStr = rawUrl.trim();
    if (!/^https?:\/\//i.test(urlStr)) {
        urlStr = `https://${urlStr}`;
    }

    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        throw new YoutubeValidationError('invalid_url', 'Could not parse YouTube URL.');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const trusted = ['youtube.com', 'm.youtube.com', 'youtu.be'];
    if (!trusted.includes(hostname)) {
        throw new YoutubeValidationError('invalid_domain', `Untrusted domain: ${parsed.hostname}`);
    }

    // Extract video ID
    let videoId: string | null = null;
    if (hostname === 'youtu.be') {
        videoId = parsed.pathname.slice(1).split('/')[0] || null;
    } else {
        videoId = parsed.searchParams.get('v');
        if (!videoId) {
            const pathMatch = parsed.pathname.match(/^\/(?:embed|v|shorts)\/([^/]+)/);
            if (pathMatch) videoId = pathMatch[1];
        }
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        throw new YoutubeValidationError('invalid_video_id', 'Could not extract a valid video ID.');
    }

    // Check for unexpected query params
    for (const key of parsed.searchParams.keys()) {
        if (!YOUTUBE_ALLOWED_PARAMS.has(key)) {
            throw new YoutubeValidationError('suspicious_params', `Unexpected query parameter: ${key}`);
        }
    }

    return `https://www.youtube.com/watch?v=${videoId}`;
}

function mapYoutubeTranscriptError(e: unknown): YoutubeValidationError {
    if (e instanceof YoutubeTranscriptDisabledError) {
        return new YoutubeValidationError('transcript_disabled', 'Captions are disabled for this video.');
    }
    if (e instanceof YoutubeTranscriptVideoUnavailableError) {
        return new YoutubeValidationError('video_unavailable', 'This video is unavailable.');
    }
    if (e instanceof YoutubeTranscriptTooManyRequestError) {
        return new YoutubeValidationError('rate_limited', 'YouTube is rate-limiting requests.');
    }
    if (e instanceof YoutubeTranscriptNotAvailableLanguageError) {
        return new YoutubeValidationError('language_not_available', 'Transcript not available in this language.');
    }
    if (e instanceof YoutubeTranscriptNotAvailableError) {
        return new YoutubeValidationError('transcript_not_available', 'No transcript available for this video.');
    }
    if (e instanceof YoutubeTranscriptError) {
        return new YoutubeValidationError('transcript_not_available', e.message);
    }
    return new YoutubeValidationError('network_error', 'Failed to connect to YouTube.');
}

async function fetchVideoTitle(canonicalUrl: string): Promise<string> {
    try {
        const response = await fetch(canonicalUrl);
        const html = await response.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
            return titleMatch[1].replace(' - YouTube', '');
        }
    } catch (e) {
        console.warn("Failed to fetch video title", e);
    }
    return "YouTube Video";
}

async function parseYoutubeVideo(rawUrl: string): Promise<{ title: string, text: string }> {
    // 1. Validate & canonicalize — never pass raw input downstream
    const canonicalUrl = validateAndCanonicalizeYoutubeUrl(rawUrl);

    // 2. Fetch transcript (using canonical URL)
    let transcriptItems;
    try {
        transcriptItems = await YoutubeTranscript.fetchTranscript(canonicalUrl);
    } catch (e) {
        throw mapYoutubeTranscriptError(e);
    }

    // 3. Check video duration from transcript metadata
    if (transcriptItems.length > 0) {
        const lastItem = transcriptItems[transcriptItems.length - 1];
        const totalDuration = lastItem.offset + lastItem.duration;
        if (totalDuration > YOUTUBE_MAX_DURATION_SECONDS) {
            throw new YoutubeValidationError(
                'video_too_long',
                `Video is ${Math.round(totalDuration / 60)} minutes. Maximum is ${YOUTUBE_MAX_DURATION_SECONDS / 60} minutes.`
            );
        }
    }

    // 4. Join text & enforce transcript length cap
    let text = transcriptItems.map(item => item.text).join(' ');
    if (text.length > YOUTUBE_MAX_TRANSCRIPT_CHARS) {
        console.warn(`Transcript truncated from ${text.length} to ${YOUTUBE_MAX_TRANSCRIPT_CHARS} chars`);
        text = text.substring(0, YOUTUBE_MAX_TRANSCRIPT_CHARS);
    }

    // 5. Fetch title (using canonical URL)
    const title = await fetchVideoTitle(canonicalUrl);

    // TODO: Content category soft-warning — requires YouTube Data API key for category lookup

    return { title, text };
}

// Generate a structured overview across all parsed documents.
//
// Pipeline:
//   A. Local deterministic chunking with section detection (no LLM). Returns
//      both flat chunks (for downstream per-chunk card generation) and
//      sections (chunks grouped by detected chapter/section headings, with
//      content-type classification driving the section picker's default
//      selection state).
//   B. Sampled overview LLM call — receives a representative subset of chunks
//      plus the first sentence of every chunk, returns summary + topics. The
//      renderer's section picker replaces the topic list as the primary UI
//      affordance; topics are kept for backward compat and any non-picker
//      callers.
//
// estimatedCardCount is derived locally from chunk count.
export async function generateGlobalSummary(
    documents: Record<string, string>,
    language: string = 'English',
): Promise<{
    summary: string;
    topics: string[];
    estimatedCardCount: number;
    chunks: Chunk[];
    sections: DocumentSection[];
}> {
    // Phase A — local section-aware chunking.
    const combined = Object.entries(documents)
        .map(([name, content]) => `--- File: ${name} ---\n\n${content}\n\n`)
        .join('\n\n');

    const { chunks: allChunks, sections } = chunkDocumentWithSections(combined);
    if (allChunks.length === 0) {
        return { summary: '', topics: [], estimatedCardCount: 5, chunks: [], sections: [] };
    }

    // Phase B — sampled overview LLM call.
    const sampledChunks = sampleChunksForOverview(allChunks, 25);
    const chunkPreviewTitles = allChunks
        .map((c, i) => `${i + 1}. ${firstSentence(c.text)}`)
        .join('\n');

    const userContent = [
        '=== Document overview ===',
        `Total chunks: ${allChunks.length}`,
        `Detected sections: ${sections.length}`,
        '',
        'Chunk preview titles (first sentence of each chunk):',
        chunkPreviewTitles,
        '',
        '=== Sampled representative chunks ===',
        ...sampledChunks.map(c => `[Chunk ${c.id}]\n${c.text}`),
    ].join('\n\n');

    const response = await trackedCompletion({
        operation: 'global-summary',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a study assistant analyzing documents for flashcard generation.

You will receive a sample of chunks from a larger document plus the first-sentence preview of every chunk.

Return JSON with:
1. "summary": 2-3 sentences in ${language} describing what the document covers end-to-end. Use chunk preview titles for breadth, sampled chunks for depth.
2. "topics": up to 12 main topics across the document (preview titles are the primary signal).

Return JSON only. No preamble.

{ "summary": "...", "topics": ["..."] }`,
                },
                { role: 'user', content: userContent },
            ],
            response_format: { type: 'json_object' },
        }),
    });

    const rawContent = response.choices[0].message.content || '{}';
    let parsed: { summary?: unknown; topics?: unknown };
    try {
        parsed = JSON.parse(rawContent);
    } catch {
        parsed = {};
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const topics = Array.isArray(parsed.topics)
        ? parsed.topics.filter((t): t is string => typeof t === 'string').slice(0, 12)
        : [];

    // Estimated card capacity based on content-section chunks only (drops
    // frontmatter/references/appendix from the count so the slider's max
    // reflects what's actually generating cards). Multiplier of 4 reflects
    // that each chunk genuinely supports multiple cards (definition,
    // mechanism, application, contrast), not the prior conservative 2.
    const contentChunkCount = sections
        .filter((s) => s.isContent)
        .reduce((sum, s) => sum + s.chunkIds.length, 0);
    const effectiveChunkCount = contentChunkCount > 0 ? contentChunkCount : allChunks.length;
    const estimatedCardCount = Math.min(effectiveChunkCount * 4, 500);

    return { summary, topics, estimatedCardCount, chunks: allChunks, sections };
}

function firstSentence(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^[^.!?\n]{1,140}[.!?]?/);
    return (match ? match[0] : trimmed.slice(0, 140)).replace(/\s+/g, ' ').trim();
}
