/**
 * AI Logic (Backend)
 *
 * This file handles AI-powered card generation using a four-stage pipeline:
 *   Stage 2 — Chunking: split document into concept chunks
 *   Stage 3 — Generation: generate cards per chunk per card type
 *   Stage 4 — Evaluation: LLM-as-judge filters and revises cards
 */

import { instrumentedHandle, trackedCompletion, createLogger, consoleTransport } from '@sekel/observability';
import { OpenAI } from "openai";

const log = createLogger({ module: 'ai', transports: [consoleTransport] });

// Lazy-initialize OpenAI client (avoids crash on startup when key is absent).
// maxRetries=5 covers transient 429s; timeout caps the worst-case stuck request
// so a single hung call can't block the whole batch.
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!_openai) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing OPENAI_API_KEY. Set it in your .env.local file.');
        }
        _openai = new OpenAI({
            apiKey,
            maxRetries: 5,
            timeout: 60_000,
        });
    }
    return _openai;
}

// Generation uses the heavier model; evaluation uses a cheaper/faster one.
// A 350-card batch fires hundreds of eval calls — splitting models keeps both
// cost and TPM pressure down without sacrificing generation quality.
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const EVAL_MODEL = process.env.OPENAI_EVAL_MODEL || 'gpt-4o-mini';

// Cap concurrent OpenAI calls so a 350-card batch can't dump 350+ requests on
// the API in the same second and trip RPM/TPM limits. 8 in flight at any time
// stays comfortably under Tier 1 quotas with the SDK retry buffer.
const OPENAI_CONCURRENCY = Math.max(1, Number(process.env.OPENAI_CONCURRENCY ?? 8));

function pLimit(max: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const tryNext = () => {
        while (active < max && queue.length > 0) {
            const fn = queue.shift()!;
            active++;
            fn();
        }
    };
    return <T>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            queue.push(() => {
                fn().then(resolve, reject).finally(() => {
                    active--;
                    tryNext();
                });
            });
            tryNext();
        });
}

const limit = pLimit(OPENAI_CONCURRENCY);

// ─────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────

type CardFormat = 'basic' | 'cloze' | 'reversed' | 'true-false' | 'compare-contrast' | 'multiple-choice';

interface GenerationOptions {
    /** One or more card formats. Total card count is split evenly across them. */
    cardFormats?: CardFormat[];
    difficulty?: 'essential' | 'detailed';
    customInstructions?: string;
}

interface GeneratedCard {
    front: string;
    back: string;
}

interface Chunk {
    id: number;
    text: string;
}

interface CardScore {
    scores: { atomicity: number; testability: number; clarity: number; nontriviality: number; distractorQuality?: number };
    total: number;
    verdict: 'keep' | 'revise' | 'reject';
    reason: string;
}

interface SessionStats {
    cardsGenerated: number;
    cardsKept: number;
    cardsRevised: number;
    cardsRejected: number;
    evaluatorReasons: string[];
}

// Shared exclusion block: keeps every generation path (legacy single-format,
// chunked multi-format, regeneration) aligned on what NOT to turn into cards.
// The chunker pre-filters meta sections and the evaluator gates them, but the
// generator itself is the cheapest place to enforce subject-only output —
// stop a trivial card before it costs an eval call.
const META_EXCLUSIONS = `Do NOT generate cards about:
- The exam, certification, or credential the document prepares for — its name, length, format, scoring, passing score, registration, fees, retake policy, history, or who administers it (e.g. "What does NAPLEX stand for?", "How long is the exam?", "Who administers the exam?").
- The document itself — author, chapter titles, foreword, preface, acknowledgments, dedications, table of contents, "how to use this book", or general study-strategy advice.
- Generic self-referential definitions of the field or profession (e.g. "What is pharmacy?", "What does a pharmacist do?") when they appear as introductory framing rather than testable competency content.
Generate cards ONLY about the substantive subject matter a practitioner is expected to know and apply.`;

// ─────────────────────────────────────────────────────────────────
// Legacy prompt builder (used by the basic generate-cards handler)
// ─────────────────────────────────────────────────────────────────

