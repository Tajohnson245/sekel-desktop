/**
 * Live quality check for exam-relevance screening and classification.
 *
 * Skipped unless SEKEL_AI_EVAL_TOKEN is set. It calls the real ai-proxy edge
 * function, so it needs a signed-in user's access token for that project:
 *
 *   SEKEL_AI_EVAL_URL=https://<project>.supabase.co
 *   SEKEL_AI_EVAL_ANON=<anon or publishable key>
 *   SEKEL_AI_EVAL_TOKEN=<user access token>
 *   SEKEL_AI_EVAL_BASELINE=1   (optional: also run the pre-SEKEL-155 prompt)
 *   npx vitest run src/__tests__/classificationEval.live.test.ts
 *
 * Cost: about 10 requests (plus 60 for the baseline), well under a cent.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenAI } from 'openai';

vi.mock('../main/backup/cloudState', () => ({ getSession: () => null }));

import { aiProxyBaseUrl, createProxyFetch } from '../main/ai/openaiClient';
import {
    CLASSIFY_BATCH_SIZE,
    RELEVANCE_THRESHOLD,
    buildClassificationMessages,
    buildScreeningMessages,
    isConfidentlyMapped,
    isDeckRelevant,
    parseClassificationResponse,
    parseScreeningResponse,
    type CardOutcome,
    type TaxonomySystem,
} from '../main/ai/classification';
import { MIN_YIELD_CONFIDENCE } from '../main/db/yieldSql';
import { STEP1_BLUEPRINT } from '../main/db/blueprints';
import { CSHARP_DECK, STEP1_DECK, type EvalDeck } from './fixtures/classificationEval';

const URL_BASE = process.env.SEKEL_AI_EVAL_URL ?? '';
const ANON = process.env.SEKEL_AI_EVAL_ANON ?? '';
const TOKEN = process.env.SEKEL_AI_EVAL_TOKEN ?? '';
const BASELINE = process.env.SEKEL_AI_EVAL_BASELINE === '1';
const MODEL = 'gpt-4.1-mini';
const TIMEOUT = 240_000;

const taxonomy: TaxonomySystem[] = STEP1_BLUEPRINT.systems.map((s) => ({
    system_key: s.system_key,
    label: s.label,
    topics: s.topics.map((t) => ({ topic_key: t.topic_key, label: t.label })),
}));

function client(): OpenAI {
    return new OpenAI({
        apiKey: 'sekel-ai-proxy',
        baseURL: aiProxyBaseUrl(URL_BASE),
        maxRetries: 2,
        timeout: 120_000,
        fetch: createProxyFetch({ getAccessToken: () => TOKEN, anonKey: ANON }),
    });
}

async function screen(ai: OpenAI, deck: EvalDeck) {
    const res = await ai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: buildScreeningMessages({
            examLabel: STEP1_BLUEPRINT.label,
            scope: taxonomy.map((s) => s.label),
            deckName: deck.name,
            cards: deck.cards,
        }),
    });
    return parseScreeningResponse(res.choices[0]?.message?.content, deck.cards.length);
}

async function classify(ai: OpenAI, deck: EvalDeck): Promise<CardOutcome[]> {
    const out: CardOutcome[] = [];
    for (let i = 0; i < deck.cards.length; i += CLASSIFY_BATCH_SIZE) {
        const cards = deck.cards.slice(i, i + CLASSIFY_BATCH_SIZE);
        const res = await ai.chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: buildClassificationMessages({ examLabel: STEP1_BLUEPRINT.label, deckName: deck.name, taxonomy, cards }),
        });
        out.push(...parseClassificationResponse(res.choices[0]?.message?.content, cards.length, taxonomy));
    }
    return out;
}

function tally(outcomes: CardOutcome[]) {
    return {
        mapped: outcomes.filter(isConfidentlyMapped).length,
        notRelated: outcomes.filter((o) => o.kind === 'off_exam' || (o.kind === 'mapped' && !isConfidentlyMapped(o))).length,
        invalid: outcomes.filter((o) => o.kind === 'invalid').length,
    };
}

// The single-card prompt the app used before SEKEL-155, for comparison.
const OLD_SYSTEM_PROMPT =
    'You are a medical education content classifier. Your job is to classify flashcard content into a structured exam blueprint taxonomy. You will be given a flashcard (front and back) and a blueprint taxonomy. Return ONLY a JSON object. If the card maps cleanly to one system, return: { exam_key, system_key, topic_key, confidence, reasoning }. If the card spans multiple systems, return: { exam_key, multi_system: true, classifications: [{ system_key, topic_key, confidence, split_weight, reasoning }] } where split_weight values sum to 1.0. Confidence reflects how cleanly the card maps (0.0–1.0). If the card is off-blueprint, return system_key: \'other\' with confidence < 0.3. Never return markdown, code blocks, or any text outside the JSON object.';

async function oldPromptMapsCard(ai: OpenAI, card: { front: string; back: string }): Promise<boolean> {
    const res = await ai.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: OLD_SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Card Front: ${card.front}\nCard Back: ${card.back}\n\nBlueprint Taxonomy:\n${JSON.stringify(STEP1_BLUEPRINT.systems.map((s) => ({
                    system_key: s.system_key, label: s.label,
                    topics: s.topics.map((t) => ({ topic_key: t.topic_key, label: t.label, physician_task: t.physician_task })),
                })))}`,
            },
        ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}') as {
        system_key?: string; confidence?: number;
        classifications?: Array<{ system_key?: string; confidence?: number }>;
    };
    const known = new Set(taxonomy.map((s) => s.system_key));
    const entries = parsed.classifications ?? [{ system_key: parsed.system_key, confidence: parsed.confidence }];
    return entries.some((e) => !!e.system_key && known.has(e.system_key) && (e.confidence ?? 0) >= MIN_YIELD_CONFIDENCE);
}

async function inParallel<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: limit }, async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i]);
        }
    }));
    return out;
}

describe.skipIf(!TOKEN)('classification quality (live, via ai-proxy)', () => {
    it('deck check: skips the C# deck, keeps the Step 1 deck', async () => {
        const ai = client();
        const [code, step1] = await Promise.all([screen(ai, CSHARP_DECK), screen(ai, STEP1_DECK)]);
        console.log('[eval] screening', JSON.stringify({ csharp: code, step1 }));

        expect(code).not.toBeNull();
        expect(step1).not.toBeNull();
        expect(code!.relevant / code!.judged).toBeLessThan(RELEVANCE_THRESHOLD);
        expect(isDeckRelevant(code!)).toBe(false);
        expect(step1!.relevant / step1!.judged).toBeGreaterThanOrEqual(0.8);
        expect(isDeckRelevant(step1!)).toBe(true);
    }, TIMEOUT);

    it('per-card check: no C# card gets a Step 1 topic; Step 1 cards do', async () => {
        const ai = client();
        const [code, step1] = await Promise.all([classify(ai, CSHARP_DECK), classify(ai, STEP1_DECK)]);
        const codeTally = tally(code);
        const step1Tally = tally(step1);
        console.log('[eval] per-card', JSON.stringify({ csharp: codeTally, step1: step1Tally }));
        code.forEach((o, i) => {
            if (isConfidentlyMapped(o)) console.log('[eval] C# false positive:', CSHARP_DECK.cards[i].front, JSON.stringify(o));
        });
        step1.forEach((o, i) => {
            if (!isConfidentlyMapped(o)) console.log('[eval] Step 1 miss:', STEP1_DECK.cards[i].front, JSON.stringify(o));
        });

        expect(codeTally.mapped).toBe(0);
        expect(codeTally.invalid).toBe(0);
        expect(step1Tally.mapped).toBeGreaterThanOrEqual(27);
        expect(step1Tally.invalid).toBeLessThanOrEqual(1);
    }, TIMEOUT);

    it.skipIf(!BASELINE)('baseline: the old single-card prompt on the same cards', async () => {
        const ai = client();
        const code = await inParallel(CSHARP_DECK.cards, 5, (c) => oldPromptMapsCard(ai, c));
        const step1 = await inParallel(STEP1_DECK.cards, 5, (c) => oldPromptMapsCard(ai, c));
        const summary = {
            csharpWronglyMapped: code.filter(Boolean).length,
            step1Mapped: step1.filter(Boolean).length,
            cards: CSHARP_DECK.cards.length,
        };
        console.log('[eval] baseline (old prompt)', JSON.stringify(summary));
        code.forEach((mapped, i) => { if (mapped) console.log('[eval] old-prompt C# false positive:', CSHARP_DECK.cards[i].front); });
        expect(summary.cards).toBe(30);
    }, TIMEOUT);
});
