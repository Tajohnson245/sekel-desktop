/**
 * Document text chunker.
 *
 * Pure-function utilities for splitting extracted document text into chunks
 * suitable for per-chunk LLM card generation, and for grouping those chunks
 * into user-facing sections so the renderer can offer chapter selection.
 *
 * No Electron or Node imports — this module is fully unit-testable.
 *
 * Word counts are whitespace-split. CJK content (no spaces between words)
 * will be undercounted, producing larger character-wise chunks. Acceptable
 * tradeoff for v1.
 */

export interface Chunk {
    id: number;
    text: string;
}

export type SectionKind =
    | 'chapter'
    | 'frontmatter'
    | 'references'
    | 'appendix'
    | 'content';

export interface DocumentSection {
    id: number;
    title: string;
    kind: SectionKind;
    chunkIds: number[];
    wordCount: number;
    isContent: boolean;
}

export interface ChunkedDocument {
    chunks: Chunk[];
    sections: DocumentSection[];
}

export const CHUNK_TARGET_WORDS = 350;
export const CHUNK_MAX_WORDS = 500;
export const CHUNK_MIN_WORDS = 50;

const MIN_CONTENT_WORDS_FOR_AUTO_CHECK = 200;
const MAX_TITLE_CHARS = 120;

// Named section headings (Preface, References, etc.) that signal a section
// boundary even without an explicit Chapter/Section number. Kept in sync with
// the classifier patterns below so detection and labeling agree.
const NAMED_HEADING_BODY =
    '(?:Preface|Foreword|Acknowledgments?|Dedication|Contents|Table\\s+of\\s+Contents' +
    '|About\\s+the\\s+Authors?|Author\\s+Biograph(?:y|ies)|Contributors?' +
    '|Editor[\\u2019\']?s?\\s+Note|Copyright|Introduction|Prologue|Epilogue|Afterword' +
    '|References|Bibliography|Works\\s+Cited|Index|Glossary|Appendix\\s+[A-Z\\d]+|Supplementary)';

const HEADING_BODY =
    `(?:#{1,6}\\s|(?:Chapter|Section|Part|Module|Unit|Lesson)\\s+\\d+\\b` +
    `|\\d{1,2}\\.\\d{1,2}\\s+[A-Z]|${NAMED_HEADING_BODY}\\b)`;

// Split-before regex (lookahead) — keeps the heading at the top of its section.
const HEADING_REGEX = new RegExp(`(?=^${HEADING_BODY})`, 'm');

// Used to detect whether a given line / document contains any heading at all.
const HEADING_PREFIX = new RegExp(`^${HEADING_BODY}`, 'm');

// Sentence terminators followed by whitespace. Capture group keeps the
// terminator attached to the preceding sentence.
const SENTENCE_BREAK = /([.!?])\s+/;

const FRONTMATTER_PATTERNS: RegExp[] = [
    /\bpreface\b/i,
    /\bforeword\b/i,
    /\backnowledg/i,
    /\babout the author/i,
    /\bauthor\s+biograph/i,
    /\bcontributor/i,
    /\beditor.?s? note/i,
    /\bcopyright\b/i,
    /\bdedication\b/i,
    /\btable of contents\b/i,
    /^\s*contents\s*$/i,
    /^\s*introduction\b/i,
    /^\s*prologue\b/i,
    /^\s*epilogue\b/i,
    /^\s*afterword\b/i,
];

const REFERENCES_PATTERNS: RegExp[] = [
    /\breferences\b/i,
    /\bbibliography\b/i,
    /\bworks cited\b/i,
    /\bindex\b/i,
    /\bglossary\b/i,
    /\bcitations\b/i,
    /^\s*notes\s*$/i,
];

const APPENDIX_PATTERNS: RegExp[] = [
    /^\s*appendix\s+[A-Z\d]/i,
    /^\s*supplementary\b/i,
];