function buildFormatRules(options: GenerationOptions): string {
    // Legacy single-format path: just use the first selected format.
    const format: CardFormat = options.cardFormats?.[0] ?? 'basic';
    const difficulty = options.difficulty ?? 'detailed';

    const formatBlocks: Record<CardFormat, string> = {
        basic: [
            '- "front" should contain ONLY the question.',
            '- "back" should contain ONLY the answer.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
        cloze: [
            '- Generate Cloze Deletion cards.',
            '- "front" should contain the full sentence with the key term replaced by {{c1::term}}.',
            '- "back" should contain the complete sentence with the term visible.',
            '- Example: front: "The powerhouse of the cell is the {{c1::mitochondria}}.", back: "The powerhouse of the cell is the mitochondria."',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
        reversed: [
            '- For each concept, generate TWO cards: one forward and one reversed.',
            '- Card 1: "front" = question, "back" = answer.',
            '- Card 2: "front" = answer (rephrased as a question), "back" = original question.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
        'true-false': [
            '- Generate True/False cards.',
            '- "front" is a single declarative statement (one sentence, factual, no questions).',
            '- The statement must be unambiguously TRUE or FALSE based on the source content.',
            '- Mix true and false statements roughly 50/50.',
            '- "back" begins with "True." or "False." followed by one short sentence explaining why.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "True. ..." }] }',
        ].join('\n'),
        'compare-contrast': [
            '- Generate Compare/Contrast cards.',
            '- "front" asks the student to compare two SPECIFIC related concepts from the content (e.g. "Compare and contrast X vs Y").',
            '- The two concepts must be genuinely comparable — same domain, different mechanisms or outcomes.',
            '- "back" is HTML-formatted using ONLY <p>, <strong>, <ul>, <li> tags. No attributes, no other tags.',
            '- Structure: <p>One-line summary.</p><p><strong>Similarities:</strong></p><ul><li>...</li></ul><p><strong>Differences:</strong></p><ul><li>...</li></ul>',
            '- 2-4 bullets per list. Each bullet short and concrete.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "<p>...</p>..." }] }',
        ].join('\n'),
        'multiple-choice': [
            '- Generate Multiple Choice cards with exactly 4 lettered options (A-D).',
            '- "front" is HTML using ONLY <p> and <strong> tags. Embed each letter directly in the option text (do NOT use <ol>/<ul>/<li>). Structure: <p>Question</p><p><strong>A.</strong> ...</p><p><strong>B.</strong> ...</p><p><strong>C.</strong> ...</p><p><strong>D.</strong> ...</p>',
            '- Exactly one option is correct. The other three must be PLAUSIBLE DISTRACTORS — same domain and same shape as the correct answer, topically adjacent, NOT trivially eliminable. No joke options, no obvious outliers, no near-duplicates of the correct answer.',
            '- No "all of the above", no "none of the above", no negatively-phrased stems ("which is NOT...").',
            '- RANDOMIZE which letter is correct across the batch — do not always place the answer at A or B.',
            '- "back" is HTML containing only the correct letter and option text: <p><strong>B. ...</strong></p>',
            '- Each option must be ≤ 10 words.',
            '- Output JSON format: { "flashcards": [{ "front": "<p>Question?</p><p><strong>A.</strong> ...</p><p><strong>B.</strong> ...</p><p><strong>C.</strong> ...</p><p><strong>D.</strong> ...</p>", "back": "<p><strong>B. ...</strong></p>" }] }',
        ].join('\n'),
    };

    const difficultyBlocks: Record<string, string> = {
        essential: '- Focus ONLY on the most important, high-yield concepts. Omit minor details.',
        detailed: '- Provide comprehensive, granular coverage of the material.',
    };

    let rules = formatBlocks[format] + '\n' + difficultyBlocks[difficulty];

    if (options.customInstructions?.trim()) {
        rules += `\n- Additional instructions from the user: ${options.customInstructions.trim()}`;
    }

    return rules;
}

// ─────────────────────────────────────────────────────────────────
// Stage 2 — Chunking
// ─────────────────────────────────────────────────────────────────

async function chunkDocument(text: string): Promise<Chunk[]> {
    try {
        const response = await limit(() => trackedCompletion({
            operation: 'chunk',
            logger: log,
            call: getOpenAI().chat.completions.create({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are a document chunker for flashcard generation.

Split the following document into discrete concept chunks. Each chunk should:
- Represent one coherent topic or concept
- Be between 100-400 words
- Preserve enough context to generate cards without referencing other chunks

SKIP these sections entirely — do not emit chunks for them:
- Front matter: forewords, prefaces, acknowledgments, dedications, "about the author", copyright pages, publisher notes
- Table of contents, chapter lists, index entries, glossary front matter
- "How to use this book" or general study-strategy / test-taking advice
- Information about the exam, certification, or credential itself — its length, format, scoring, registration, fees, retake policy, history, or administering body
- Marketing copy and other non-instructional framing

If a section mixes meta content with substantive subject matter, include only the substantive portion in the chunk.

Return a JSON object with a "chunks" array only. No preamble, no explanation.

{ "chunks": [{ "id": 1, "text": "..." }, { "id": 2, "text": "..." }] }`,
                    },
                    { role: 'user', content: text },
                ],
                response_format: { type: 'json_object' },
            }),
        }));

        const raw = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(raw);
        const chunks: Chunk[] = Array.isArray(parsed.chunks) ? parsed.chunks : (Array.isArray(parsed) ? parsed : []);
        return chunks.length > 0 ? chunks : [{ id: 1, text }];
    } catch {
        return [{ id: 1, text }];
    }
}

function distributeCards(chunks: Chunk[], total: number): number[] {
    const totalLength = chunks.reduce((sum, c) => sum + c.text.length, 0);
    const exactShares = chunks.map(c => (c.text.length / totalLength) * total);
    const floored = exactShares.map(s => Math.max(1, Math.floor(s)));

    let residual = total - floored.reduce((sum, n) => sum + n, 0);
    const remainders = exactShares.map((s, i) => ({ index: i, remainder: s - floored[i] }));
    remainders.sort((a, b) => b.remainder - a.remainder);

    for (const { index } of remainders) {
        if (residual <= 0) break;
        floored[index]++;
        residual--;
    }

    return floored;
}

// ─────────────────────────────────────────────────────────────────
// Stage 3 — Generation
// ─────────────────────────────────────────────────────────────────

// User instructions used to be re-phrased by another LLM call before being
// embedded in the generation prompt. That added ~1s + 1 call per session for
// marginal quality benefit; the model handles raw instructions fine.
function normalizeUserInstruction(raw: string): string {
    return raw.trim() || 'No additional instruction.';
}

function buildCardTypePrompt(
    cardFormat: CardFormat,
    n: number,
    userInstruction: string,
    chunkText: string,
    difficulty: 'essential' | 'detailed',
    revisionReason?: string,
): string {
    const difficultyNote = difficulty === 'essential'
        ? 'Focus ONLY on the most important, high-yield concepts. Omit minor details.'
        : 'Provide comprehensive, granular coverage of the material.';

    const revisionNote = revisionReason
        ? `\nA previous attempt at this card was rejected for the following reason:\n"${revisionReason}"\n\nDo not repeat this mistake. Generate a different card from the same content.`
        : '';

    const prompts: Record<CardFormat, string> = {
        basic: `You are a flashcard generation expert creating study cards for a medical student.

Rules:
- Each card tests exactly ONE fact
- Questions must be specific and unambiguous
- Answers must be concise: 1-10 words maximum
- Never start a question with "What is" or "Define"
- Frame questions in clinical or applied context where possible
- Do not generate cards about background history or general introductions
- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} Q&A flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "basic", "front": "...", "back": "..." }] }

Content:
${chunkText}`,

        reversed: `You are a flashcard generation expert creating study cards for a medical student.

You are generating REVERSED flashcards. The answer is presented first and the student must recall the term or question.

Only generate a reversed card where the reverse direction is genuinely testable.
- Good: Drug name → Mechanism of action (reversible: Mechanism → Drug name)
- Bad: Clinical description → Disease name (not reversible: too many possible answers)

If a reversed card would be ambiguous or have multiple valid answers, skip it and find a different fact from the content.

- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} reversed flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "reversed", "front": "...", "back": "..." }] }

Content:
${chunkText}`,

        cloze: `You are a flashcard generation expert creating cloze deletion cards for a medical student.

Rules:
- The blanked word or phrase must be the KEY medical concept in the sentence
- Never blank articles, prepositions, conjunctions, or filler words
- Only ONE blank per card, formatted as {{c1::word}}
- The surrounding sentence must make the blank non-trivial but inferable with knowledge
- The full sentence must be clinically meaningful on its own

Bad example: "The {{c1::mitral}} valve is between the left atrium and left ventricle"
Reason: Anatomical position is too simple; guessable from context

Good example: "In aortic stenosis, the classic triad is angina, syncope, and {{c1::heart failure}}, with syncope indicating the worst prognosis"
Reason: The blank requires genuine recall; surrounding context is rich but not revealing

- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} cloze flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "cloze", "text": "sentence with {{c1::word}}" }] }

