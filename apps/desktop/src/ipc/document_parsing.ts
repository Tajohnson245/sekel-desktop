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
            const language = file.language || 'English';
            if (file.type === 'youtube' && file.url) {
                const { title, text } = await parseYoutubeVideo(file.url);
                const summary = await summarizeDocumentContent(title, text, language);
                return {
                    filename: title,
                    content: summary
                };
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

            // Generate a summary of the extracted text
            const summary = await summarizeDocumentContent(file.name, extractedText, language);

            return {
                filename: file.name,
                content: summary
            };

        } catch (error) {
            console.error(`Error parsing ${file.name}:`, error);
            if (error instanceof YoutubeValidationError) {
                // Encode errorCode in the message so it survives Electron IPC serialization
                // Format: [YOUTUBE_ERROR:code] message
                throw new Error(`[YOUTUBE_ERROR:${error.errorCode}] ${error.message}`);
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
        // For PDFs, use local extraction
        return parsePdfLocal(buffer);
    }

    return "";
}

// Extract text from PDF using local library
export async function parsePdfLocal(buffer: Buffer): Promise<string> {
    // pdf-parse v1.1.1 API
    const data = await pdfParse(buffer);
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

// Summarize a single document's content
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

// Generate a structured overview across all parsed documents (Stage 1).
// Also produces concept chunks in the same call so the card-generation pipeline
// can skip its own chunking step. One LLM call instead of two; the user no
// longer waits for "Analyzing your document…" after clicking Generate.
export async function generateGlobalSummary(
    documents: Record<string, string>,
    language: string = 'English',
): Promise<{
    summary: string;
    topics: string[];
    estimatedCardCount: number;
    chunks: Array<{ id: number; text: string }>;
}> {
    const combinedContent = Object.entries(documents).map(([name, content]) => {
        return `--- File: ${name} ---\n\n${content}\n\n`;
    }).join("\n\n");

    const response = await trackedCompletion({
        operation: 'global-summary',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a study assistant analyzing documents for flashcard generation.

Given the documents below, produce ALL of the following in a single JSON response:
1. A 2-3 sentence summary of what the documents cover (in ${language})
2. A list of the main topics found (max 8 items)
3. An estimated number of high-quality flashcards these documents can support
4. The full content split into discrete concept chunks. Each chunk should:
   - Represent one coherent topic or concept
   - Be between 100-400 words
   - Preserve enough context to generate cards without referencing other chunks
   - Cover the source material end-to-end (no gaps)

Be concise on the summary. Do not add commentary or suggestions.

Return JSON only. No preamble, no explanation.

{
  "summary": "...",
  "topics": ["...", "..."],
  "estimatedCardCount": 42,
  "chunks": [{ "id": 1, "text": "..." }, { "id": 2, "text": "..." }]
}`
                },
                {
                    role: "user",
                    content: combinedContent
                }
            ],
            response_format: { type: 'json_object' },
        }),
    });

    const rawContent = response.choices[0].message.content || "{}";
    try {
        const parsed = JSON.parse(rawContent);
        const rawChunks: unknown = parsed.chunks;
        const chunks: Array<{ id: number; text: string }> = Array.isArray(rawChunks)
            ? rawChunks
                .map((c, i) => {
                    const obj = c as { id?: unknown; text?: unknown };
                    if (typeof obj?.text !== 'string' || !obj.text.trim()) return null;
                    return { id: typeof obj.id === 'number' ? obj.id : i + 1, text: obj.text };
                })
                .filter((c): c is { id: number; text: string } => c !== null)
            : [];
        return {
            summary: parsed.summary || rawContent,
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            estimatedCardCount: typeof parsed.estimatedCardCount === 'number' ? parsed.estimatedCardCount : 5,
            chunks,
        };
    } catch {
        return { summary: rawContent, topics: [], estimatedCardCount: 5, chunks: [] };
    }
}