const CHAPTER_PATTERNS: RegExp[] = [
    /^\s*chapter\s+\d+/i,
    /^\s*part\s+\d+/i,
    /^\s*section\s+\d+/i,
    /^\s*module\s+\d+/i,
    /^\s*unit\s+\d+/i,
    /^\s*lesson\s+\d+/i,
    /^\s*\d{1,2}\.\d{1,2}\s/,
    /^\s*\d{1,2}\s+[A-Z][a-z]/,  // e.g. "5 Pharmacokinetics"
];

export function classifySection(title: string, wordCount: number): { kind: SectionKind; isContent: boolean } {
    const t = title.trim();

    if (FRONTMATTER_PATTERNS.some((p) => p.test(t))) {
        return { kind: 'frontmatter', isContent: false };
    }
    if (REFERENCES_PATTERNS.some((p) => p.test(t))) {
        return { kind: 'references', isContent: false };
    }
    if (APPENDIX_PATTERNS.some((p) => p.test(t))) {
        return { kind: 'appendix', isContent: false };
    }
    if (CHAPTER_PATTERNS.some((p) => p.test(t))) {
        return { kind: 'chapter', isContent: true };
    }
    // Untitled or unrecognized: only auto-check if substantive enough to
    // generate meaningful cards.
    return {
        kind: 'content',
        isContent: wordCount >= MIN_CONTENT_WORDS_FOR_AUTO_CHECK,
    };
}

export function chunkDocumentWithSections(input: string): ChunkedDocument {
    if (!input || !input.trim()) return { chunks: [], sections: [] };

    const normalized = input
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

    const hasHeadings = HEADING_PREFIX.test(normalized);
    const rawSections = hasHeadings ? normalized.split(HEADING_REGEX) : [normalized];

    const allChunks: Chunk[] = [];
    const sections: DocumentSection[] = [];
    let nextChunkId = 1;
    let nextSectionId = 1;
    let untitledCount = 0;

    for (const raw of rawSections) {
        if (!raw.trim()) continue;

        const sectionTitle = extractSectionTitle(raw, () => `Section ${++untitledCount}`);
        const rough = splitToTargetSize(raw);
        const merged = mergeSmall(rough);
        const chunkTexts = merged.map((t) => t.trim()).filter((t) => t.length > 0);
        if (chunkTexts.length === 0) continue;

        const sectionChunks: Chunk[] = chunkTexts.map((text) => ({
            id: nextChunkId++,
            text,
        }));
        allChunks.push(...sectionChunks);

        const totalWords = sectionChunks.reduce((sum, c) => sum + wordCount(c.text), 0);
        const { kind, isContent } = classifySection(sectionTitle, totalWords);

        sections.push({
            id: nextSectionId++,
            title: sectionTitle,
            kind,
            chunkIds: sectionChunks.map((c) => c.id),
            wordCount: totalWords,
            isContent,
        });
    }

    // Fallback: docs with no heading structure get a single "Document content"
    // section so the picker UI is consistent across uploads.
    if (!hasHeadings && sections.length === 1) {
        sections[0].title = 'Document content';
        sections[0].kind = 'content';
        sections[0].isContent = true;
    }

    return { chunks: allChunks, sections };
}

// Backward-compatible wrapper. Existing tests and any callers that only need
// the flat chunk list continue to work.
export function chunkText(input: string): Chunk[] {
    return chunkDocumentWithSections(input).chunks;
}

export function sampleChunksForOverview(chunks: Chunk[], maxChunks: number = 25): Chunk[] {
    if (chunks.length <= maxChunks) return chunks.slice();

    const headCount = 3;
    const tailCount = 2;
    const middleCount = Math.max(0, maxChunks - headCount - tailCount);

    const head = chunks.slice(0, headCount);
    const tail = chunks.slice(-tailCount);
    const middlePool = chunks.slice(headCount, chunks.length - tailCount);

    const middle: Chunk[] = [];
    if (middleCount > 0 && middlePool.length > 0) {
        if (middlePool.length <= middleCount) {
            middle.push(...middlePool);
        } else {
            const step = middlePool.length / middleCount;
            for (let i = 0; i < middleCount; i++) {
                const idx = Math.min(middlePool.length - 1, Math.floor(i * step + step / 2));
                middle.push(middlePool[idx]);
            }
        }
    }

    return [...head, ...middle, ...tail];
}