Content:
${chunkText}`,

        'true-false': `You are a flashcard generation expert creating True/False cards for a medical student.

Rules:
- "front" is a single declarative statement (one sentence, factual, no questions)
- The statement must be unambiguously TRUE or FALSE based ONLY on the source content
- Mix true and false statements roughly 50/50 across the batch
- Avoid trick wording, double negatives, and vague qualifiers like "always" or "never"
- "back" begins with "True." or "False." followed by one short sentence explaining why
- Each card tests exactly ONE fact
- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} True/False flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "true-false", "front": "...", "back": "True. ..." }] }

Content:
${chunkText}`,

        'compare-contrast': `You are a flashcard generation expert creating Compare/Contrast cards for a medical student.

Rules:
- "front" asks the student to compare two SPECIFIC related concepts from the content
  - Example: "Compare and contrast Type I vs Type II hypersensitivity reactions"
- The two concepts must be genuinely comparable — same domain, different mechanisms or outcomes
- Skip pairs where one side isn't directly addressed in the content
- "back" is HTML-formatted (rendered with sanitize + dangerouslySetInnerHTML) so newlines won't render. Use this exact structure:
  <p>One-line summary distinguishing the two.</p>
  <p><strong>Similarities:</strong></p>
  <ul><li>...</li><li>...</li></ul>
  <p><strong>Differences:</strong></p>
  <ul><li>...</li><li>...</li></ul>
