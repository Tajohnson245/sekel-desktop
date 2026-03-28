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

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// ─────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────

interface GenerationOptions {
    cardFormat?: 'basic' | 'cloze' | 'reversed';
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
    scores: { atomicity: number; testability: number; clarity: number; nontriviality: number };
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

// ─────────────────────────────────────────────────────────────────
// Legacy prompt builder (used by the basic generate-cards handler)
// ─────────────────────────────────────────────────────────────────

function buildFormatRules(options: GenerationOptions): string {
    const format = options.cardFormat ?? 'basic';
    const difficulty = options.difficulty ?? 'detailed';

    const formatBlocks: Record<string, string> = {
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
        const response = await trackedCompletion({
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

Return a JSON object with a "chunks" array only. No preamble, no explanation.

{ "chunks": [{ "id": 1, "text": "..." }, { "id": 2, "text": "..." }] }`,
                    },
                    { role: 'user', content: text },
                ],
                response_format: { type: 'json_object' },
            }),
        });

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

async function interpretCustomInstruction(raw: string): Promise<string> {
    if (!raw.trim()) return 'No additional instruction.';

    const response = await trackedCompletion({
        operation: 'interpret-instruction',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Interpret this user instruction in the context of medical flashcard generation:

"${raw.trim()}"

Restate it as a specific, actionable constraint for a flashcard generator.
Return one sentence only. No preamble.`,
                },
            ],
        }),
    });

    return response.choices[0].message.content?.trim() || raw.trim();
}

function buildCardTypePrompt(
    cardFormat: 'basic' | 'cloze' | 'reversed',
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

    const prompts: Record<'basic' | 'cloze' | 'reversed', string> = {
        basic: `You are a flashcard generation expert creating study cards for a medical student.

Rules:
- Each card tests exactly ONE fact
- Questions must be specific and unambiguous
- Answers must be concise: 1-10 words maximum
- Never start a question with "What is" or "Define"
- Frame questions in clinical or applied context where possible
- Do not generate cards about background history or general introductions
- ${difficultyNote}

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

User instruction: ${userInstruction}
${revisionNote}
Generate exactly ${n} cloze flashcards from the content below.

Return JSON only. No preamble, no explanation.

{ "flashcards": [{ "type": "cloze", "text": "sentence with {{c1::word}}" }] }

Content:
${chunkText}`,
    };

    return prompts[cardFormat];
}