function extractSectionTitle(rawSection: string, untitledFallback: () => string): string {
    const trimmed = rawSection.trim();
    if (!trimmed) return untitledFallback();
    const firstLine = trimmed.split('\n')[0].trim();
    if (!firstLine) return untitledFallback();

    if (HEADING_PREFIX.test(firstLine)) {
        return clipTitle(firstLine);
    }

    // Non-heading section (typically preamble before the first chapter or an
    // unstructured doc). Use the first sentence as a human-readable title.
    const match = firstLine.match(/^[^.!?\n]{1,120}[.!?]?/);
    const candidate = match ? match[0] : firstLine.slice(0, MAX_TITLE_CHARS);
    return clipTitle(candidate);
}

function clipTitle(s: string): string {
    const trimmed = s.trim().replace(/^#+\s*/, '');
    return trimmed.length > MAX_TITLE_CHARS ? trimmed.slice(0, MAX_TITLE_CHARS) + '…' : trimmed;
}

function splitToTargetSize(text: string): string[] {
    if (wordCount(text) <= CHUNK_MAX_WORDS) return [text];

    const paragraphs = text.split(/\n{2,}/);
    let result = greedyMerge(paragraphs, '\n\n');

    if (result.some((piece) => wordCount(piece) > CHUNK_MAX_WORDS)) {
        const finer: string[] = [];
        for (const piece of result) {
            if (wordCount(piece) <= CHUNK_MAX_WORDS) {
                finer.push(piece);
            } else {
                finer.push(...splitOversizedPiece(piece));
            }
        }
        result = finer;
    }

    return result;
}

function splitOversizedPiece(text: string): string[] {
    const byLine = text.split(/\n/);
    if (byLine.length > 1) {
        const result = greedyMerge(byLine, '\n');
        if (result.every((p) => wordCount(p) <= CHUNK_MAX_WORDS)) return result;
    }

    const sentences = splitOnSentences(text);
    if (sentences.length > 1) {
        const result = greedyMerge(sentences, ' ');
        if (result.every((p) => wordCount(p) <= CHUNK_MAX_WORDS)) return result;
    }

    return hardCutByWords(text);
}

function splitOnSentences(text: string): string[] {
    const parts = text.split(SENTENCE_BREAK);
    const sentences: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        const sentence = (parts[i] || '') + (parts[i + 1] || '');
        if (sentence.trim()) sentences.push(sentence);
    }
    return sentences;
}

function greedyMerge(segments: string[], separator: string): string[] {
    const result: string[] = [];
    let buf = '';
    for (const seg of segments) {
        if (!seg.trim()) continue;
        if (!buf) {
            buf = seg;
            continue;
        }
        const candidate = `${buf}${separator}${seg}`;
        const candidateWords = wordCount(candidate);
        if (candidateWords <= CHUNK_TARGET_WORDS) {
            buf = candidate;
        } else if (wordCount(buf) < CHUNK_MIN_WORDS && candidateWords <= CHUNK_MAX_WORDS) {
            buf = candidate;
        } else {
            result.push(buf);
            buf = seg;
        }
    }
    if (buf) result.push(buf);
    return result;
}

function hardCutByWords(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const result: string[] = [];
    for (let i = 0; i < words.length; i += CHUNK_TARGET_WORDS) {
        result.push(words.slice(i, i + CHUNK_TARGET_WORDS).join(' '));
    }
    return result;
}

function mergeSmall(pieces: string[]): string[] {
    if (pieces.length <= 1) return pieces.slice();
    const result: string[] = [];
    for (const piece of pieces) {
        if (result.length === 0) {
            result.push(piece);
            continue;
        }
        if (wordCount(piece) >= CHUNK_MIN_WORDS) {
            result.push(piece);
            continue;
        }
        const lastIdx = result.length - 1;
        const last = result[lastIdx];
        if (wordCount(last) + wordCount(piece) <= CHUNK_MAX_WORDS) {
            result[lastIdx] = `${last}\n\n${piece}`;
        } else {
            result.push(piece);
        }
    }
    return result;
}

function wordCount(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}