- 2-4 bullet points in each list. Each bullet short and concrete.
- Use ONLY these tags: <p>, <strong>, <ul>, <li>. No attributes, no other tags.
- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} compare/contrast flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "compare-contrast", "front": "Compare and contrast X vs Y", "back": "<p>...</p><p><strong>Similarities:</strong></p><ul><li>...</li></ul>..." }] }

Content:
${chunkText}`,

        'multiple-choice': `You are a flashcard generation expert creating Multiple Choice cards for a medical student.

Rules:
- Each card tests exactly ONE specific fact from the content.
- "front" is HTML with the question followed by exactly 4 lettered options. Embed the letter directly in each option line (do NOT rely on list markers). Use this exact structure:
  <p>{question}</p>
  <p><strong>A.</strong> {option text}</p>
  <p><strong>B.</strong> {option text}</p>
  <p><strong>C.</strong> {option text}</p>
  <p><strong>D.</strong> {option text}</p>
  Use ONLY these tags: <p>, <strong>. No attributes, no <ol>, no <ul>, no <li>.
- Exactly one option is correct. The other three are PLAUSIBLE DISTRACTORS:
  * Same domain and same shape as the correct answer (if the correct answer is an enzyme, all four are enzymes; if it's a year, all four are years in the same era; if it's a drug class, all four are drug classes).
  * Topically adjacent — common confusions, sibling concepts, or neighboring categories from the source content.
  * NOT trivially eliminable: no joke options, no obvious outliers, no synonyms of the correct answer, no near-duplicates of each other.
  * Each option ≤ 10 words.
- No "all of the above", no "none of the above", no negatively-phrased stems ("which is NOT...").
- RANDOMIZE which letter (A/B/C/D) is correct across the batch — do not always place the answer at A or B. Across ${n} cards the correct letter should be roughly uniform.
- "back" is HTML containing only the correct letter and the correct option text, no explanation:
  <p><strong>{letter}. {correct option text}</strong></p>
- ${difficultyNote}

