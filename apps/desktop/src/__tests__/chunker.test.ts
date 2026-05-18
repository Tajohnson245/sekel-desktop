import { describe, it, expect } from 'vitest';
import {
    chunkText,
    sampleChunksForOverview,
    chunkDocumentWithSections,
    classifySection,
    CHUNK_MAX_WORDS,
    CHUNK_MIN_WORDS,
    type Chunk,
} from '../lib/textChunker';

function wordCount(text: string): number {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function makeWords(n: number, prefix = 'word'): string {
    return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

function makeChunks(n: number): Chunk[] {
    return Array.from({ length: n }, (_, i) => ({ id: i + 1, text: `chunk ${i + 1} body` }));
}

describe('chunkText', () => {
    it('returns empty array for empty input', () => {
        expect(chunkText('')).toEqual([]);
        expect(chunkText('   ')).toEqual([]);
        expect(chunkText('\n\n\n')).toEqual([]);
    });

    it('returns a single chunk for short input below MIN', () => {
        const result = chunkText('A short sentence.');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
        expect(result[0].text).toBe('A short sentence.');
    });

    it('splits on paragraph boundaries when present', () => {
        const para1 = makeWords(CHUNK_MAX_WORDS - 50, 'a');
        const para2 = makeWords(CHUNK_MAX_WORDS - 50, 'b');
        const result = chunkText(`${para1}\n\n${para2}`);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].text.startsWith('a0 ')).toBe(true);
        // Each chunk must respect MAX.
        for (const c of result) {
            expect(wordCount(c.text)).toBeLessThanOrEqual(CHUNK_MAX_WORDS);
        }
    });

    it('splits oversized single paragraphs on sentence boundaries', () => {
        // 6 sentences each ~150 words → ~900 words in one paragraph.
        const sentence = (label: string) => `${label} ${makeWords(150, label)}.`;
        const text = ['s1', 's2', 's3', 's4', 's5', 's6'].map(sentence).join(' ');
        const result = chunkText(text);
        expect(result.length).toBeGreaterThan(1);
        for (const c of result) {
            expect(wordCount(c.text)).toBeLessThanOrEqual(CHUNK_MAX_WORDS);
        }
    });

    it('keeps a heading at the top of its chunk', () => {
        const body = makeWords(120, 'body');
        const text = `Some intro paragraph.\n\nChapter 4 Pharmacokinetics\n${body}`;
        const result = chunkText(text);
        const headingChunk = result.find((c) => c.text.includes('Chapter 4'));
        expect(headingChunk).toBeDefined();
        expect(headingChunk!.text.trimStart().startsWith('Chapter 4')).toBe(true);
    });

    it('does not produce overlapping content across chunks', () => {
        const para = (label: string) => makeWords(200, label);
        const text = ['p1', 'p2', 'p3', 'p4'].map(para).join('\n\n');
        const result = chunkText(text);
        // Every word token in the input belongs to exactly one chunk (no duplication).
        const allTokens = result.flatMap((c) => c.text.split(/\s+/).filter(Boolean));
        const tokenCounts = new Map<string, number>();
        for (const tok of allTokens) {
            tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1);
        }
        const duplicates = [...tokenCounts.entries()].filter(([, n]) => n > 1);
        expect(duplicates).toEqual([]);
    });

    it('merges sub-MIN trailing pieces into the previous chunk when possible', () => {
        // Long paragraph that comfortably becomes one chunk, followed by a
        // very short tail that's well below MIN.
        const body = makeWords(200, 'body');
        const tinyTail = 'Tiny tail.';
        const result = chunkText(`${body}\n\n${tinyTail}`);
        // The trailing piece should be absorbed; we don't expect a standalone
        // sub-MIN chunk at the end.
        expect(result[result.length - 1].text).toContain('Tiny tail');
        expect(wordCount(result[result.length - 1].text)).toBeGreaterThanOrEqual(CHUNK_MIN_WORDS);
    });

    it('handles CRLF line endings', () => {
        const a = makeWords(100, 'a');
        const b = makeWords(100, 'b');
        const result = chunkText(`${a}\r\n\r\n${b}`);
        // Collapsed to LF; should produce at least one chunk with no CR.
        for (const c of result) {
            expect(c.text).not.toContain('\r');
        }
    });

    it('handles whitespace-only input', () => {
        expect(chunkText('   \n\n\t  \n')).toEqual([]);
    });

    it('produces deterministic output for the same input', () => {
        const input = `${makeWords(150, 'a')}\n\n${makeWords(150, 'b')}\n\n${makeWords(150, 'c')}`;
        const r1 = chunkText(input);
        const r2 = chunkText(input);
        expect(r1).toEqual(r2);
    });

    it('assigns sequential ids starting at 1', () => {
        const input = ['p1', 'p2', 'p3'].map((l) => makeWords(150, l)).join('\n\n');
        const result = chunkText(input);
        result.forEach((c, i) => {
            expect(c.id).toBe(i + 1);
        });
    });

    it('never exceeds CHUNK_MAX_WORDS in any chunk for a very long input', () => {
        // 50 paragraphs of 200 words each → 10K words.
        const paras = Array.from({ length: 50 }, (_, i) => makeWords(200, `p${i}`));
        const result = chunkText(paras.join('\n\n'));
        expect(result.length).toBeGreaterThan(10);
        for (const c of result) {
            expect(wordCount(c.text)).toBeLessThanOrEqual(CHUNK_MAX_WORDS);
        }
    });
});

