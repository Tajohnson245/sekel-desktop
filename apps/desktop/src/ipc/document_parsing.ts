/**
 * Document Parsing Logic (Backend)
 * 
 * This file handles parsing of various document formats (PDF, DOCX, PPTX, XLSX, Images)
 * and generates summaries using OpenAI.
 */

import { ipcMain } from 'electron';
import { OpenAI } from "openai";
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { YoutubeTranscript } from 'youtube-transcript';
const pdfParse = require('pdf-parse');
import { stripMarkdown } from '../lib/stringUtils';

// Initialize OpenAI client
const apiKey = process.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

export const setupDocumentHandlers = () => {
    // Handle document parsing requests from renderer
    ipcMain.handle('parse-document', async (event, file: { name: string, buffer?: ArrayBuffer, url?: string, type: string, language?: string }) => {
        try {
            const language = file.language || 'English';
            if (file.type === 'youtube' && file.url) {
                console.log(`Parsing YouTube video: ${file.url}`);
                const { title, text } = await parseYoutubeVideo(file.url);
                const summary = await summarizeDocumentContent(title, text, language);
                return {
                    filename: title,
                    content: summary
                };
            }

            console.log(`Parsing document: ${file.name} (${file.type})`);

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
            throw error;
        }
    });

    // Handle global summary generation for multiple documents
    ipcMain.handle('generate-summary', async (_event, documents: Record<string, string>, language: string = 'English') => {
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

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content }],
            max_tokens: 4000,
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
    const response = await openai.chat.completions.create({
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
    });
    const rawContent = response.choices[0].message.content || "";
    return stripMarkdown(rawContent);
}

async function parseYoutubeVideo(url: string): Promise<{ title: string, text: string }> {
    // 1. Fetch Title (basic scrape)
    let title = "YouTube Video";
    try {
        const response = await fetch(url);
        const html = await response.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
            title = titleMatch[1].replace(' - YouTube', '');
        }
    } catch (e) {
        console.warn("Failed to fetch video title", e);
    }

    // 2. Fetch Transcript
    try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(url);
        const text = transcriptItems.map(item => item.text).join(' ');
        return { title, text };
    } catch (e) {
        console.error("Transcript fetch error:", e);
        throw new Error(`Failed to fetch transcript. The video might not have captions.`);
    }
}

// Generate a structured overview across all parsed documents (Stage 1)
export async function generateGlobalSummary(documents: Record<string, string>, language: string = 'English'): Promise<{ summary: string; topics: string[]; estimatedCardCount: number }> {
    const combinedContent = Object.entries(documents).map(([name, content]) => {
        return `--- File: ${name} ---\n\n${content}\n\n`;
    }).join("\n\n");

    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
            {
                role: "system",
                content: `You are a study assistant analyzing documents for flashcard generation.

Given the documents below, produce a brief overview with:
1. A 2-3 sentence summary of what the documents cover
2. A list of the main topics found (max 8 items)
3. An estimated number of high-quality flashcards these documents can support

Be concise. Do not add commentary or suggestions. Output summary in ${language}.

Return JSON only. No preamble, no explanation.

{ "summary": "...", "topics": ["...", "..."], "estimatedCardCount": 42 }`
            },
            {
                role: "user",
                content: combinedContent
            }
        ],
        response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0].message.content || "{}";
    try {
        const parsed = JSON.parse(rawContent);
        return {
            summary: parsed.summary || rawContent,
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            estimatedCardCount: typeof parsed.estimatedCardCount === 'number' ? parsed.estimatedCardCount : 5,
        };
    } catch {
        return { summary: rawContent, topics: [], estimatedCardCount: 5 };
    }
}