${META_EXCLUSIONS}

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} multiple choice flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "multiple-choice", "front": "<p>Question?</p><p><strong>A.</strong> ...</p><p><strong>B.</strong> ...</p><p><strong>C.</strong> ...</p><p><strong>D.</strong> ...</p>", "back": "<p><strong>B. ...</strong></p>" }] }

Content:
${chunkText}`,
    };

    return prompts[cardFormat];
}

async function generateCardsForChunk(
    chunk: Chunk,
    count: number,
    cardFormat: CardFormat,
    difficulty: 'essential' | 'detailed',
    interpretedInstruction: string,
    language: string,
    revisionReason?: string,
): Promise<GeneratedCard[]> {
    const prompt = buildCardTypePrompt(cardFormat, count, interpretedInstruction, chunk.text, difficulty, revisionReason);

    const response = await limit(() => trackedCompletion({
        operation: 'generate',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: prompt },
                ...(language !== 'English' ? [{ role: 'user' as const, content: `Output all cards in ${language}.` }] : []),
            ],
            response_format: { type: 'json_object' },
        }),
    }));

    const raw = JSON.parse(response.choices[0].message.content || '{}');
    const items: GeneratedCard[] = raw.flashcards || raw.cards || [];

    // Normalize cloze cards: { text } → { front: text, back: extracted word }
    return items.map((card: GeneratedCard & { text?: string }) => {
        if (card.text) {
            const match = card.text.match(/\{\{c1::([^}]+)\}\}/);
            return { front: card.text, back: match ? match[1] : '' };
        }
        return { front: card.front || '', back: card.back || '' };
    });
}

// ─────────────────────────────────────────────────────────────────
// Stage 4 — Evaluation
// ─────────────────────────────────────────────────────────────────

const EVAL_BATCH_SIZE = 8;

function getCardBackForDisplay(card: GeneratedCard, cardFormat: string): string {
    if (cardFormat !== 'cloze') return card.back;
    return (card.front.match(/\{\{c1::([^}]+)\}\}/) || [])[1] || card.back;
}

function defaultScore(cardFormat?: string): CardScore {
    const isMC = cardFormat === 'multiple-choice';
    return {
        scores: isMC
            ? { atomicity: 3, testability: 3, clarity: 3, nontriviality: 3, distractorQuality: 3 }
            : { atomicity: 3, testability: 3, clarity: 3, nontriviality: 3 },
        total: isMC ? 15 : 12,
        verdict: 'keep',
        reason: '',
    };
}

/**
 * Scores up to EVAL_BATCH_SIZE cards in a single API call.
 * Replaces N individual evaluate calls with ceil(N/EVAL_BATCH_SIZE).
 */
async function evaluateCardsBatch(cards: GeneratedCard[], cardFormat: string): Promise<CardScore[]> {
    if (cards.length === 0) return [];

    const batches: GeneratedCard[][] = [];
    for (let i = 0; i < cards.length; i += EVAL_BATCH_SIZE) {
        batches.push(cards.slice(i, i + EVAL_BATCH_SIZE));
    }

    const isMC = cardFormat === 'multiple-choice';
    // Proportional thresholds: 4 criteria → max 12 (keep ≥ 10, revise 7-9, reject < 7);
    // 5 criteria for MC → max 15 (keep ≥ 13, revise 9-12, reject < 9).
    const keepThreshold = isMC ? 13 : 10;
    const reviseThreshold = isMC ? 9 : 7;

    const batchResults = await Promise.all(batches.map(async (batch) => {
        const cardLines = batch.map((card, idx) => {
            const back = getCardBackForDisplay(card, cardFormat);
            return `${idx + 1}. Front: ${card.front}\n   Back: ${back}`;
        }).join('\n');

        const criteriaList = isMC
            ? `1. Atomicity: tests exactly one fact
2. Testability: correct answer is unambiguous and clearly the best option
3. Clarity: question and options are clearly worded
4. Non-triviality: tests real subject-matter knowledge — NOT trivia about the exam/credential itself (format, length, scoring, registration), the document (author, chapters, foreword, acknowledgments, study-strategy advice), or generic self-definitions of the field
5. Distractor quality: the three wrong options are plausible, same-domain, and NOT trivially eliminable (no joke options, no obvious outliers, no near-duplicates of the correct answer or each other)`
            : `1. Atomicity: tests exactly one fact