describe('sampleChunksForOverview', () => {
    it('returns all chunks when count is below max', () => {
        const chunks = makeChunks(10);
        expect(sampleChunksForOverview(chunks, 25)).toEqual(chunks);
    });

    it('includes the first 3 and last 2 when sampling', () => {
        const chunks = makeChunks(100);
        const sampled = sampleChunksForOverview(chunks, 25);
        expect(sampled.slice(0, 3).map((c) => c.id)).toEqual([1, 2, 3]);
        expect(sampled.slice(-2).map((c) => c.id)).toEqual([99, 100]);
        expect(sampled.length).toBe(25);
    });

    it('evenly spaces middle samples', () => {
        const chunks = makeChunks(100);
        const sampled = sampleChunksForOverview(chunks, 25);
        const middle = sampled.slice(3, -2).map((c) => c.id);
        // Strictly increasing.
        for (let i = 1; i < middle.length; i++) {
            expect(middle[i]).toBeGreaterThan(middle[i - 1]);
        }
        // First middle sample sits inside the middle pool, well past index 3.
        expect(middle[0]).toBeGreaterThan(3);
        expect(middle[middle.length - 1]).toBeLessThan(99);
    });
});

describe('classifySection', () => {
    it('classifies "Chapter 5 ..." as a chapter and content', () => {
        const result = classifySection('Chapter 5 Pharmacokinetics', 1200);
        expect(result.kind).toBe('chapter');
        expect(result.isContent).toBe(true);
    });

    it('classifies "Part 2 ..." and "Section 3 ..." as chapter-like', () => {
        expect(classifySection('Part 2 Pharmacy Practice', 800).kind).toBe('chapter');
        expect(classifySection('Section 3.1 Absorption', 600).kind).toBe('chapter');
    });

    it('classifies "Preface" / "Acknowledgments" / "About the Authors" as frontmatter, unchecked', () => {
        expect(classifySection('Preface', 400)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Acknowledgments', 400)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('About the Authors', 400)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Table of Contents', 400)).toEqual({ kind: 'frontmatter', isContent: false });
    });

    it('classifies Introduction / Prologue / Epilogue / Afterword / Author Biography as frontmatter', () => {
        expect(classifySection('Introduction', 600)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Prologue', 600)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Epilogue', 600)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Afterword', 600)).toEqual({ kind: 'frontmatter', isContent: false });
        expect(classifySection('Author Biography', 200).kind).toBe('frontmatter');
    });

    it('still treats "Chapter 5 Introduction to Cardiology" as a chapter (chapter pattern wins)', () => {
        expect(classifySection('Chapter 5 Introduction to Cardiology', 1200).kind).toBe('chapter');
    });

    it('classifies "References" / "Bibliography" / "Index" as references, unchecked', () => {
        expect(classifySection('References', 2000).isContent).toBe(false);
        expect(classifySection('Bibliography', 2000).kind).toBe('references');
        expect(classifySection('Index', 5000).isContent).toBe(false);
    });

    it('classifies "Appendix A: ..." as appendix, unchecked', () => {
        const result = classifySection('Appendix A: Conversion Tables', 600);
        expect(result.kind).toBe('appendix');
        expect(result.isContent).toBe(false);
    });

    it('treats long, untitled content as content and auto-checks it', () => {
        const result = classifySection('The blood-brain barrier limits drug penetration', 1500);
        expect(result.kind).toBe('content');
        expect(result.isContent).toBe(true);
    });

    it('leaves short, untitled content as unchecked content', () => {
        const result = classifySection('Quick aside', 50);
        expect(result.kind).toBe('content');
        expect(result.isContent).toBe(false);
    });
});