async function generateCardsForChunk(
    chunk: Chunk,
    count: number,
    cardFormat: 'basic' | 'cloze' | 'reversed',
    difficulty: 'essential' | 'detailed',
    interpretedInstruction: string,
    language: string,
    revisionReason?: string,
): Promise<GeneratedCard[]> {
    const prompt = buildCardTypePrompt(cardFormat, count, interpretedInstruction, chunk.text, difficulty, revisionReason);

    const response = await trackedCompletion({
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
    });

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

async function evaluateCard(card: GeneratedCard, cardFormat: string): Promise<CardScore> {
    const backDisplay = cardFormat === 'cloze'
        ? (card.front.match(/\{\{c1::([^}]+)\}\}/) || [])[1] || card.back
        : card.back;

    try {
        const response = await trackedCompletion({
            operation: 'evaluate',
            logger: log,
            call: getOpenAI().chat.completions.create({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are a flashcard quality reviewer.

Score this flashcard on each criterion from 1 to 3:
- 1 = fails
- 2 = acceptable
- 3 = excellent

Criteria:
1. Atomicity: Does it test exactly one fact?
2. Testability: Is the answer unambiguous and concise?
3. Clarity: Is the question or sentence clearly worded with no ambiguity?
4. Non-triviality: Would a student actually need to study this, or is it guessable without knowledge?

Card:
Type: ${cardFormat}
Front / Text: ${card.front}
Back: ${backDisplay}

Return JSON only. No preamble, no explanation.

{ "scores": { "atomicity": 1, "testability": 1, "clarity": 1, "nontriviality": 1 }, "total": 4, "verdict": "keep", "reason": "one sentence" }`,
                    },
                ],
                response_format: { type: 'json_object' },
            }),
        });

        const parsed = JSON.parse(response.choices[0].message.content || '{}');
        return {
            scores: parsed.scores || { atomicity: 3, testability: 3, clarity: 3, nontriviality: 3 },
            total: typeof parsed.total === 'number' ? parsed.total : 12,
            verdict: parsed.verdict || 'keep',
            reason: parsed.reason || '',
        };
    } catch {
        return { scores: { atomicity: 3, testability: 3, clarity: 3, nontriviality: 3 }, total: 12, verdict: 'keep', reason: '' };
    }
}

async function evaluateAndRefineCards(
    cards: GeneratedCard[],
    chunk: Chunk,
    cardFormat: 'basic' | 'cloze' | 'reversed',
    difficulty: 'essential' | 'detailed',
    interpretedInstruction: string,
    language: string,
    stats: SessionStats,
): Promise<GeneratedCard[]> {
    const scores = await Promise.all(cards.map(card => evaluateCard(card, cardFormat)));
    const kept: GeneratedCard[] = [];

    await Promise.all(scores.map(async (score, i) => {
        const card = cards[i];

        if (score.total >= 10) {
            kept.push(card);
            stats.cardsKept++;
        } else if (score.total >= 7) {
            // Revise: regenerate with reason
            if (score.reason) stats.evaluatorReasons.push(score.reason);
            try {
                const revised = await generateCardsForChunk(chunk, 1, cardFormat, difficulty, interpretedInstruction, language, score.reason);
                if (revised.length > 0) {
                    const secondScore = await evaluateCard(revised[0], cardFormat);
                    if (secondScore.total >= 7) {
                        kept.push(revised[0]);
                    }
                }
            } catch { /* drop card */ }
            stats.cardsRevised++;
        } else {
            // Reject: regenerate without revision context
            if (score.reason) stats.evaluatorReasons.push(score.reason);
            try {
                const regen = await generateCardsForChunk(chunk, 1, cardFormat, difficulty, interpretedInstruction, language);
                if (regen.length > 0) {
                    const secondScore = await evaluateCard(regen[0], cardFormat);
                    if (secondScore.total >= 7) {
                        kept.push(regen[0]);
                    }
                }
            } catch { /* drop card */ }
            stats.cardsRejected++;
        }
    }));

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

            const response = await trackedCompletion({
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
- Ensure all content is in ${language}.`,
                        },
                        { role: 'user', content: text },
                    ],
                    response_format: { type: 'json_object' },
                }),
            });
            const content = response.choices[0].message.content;
            const parsed = JSON.parse(content || '{}');
            return parsed.flashcards || parsed.cards || [];
        } catch (error) {
            console.error('Error generating cards:', error);
            throw error;
        }
    });

    // Four-stage pipeline: chunk → generate → evaluate → return
    instrumentedHandle('generate-cards-from-context', async (_event, { content, count, language = 'English', options }: { summary: string, content: string, count: number, language?: string, options?: GenerationOptions }) => {
        try {
            getOpenAI(); // fail early if API key is missing

            const cardFormat = options?.cardFormat ?? 'basic';
            const difficulty = options?.difficulty ?? 'detailed';

            // Stage 3 pre-processing: interpret user instruction once
            const interpretedInstruction = await interpretCustomInstruction(options?.customInstructions ?? '');

            // Stage 2: chunk the document
            const chunks = await chunkDocument(content);
            const cardCounts = distributeCards(chunks, count);

            const stats: SessionStats = {
                cardsGenerated: 0,
                cardsKept: 0,
                cardsRevised: 0,
                cardsRejected: 0,
                evaluatorReasons: [],
            };

            // Stage 3 + 4: generate and evaluate per chunk in parallel
            const chunkResults = await Promise.all(chunks.map(async (chunk, i) => {
                const rawCards = await generateCardsForChunk(
                    chunk, cardCounts[i], cardFormat, difficulty, interpretedInstruction, language,
                );
                stats.cardsGenerated += rawCards.length;

                const evaluatedCards = await evaluateAndRefineCards(
                    rawCards, chunk, cardFormat, difficulty, interpretedInstruction, language, stats,
                );
                return evaluatedCards;
            }));

            let allCards = chunkResults.flat();

            // Backfill: generate additional cards if evaluation dropped some
            const MAX_BACKFILL_ROUNDS = 2;
            let backfillRound = 0;

            while (allCards.length < count && backfillRound < MAX_BACKFILL_ROUNDS) {
                backfillRound++;
                const deficit = count - allCards.length;

                const chunksByLength = [...chunks].sort((a, b) => b.text.length - a.text.length);
                const backfillCounts = distributeCards(chunksByLength, deficit);

                const backfillResults = await Promise.all(
                    chunksByLength.map(async (chunk, i) => {
                        if (backfillCounts[i] <= 0) return [];
                        const rawCards = await generateCardsForChunk(
                            chunk, backfillCounts[i], cardFormat, difficulty, interpretedInstruction, language,
                        );
                        stats.cardsGenerated += rawCards.length;
                        return evaluateAndRefineCards(
                            rawCards, chunk, cardFormat, difficulty, interpretedInstruction, language, stats,
                        );
                    }),
                );

                allCards = allCards.concat(backfillResults.flat());
            }

            if (allCards.length > count) {
                allCards = allCards.slice(0, count);
            }

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