2. Testability: answer is unambiguous and concise
3. Clarity: question/sentence is clearly worded
4. Non-triviality: tests real subject-matter knowledge — NOT trivia about the exam/credential itself (format, length, scoring, registration), the document (author, chapters, foreword, acknowledgments, study-strategy advice), or generic self-definitions of the field`;

        const schemaExample = isMC
            ? `{ "atomicity": 1, "testability": 1, "clarity": 1, "nontriviality": 1, "distractorQuality": 1, "total": 5, "verdict": "keep", "reason": "one short sentence" }`
            : `{ "atomicity": 1, "testability": 1, "clarity": 1, "nontriviality": 1, "total": 4, "verdict": "keep", "reason": "one short sentence" }`;

        const prompt = `You are a flashcard quality reviewer.

Score each flashcard on every criterion from 1 to 3:
- 1 = fails
- 2 = acceptable
- 3 = excellent

Criteria:
${criteriaList}

Card type: ${cardFormat}
Cards (numbered):
${cardLines}

Score each card. The "scores" array MUST have exactly ${batch.length} entries in the same order.
Verdict guide: keep (total >= ${keepThreshold}), revise (${reviseThreshold}-${keepThreshold - 1}), reject (< ${reviseThreshold}).

Return JSON only. No preamble.