describe('chunkDocumentWithSections', () => {
    it('returns empty arrays for empty input', () => {
        const result = chunkDocumentWithSections('');
        expect(result.chunks).toEqual([]);
        expect(result.sections).toEqual([]);
    });

    it('produces a single "Document content" section when no headings detected', () => {
        const body = makeWords(800, 'plain');
        const result = chunkDocumentWithSections(body);
        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].title).toBe('Document content');
        expect(result.sections[0].kind).toBe('content');
        expect(result.sections[0].isContent).toBe(true);
        expect(result.sections[0].chunkIds.length).toBe(result.chunks.length);
    });

    it('groups chunks under detected chapter headings', () => {
        const body1 = makeWords(300, 'a');
        const body2 = makeWords(300, 'b');
        const doc = `Chapter 1 Pharmacokinetics\n${body1}\n\nChapter 2 Pharmacodynamics\n${body2}`;
        const result = chunkDocumentWithSections(doc);
        expect(result.sections.length).toBeGreaterThanOrEqual(2);
        const chapters = result.sections.filter((s) => s.kind === 'chapter');
        expect(chapters.length).toBe(2);
        expect(chapters[0].title.startsWith('Chapter 1')).toBe(true);
        expect(chapters[1].title.startsWith('Chapter 2')).toBe(true);
    });

    it('classifies non-content sections as unchecked by default', () => {
        const intro = makeWords(150, 'intro');
        const chap = makeWords(400, 'chap');
        const refs = makeWords(300, 'refs');
        const doc = `Preface\n${intro}\n\nChapter 1 Foundations\n${chap}\n\nReferences\n${refs}`;
        const result = chunkDocumentWithSections(doc);
        const preface = result.sections.find((s) => /preface/i.test(s.title));
        const chapter = result.sections.find((s) => s.kind === 'chapter');
        const references = result.sections.find((s) => s.kind === 'references');
        expect(preface?.isContent).toBe(false);
        expect(chapter?.isContent).toBe(true);
        expect(references?.isContent).toBe(false);
    });

    it('partitions every chunk into exactly one section (no orphans, no duplicates)', () => {
        const doc = ['Chapter 1', makeWords(400, 'a'), '\n\nChapter 2', makeWords(400, 'b')].join(' ');
        const result = chunkDocumentWithSections(doc);
        const allSectionChunkIds = result.sections.flatMap((s) => s.chunkIds).sort((a, b) => a - b);
        const chunkIds = result.chunks.map((c) => c.id).sort((a, b) => a - b);
        expect(allSectionChunkIds).toEqual(chunkIds);
    });

    it('chunkText() remains a flat view of chunkDocumentWithSections().chunks', () => {
        const doc = `Chapter 1\n${makeWords(300, 'a')}\n\nChapter 2\n${makeWords(300, 'b')}`;
        const sectionResult = chunkDocumentWithSections(doc);
        const flatResult = chunkText(doc);
        expect(flatResult).toEqual(sectionResult.chunks);
    });
});