{ "scores": [
  ${schemaExample}
]}`;

        try {
            const response = await limit(() => trackedCompletion({
                operation: 'evaluate-batch',
                logger: log,
                call: getOpenAI().chat.completions.create({
                    model: EVAL_MODEL,
                    messages: [{ role: 'system', content: prompt }],
                    response_format: { type: 'json_object' },
                }),
            }));

            const parsed = JSON.parse(response.choices[0].message.content || '{}');
            const rawScores: Array<Partial<CardScore> & { atomicity?: number; testability?: number; clarity?: number; nontriviality?: number; distractorQuality?: number }> = parsed.scores || [];

            return batch.map((_, idx) => {
                const r = rawScores[idx];
                if (!r) return defaultScore(cardFormat);

                // Some models return flat fields, some return a nested "scores" object.
                const nested = r.scores ?? {
                    atomicity: r.atomicity ?? 3,
                    testability: r.testability ?? 3,
                    clarity: r.clarity ?? 3,
                    nontriviality: r.nontriviality ?? 3,
                    ...(isMC ? { distractorQuality: r.distractorQuality ?? 3 } : {}),
                };
                const baseSum = nested.atomicity + nested.testability + nested.clarity + nested.nontriviality;
                const total = typeof r.total === 'number'
                    ? r.total
                    : baseSum + (isMC ? (nested.distractorQuality ?? 3) : 0);

                return {
                    scores: nested,
                    total,
                    verdict: r.verdict || (total >= keepThreshold ? 'keep' : total >= reviseThreshold ? 'revise' : 'reject'),
                    reason: r.reason || '',
                };
            });
        } catch {
            // If the batched eval fails, treat the whole batch as "keep" — better
            // to ship slightly weaker cards than to lose them entirely.
            return batch.map(() => defaultScore(cardFormat));
        }
    }));

    return batchResults.flat();
}

async function evaluateAndRefineCards(
    cards: GeneratedCard[],
    chunk: Chunk,
    cardFormat: CardFormat,
    difficulty: 'essential' | 'detailed',
    interpretedInstruction: string,
    language: string,
    stats: SessionStats,
): Promise<GeneratedCard[]> {
    if (cards.length === 0) return [];

    const isMC = cardFormat === 'multiple-choice';
    // Mirror the proportional thresholds used in evaluateCardsBatch.
    const keepThreshold = isMC ? 13 : 10;
    const reviseThreshold = isMC ? 9 : 7;

    const scores = await evaluateCardsBatch(cards, cardFormat);
    const kept: GeneratedCard[] = [];
    const reasonsForRegen: string[] = [];
    let regenCount = 0;

    for (let i = 0; i < cards.length; i++) {
        const score = scores[i];
        if (score.total >= keepThreshold) {
            kept.push(cards[i]);
            stats.cardsKept++;
            continue;
        }

        // Both "revise" and "reject" get regenerated. Track stats separately,
        // but pool the regeneration into one batched call.
        if (score.reason) {
            reasonsForRegen.push(score.reason);
            stats.evaluatorReasons.push(score.reason);
        }
        regenCount++;
        if (score.total >= reviseThreshold) stats.cardsRevised++;
        else stats.cardsRejected++;
    }

    if (regenCount === 0) return kept;

    // Single regeneration pass for all rejected/revised cards in this chunk.
    // Pass the unique reasons so the model can avoid the same mistakes.
    const uniqueReasons = Array.from(new Set(reasonsForRegen)).slice(0, 6);
    const reasonHint = uniqueReasons.length > 0 ? uniqueReasons.join('; ') : undefined;

    try {
        const regenerated = await generateCardsForChunk(
            chunk, regenCount, cardFormat, difficulty, interpretedInstruction, language, reasonHint,
        );
        stats.cardsGenerated += regenerated.length;

        if (regenerated.length > 0) {
            const reEvalScores = await evaluateCardsBatch(regenerated, cardFormat);
            for (let i = 0; i < regenerated.length; i++) {
                if (reEvalScores[i].total >= reviseThreshold) {
                    kept.push(regenerated[i]);
                }
            }
        }
    } catch {
        // Drop the regen batch silently; backfill loop in the handler will
        // top up the deck if too many were lost.
    }

    return kept;
}

// ─────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────

export const setupAIHandlers = () => {
    // Basic text-to-cards generation (Legacy)
    instrumentedHandle('generate-cards', async (_event, text: string, count: number = 5, language: string = 'English', options?: GenerationOptions) => {
        try {
            getOpenAI(); // fail early if API key is missing

            const formatRules = buildFormatRules(options ?? {});

            const response = await limit(() => trackedCompletion({
                operation: 'generate-legacy',
                logger: log,
                call: getOpenAI().chat.completions.create({
                    model: MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a flashcard creator. Generate ${count} flashcards from the given text in the ${language} language.

Rules:
${formatRules}
- Ensure all content is in ${language}.

${META_EXCLUSIONS}`,
                        },
                        { role: 'user', content: text },
                    ],
                    response_format: { type: 'json_object' },
                }),
            }));
            const content = response.choices[0].message.content;
            const parsed = JSON.parse(content || '{}');
            return parsed.flashcards || parsed.cards || [];
        } catch (error) {
            console.error('Error generating cards:', error);
            throw error;
        }
    });

    // Four-stage pipeline: chunk → generate → evaluate → return
    instrumentedHandle('generate-cards-from-context', async (event, { content, count, language = 'English', options, chunks: precomputedChunks }: { summary: string, content: string, count: number, language?: string, options?: GenerationOptions, chunks?: Chunk[] }) => {
        // Tiny helper so the renderer can show a progress bar instead of
        // staring at a spinner for 30+ seconds. Best-effort — if the sender
        // is gone (window closed mid-generation) we just swallow the error.
        const sendProgress = (payload: { phase: 'chunking' | 'generating' | 'refining' | 'done'; current: number; total: number }) => {
            try { event.sender.send('ai-progress', payload); } catch { /* sender gone */ }
        };

        try {
            getOpenAI(); // fail early if API key is missing

            const activeFormats: CardFormat[] = options?.cardFormats?.length
                ? options.cardFormats
                : ['basic'];
            const difficulty = options?.difficulty ?? 'detailed';

            // Stage 3 pre-processing: normalize user instruction (no LLM call needed)
            const interpretedInstruction = normalizeUserInstruction(options?.customInstructions ?? '');

            // Stage 2: use pre-computed chunks from the upload page when
            // available. Falls back to a fresh chunkDocument call only if the
            // caller didn't supply any (legacy / standalone usage).
            let chunks: Chunk[];
            if (precomputedChunks && precomputedChunks.length > 0) {
                chunks = precomputedChunks;
            } else {
                sendProgress({ phase: 'chunking', current: 0, total: 1 });
                chunks = await chunkDocument(content);
            }

            // Split the requested total card count evenly across selected
            // formats, distributing the remainder to the first formats so
            // the totals always sum to `count`.
            const baseShare = Math.floor(count / activeFormats.length);
            const remainder = count - baseShare * activeFormats.length;
            const formatTotals = activeFormats.map((_, i) => baseShare + (i < remainder ? 1 : 0));
            // Per-format, per-chunk card allocations.
            const formatChunkCounts = activeFormats.map((_, i) => distributeCards(chunks, formatTotals[i]));

            const stats: SessionStats = {
                cardsGenerated: 0,
                cardsKept: 0,
                cardsRevised: 0,
                cardsRejected: 0,
                evaluatorReasons: [],
            };

            // Stage 3 + 4: each (chunk, format) pair is one work unit. Run
            // them all in parallel; the OpenAI semaphore bounds true
            // in-flight concurrency.
            const totalWorkUnits = chunks.length * activeFormats.length;
            let unitsDone = 0;
            sendProgress({ phase: 'generating', current: 0, total: totalWorkUnits });

            const chunkResults = await Promise.all(chunks.map(async (chunk, chunkIdx) => {
                const formatResults = await Promise.all(activeFormats.map(async (fmt, fIdx) => {
                    const cardsForThisFormat = formatChunkCounts[fIdx][chunkIdx];
                    if (cardsForThisFormat <= 0) {
                        unitsDone++;
                        sendProgress({ phase: 'generating', current: unitsDone, total: totalWorkUnits });
                        return [];
                    }
                    const rawCards = await generateCardsForChunk(
                        chunk, cardsForThisFormat, fmt, difficulty, interpretedInstruction, language,
                    );
                    stats.cardsGenerated += rawCards.length;

                    const evaluatedCards = await evaluateAndRefineCards(
                        rawCards, chunk, fmt, difficulty, interpretedInstruction, language, stats,
                    );
                    unitsDone++;
                    sendProgress({ phase: 'generating', current: unitsDone, total: totalWorkUnits });
                    return evaluatedCards;
                }));
                return formatResults.flat();
            }));

            let allCards = chunkResults.flat();

            // Backfill: generate additional cards if evaluation dropped some.
            // Distribute the deficit across formats the same way as the main
            // pass so the result mix roughly preserves the user's selection.
            const MAX_BACKFILL_ROUNDS = 2;
            let backfillRound = 0;

            while (allCards.length < count && backfillRound < MAX_BACKFILL_ROUNDS) {
                backfillRound++;
                sendProgress({ phase: 'refining', current: backfillRound, total: MAX_BACKFILL_ROUNDS });

                const deficit = count - allCards.length;
                const deficitBase = Math.floor(deficit / activeFormats.length);
                const deficitRemainder = deficit - deficitBase * activeFormats.length;
                const deficitPerFormat = activeFormats.map((_, i) => deficitBase + (i < deficitRemainder ? 1 : 0));

                const chunksByLength = [...chunks].sort((a, b) => b.text.length - a.text.length);
                const formatBackfillCounts = activeFormats.map((_, i) => distributeCards(chunksByLength, deficitPerFormat[i]));

                const backfillResults = await Promise.all(
                    chunksByLength.map(async (chunk, chunkIdx) =>
                        (await Promise.all(activeFormats.map(async (fmt, fIdx) => {
                            const n = formatBackfillCounts[fIdx][chunkIdx];
                            if (n <= 0) return [];
                            const rawCards = await generateCardsForChunk(
                                chunk, n, fmt, difficulty, interpretedInstruction, language,
                            );
                            stats.cardsGenerated += rawCards.length;
                            return evaluateAndRefineCards(
                                rawCards, chunk, fmt, difficulty, interpretedInstruction, language, stats,
                            );
                        }))).flat(),
                    ),
                );

                allCards = allCards.concat(backfillResults.flat());
            }

            if (allCards.length > count) {
                allCards = allCards.slice(0, count);
            }

            sendProgress({ phase: 'done', current: 1, total: 1 });

            return {
                cards: allCards,
                stats: {
                    generated: stats.cardsGenerated,
                    kept: stats.cardsKept,
                    filtered: stats.cardsGenerated - allCards.length,
                },
            };

        } catch (error) {
            console.error('Error generating cards from context:', error);
            throw error;
        }
    });
};
