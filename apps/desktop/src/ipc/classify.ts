/**
 * Card Classification Service
 *
 * Maps flashcards onto an exam blueprint (systems / topics) with GPT-4.1 Mini
 * and stores the result in the card_classifications table in SQLite.
 *
 * Two steps (prompts and answer checking live in main/ai/classification.ts):
 *   1. Deck screening: one request per deck with ~25 evenly spread notes asks
 *      whether the cards are material this exam tests. Decks below the
 *      relevance threshold are skipped and reported in `skippedDecks`, unless
 *      the caller passes `skipRelevanceCheck` ("Classify anyway").
 *   2. Classification: 10 cards per request, with the deck name. Each card is
 *      marked exam-relevant or not; only relevant cards get systems/topics.
 *      Off-exam cards are stored as a row with no system, so they're not
 *      re-sent next time and are counted as "not related".
 *
 * Every write replaces the card's previous rows for that exam, so re-running
 * never leaves stale classifications behind.
 */

import { instrumentedHandle, trackedCompletion, createLogger, consoleTransport } from '@sekel/observability';
import type { OpenAI } from 'openai';
import { createProxiedOpenAI, isBatchStoppingAiError, requireAiSession } from '../main/ai/openaiClient';
import {
    CLASSIFIER_VERSION,
    CLASSIFY_BATCH_SIZE,
    MIN_NOTES_TO_SCREEN,
    SCREEN_SAMPLE_SIZE,
    buildClassificationMessages,
    buildScreeningMessages,
    cardTextFromFields,
    isConfidentlyMapped,
    isDeckRelevant,
    parseClassificationResponse,
    parseScreeningResponse,
    pickEvenlySpaced,
    type CardOutcome,
    type TaxonomySystem,
} from '../main/ai/classification';

const log = createLogger({ module: 'classify', transports: [consoleTransport] });
import { getDb } from '../main/db/index';
import { CARD_WITH_NOTE_SQL, buildCardWithNote, getSystemPerformanceNeeds, fetchDeckYieldMix } from '../main/db/service';
import { yieldCteBody, toYieldLevel, MIN_YIELD_CONFIDENCE } from '../main/db/yieldSql';
import { daysUntilExamLocal } from '../lib/planMath';
import type { BatchClassifyResult, SkippedDeck, SessionQueueCard } from '../types/electron';

// ── OpenAI lazy singleton (same pattern as ai.ts) ──────────────────────────
// Calls go through the ai-proxy edge function as the signed-in user.

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    requireAiSession();
    if (!_openai) {
        _openai = createProxiedOpenAI();
    }
    return _openai;
}

const MODEL = 'gpt-4.1-mini';
const MODEL_VERSION = `${MODEL}#${CLASSIFIER_VERSION}`;
/** SQLite's default limit on bound parameters is 999; stay well under it. */
const SQL_CHUNK = 500;

export interface ClassifyBatchOptions {
    /** Classify every deck even if screening says it isn't exam material. */
    skipRelevanceCheck?: boolean;
}

// ── Exam context ────────────────────────────────────────────────────────────

interface ExamContext {
    examId: number;
    examKey: string;
    examLabel: string;
    taxonomy: TaxonomySystem[];
    systemIds: Map<string, number>;
    /** `${system_key}/${topic_key}` → topic id */
    topicIds: Map<string, number>;
}

/**
 * Look up the primary exam key for the user who owns a given card.
 * Falls back to 'step1' if the user has no exam profile.
 */
function resolveExamKeyForCard(cardId: string): string {
    const row = getDb().prepare(`
        SELECT be.exam_key
        FROM cards c
        JOIN user_exam_profiles uep ON uep.user_id = c.user_id AND uep.is_primary = 1
        JOIN blueprint_exams be ON be.id = uep.exam_id
        WHERE c.id = ?
        LIMIT 1
    `).get(cardId) as { exam_key: string } | undefined;
    return row?.exam_key ?? 'step1';
}

function loadExamContext(examKey: string): ExamContext {
    const examRow = getDb().prepare(
        'SELECT id, label FROM blueprint_exams WHERE exam_key = ?'
    ).get(examKey) as { id: number; label: string } | undefined;
    if (!examRow) throw new Error(`Exam not found: ${examKey}`);

    const rows = getDb().prepare(`
        SELECT bs.id AS system_id, bs.system_key, bs.label AS system_label,
               bt.id AS topic_id, bt.topic_key, bt.label AS topic_label
        FROM blueprint_systems bs
        LEFT JOIN blueprint_topics bt ON bt.system_id = bs.id
        WHERE bs.exam_id = ?
        ORDER BY bs.system_key, bt.topic_key
    `).all(examRow.id) as Array<{
        system_id: number; system_key: string; system_label: string;
        topic_id: number | null; topic_key: string | null; topic_label: string | null;
    }>;

    const systems = new Map<string, TaxonomySystem>();
    const systemIds = new Map<string, number>();
    const topicIds = new Map<string, number>();
    for (const r of rows) {
        let sys = systems.get(r.system_key);
        if (!sys) {
            sys = { system_key: r.system_key, label: r.system_label, topics: [] };
            systems.set(r.system_key, sys);
            systemIds.set(r.system_key, r.system_id);
        }
        if (r.topic_key && r.topic_id !== null) {
            sys.topics.push({ topic_key: r.topic_key, label: r.topic_label ?? r.topic_key });
            topicIds.set(`${r.system_key}/${r.topic_key}`, r.topic_id);
        }
    }
    const taxonomy = [...systems.values()];
    if (taxonomy.length === 0) throw new Error(`No systems found for exam: ${examKey}`);
    return { examId: examRow.id, examKey, examLabel: examRow.label, taxonomy, systemIds, topicIds };
}

// ── Card loading ────────────────────────────────────────────────────────────

interface CardRow {
    cardId: string;
    deckId: string;
    deckName: string;
    fields: string;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** Cards with their deck, in the order given. Unknown ids are dropped. */
function loadCardRows(cardIds: string[]): CardRow[] {
    const byId = new Map<string, CardRow>();
    for (const part of chunks(cardIds, SQL_CHUNK)) {
        const rows = getDb().prepare(`
            SELECT c.id AS card_id, n.deck_id, d.name AS deck_name, n.fields
            FROM cards c
            JOIN notes n ON n.id = c.note_id
            JOIN decks d ON d.id = n.deck_id
            WHERE c.id IN (${part.map(() => '?').join(',')})
        `).all(...part) as Array<{ card_id: string; deck_id: string; deck_name: string; fields: string }>;
        for (const r of rows) byId.set(r.card_id, { cardId: r.card_id, deckId: r.deck_id, deckName: r.deck_name, fields: r.fields });
    }
    return cardIds.map((id) => byId.get(id)).filter((r): r is CardRow => r !== undefined);
}

/** An evenly spread sample of a deck's notes (notes, so a cloze's siblings don't repeat). */
function loadDeckSample(deckId: string, size: number): { totalNotes: number; fields: string[] } {
    const db = getDb();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM notes WHERE deck_id = ?').get(deckId) as { n: number };
    const picks = pickEvenlySpaced(n, size).map((i) => i + 1);
    if (picks.length === 0) return { totalNotes: n, fields: [] };
    const rows = db.prepare(`
        SELECT fields FROM (
            SELECT fields, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
            FROM notes WHERE deck_id = ?
        ) WHERE rn IN (${picks.map(() => '?').join(',')})
        ORDER BY rn
    `).all(deckId, ...picks) as Array<{ fields: string }>;
    return { totalNotes: n, fields: rows.map((r) => r.fields) };
}

// ── Storage ─────────────────────────────────────────────────────────────────

/** Replaces the card's rows for this exam with the outcome (mapped or off-exam). */
function storeOutcome(cardId: string, ctx: ExamContext, outcome: Extract<CardOutcome, { kind: 'mapped' | 'off_exam' }>, now: string): void {
    const db = getDb();
    const insert = db.prepare(`
        INSERT INTO card_classifications
            (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
        db.prepare('DELETE FROM card_classifications WHERE card_id = ? AND exam_id = ?').run(cardId, ctx.examId);
        if (outcome.kind === 'off_exam') {
            insert.run(cardId, ctx.examId, null, null, 0, 1.0, now, MODEL_VERSION);
            return;
        }
        for (const c of outcome.classifications) {
            const systemId = ctx.systemIds.get(c.systemKey) ?? null;
            const topicId = c.topicKey ? ctx.topicIds.get(`${c.systemKey}/${c.topicKey}`) ?? null : null;
            insert.run(cardId, ctx.examId, systemId, topicId, c.confidence, c.splitWeight, now, MODEL_VERSION);
        }
    })();
}

/** Deletes classifications for these cards and exam. Returns how many cards had any. */
function clearClassifications(cardIds: string[], examId: number): number {
    const db = getDb();
    let cards = 0;
    for (const part of chunks(cardIds, SQL_CHUNK)) {
        const marks = part.map(() => '?').join(',');
        const { n } = db.prepare(
            `SELECT COUNT(DISTINCT card_id) AS n FROM card_classifications WHERE exam_id = ? AND card_id IN (${marks})`
        ).get(examId, ...part) as { n: number };
        db.prepare(`DELETE FROM card_classifications WHERE exam_id = ? AND card_id IN (${marks})`).run(examId, ...part);
        cards += n;
    }
    return cards;
}

// ── AI calls ────────────────────────────────────────────────────────────────

/**
 * Screens a deck. Returns null when the deck is too small to judge or the
 * reply was unusable (the per-card check still protects those cards).
 * Throws on request errors so the caller can decide whether to stop.
 */
async function screenDeck(deckId: string, deckName: string, ctx: ExamContext): Promise<Omit<SkippedDeck, 'cardCount'> & { isRelevant: boolean } | null> {
    const sample = loadDeckSample(deckId, SCREEN_SAMPLE_SIZE);
    if (sample.totalNotes < MIN_NOTES_TO_SCREEN) return null;
    const cards = sample.fields.map((f) => cardTextFromFields(f));

    const response = await trackedCompletion({
        operation: 'classify-screen',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: buildScreeningMessages({
                examLabel: ctx.examLabel,
                scope: ctx.taxonomy.map((s) => s.label),
                deckName,
                cards,
            }),
        }),
    });
    const parsed = parseScreeningResponse(response.choices[0]?.message?.content, cards.length);
    if (!parsed) {
        log.warn('Deck screening reply unusable; classifying with the per-card check only', { deckId });
        return null;
    }
    return {
        deckId,
        deckName,
        sampled: parsed.judged,
        relevant: parsed.relevant,
        subject: parsed.subject,
        isRelevant: isDeckRelevant(parsed),
    };
}

async function classifyChunk(rows: CardRow[], deckName: string, ctx: ExamContext): Promise<CardOutcome[]> {
    const response = await trackedCompletion({
        operation: 'classify',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: buildClassificationMessages({
                examLabel: ctx.examLabel,
                deckName,
                taxonomy: ctx.taxonomy,
                cards: rows.map((r) => cardTextFromFields(r.fields)),
            }),
        }),
    });
    return parseClassificationResponse(response.choices[0]?.message?.content, rows.length, ctx.taxonomy);
}

// ── Batch entry point ───────────────────────────────────────────────────────

export async function classifyCardsBatch(
    cardIds: string[],
    examKey?: string,
    force: boolean = false,
    options: ClassifyBatchOptions = {},
): Promise<BatchClassifyResult> {
    const result: BatchClassifyResult = {
        classified: 0, notRelated: 0, skipped: 0, errors: 0, skippedDecks: [], stoppedEarly: false,
    };
    const uniqueIds = [...new Set(cardIds)];
    if (uniqueIds.length === 0) return result;

    const ctx = loadExamContext(examKey ?? resolveExamKeyForCard(uniqueIds[0]));

    // Fail fast when signed out rather than letting every card fail
    // individually (which used to read as a silent "0 classified" in the UI).
    getOpenAI();

    let remaining = uniqueIds;
    if (!force) {
        const existing = new Set<string>();
        for (const part of chunks(uniqueIds, SQL_CHUNK)) {
            const rows = getDb().prepare(
                `SELECT DISTINCT card_id FROM card_classifications WHERE exam_id = ? AND card_id IN (${part.map(() => '?').join(',')})`
            ).all(ctx.examId, ...part) as Array<{ card_id: string }>;
            rows.forEach((r) => existing.add(r.card_id));
        }
        remaining = uniqueIds.filter((id) => !existing.has(id));
        result.skipped = uniqueIds.length - remaining.length;
    }

    const rows = loadCardRows(remaining);
    result.errors += remaining.length - rows.length; // ids that no longer exist

    const byDeck = new Map<string, CardRow[]>();
    for (const r of rows) {
        const list = byDeck.get(r.deckId) ?? [];
        list.push(r);
        byDeck.set(r.deckId, list);
    }

    const now = () => new Date().toISOString();
    let notAttempted = rows.length;

    try {
        for (const [deckId, deckRows] of byDeck) {
            const deckName = deckRows[0].deckName;

            if (!options.skipRelevanceCheck) {
                let screening: Awaited<ReturnType<typeof screenDeck>> = null;
                try {
                    screening = await screenDeck(deckId, deckName, ctx);
                } catch (err) {
                    if (isBatchStoppingAiError(err)) throw err;
                    log.warn('Deck screening failed; classifying with the per-card check only', {
                        deckId, error: err instanceof Error ? err.message : String(err),
                    });
                }
                if (screening && !screening.isRelevant) {
                    const info: SkippedDeck = {
                        deckId,
                        deckName,
                        cardCount: deckRows.length,
                        sampled: screening.sampled,
                        relevant: screening.relevant,
                        subject: screening.subject,
                    };
                    result.skippedDecks.push(info);
                    // A forced re-run means "redo from scratch": drop the deck's
                    // old classifications too, so earlier mistakes don't linger.
                    if (force) clearClassifications(deckRows.map((r) => r.cardId), ctx.examId);
                    notAttempted -= deckRows.length;
                    log.info('Deck skipped: not exam material', {
                        deckId, sampled: info.sampled, relevant: info.relevant, subject: info.subject,
                    });
                    continue;
                }
            }

            for (const chunk of chunks(deckRows, CLASSIFY_BATCH_SIZE)) {
                let outcomes: CardOutcome[];
                try {
                    outcomes = await classifyChunk(chunk, deckName, ctx);
                } catch (err) {
                    if (isBatchStoppingAiError(err)) throw err;
                    log.error('Classification request failed', {
                        deckId, cards: chunk.length, error: err instanceof Error ? err.message : String(err),
                    });
                    result.errors += chunk.length;
                    notAttempted -= chunk.length;
                    continue;
                }
                const stamp = now();
                outcomes.forEach((outcome, i) => {
                    if (outcome.kind === 'invalid') {
                        result.errors++;
                        log.warn('Card not classified', { cardId: chunk[i].cardId, reason: outcome.reason });
                        return;
                    }
                    storeOutcome(chunk[i].cardId, ctx, outcome, stamp);
                    if (isConfidentlyMapped(outcome)) result.classified++;
                    else result.notRelated++;
                });
                notAttempted -= chunk.length;
            }
        }
    } catch (err) {
        // Signed out or out of today's AI allowance: every remaining request
        // would fail the same way. Stop; a later run skips finished cards.
        result.stoppedEarly = true;
        result.errors += notAttempted;
        log.warn('Classification stopped early', {
            notAttempted, error: err instanceof Error ? err.message : String(err),
        });
    }

    log.info('Classification batch done', {
        examKey: ctx.examKey,
        classified: result.classified,
        notRelated: result.notRelated,
        skipped: result.skipped,
        errors: result.errors,
        skippedDecks: result.skippedDecks.length,
    });
    return result;
}

/** Removes a deck's classifications for an exam (its own cards, not subdecks). */
export function clearDeckClassifications(deckId: string, examKey: string): { clearedCards: number } {
    const exam = getDb().prepare('SELECT id FROM blueprint_exams WHERE exam_key = ?').get(examKey) as { id: number } | undefined;
    if (!exam) throw new Error(`Exam not found: ${examKey}`);
    const ids = (getDb().prepare(`
        SELECT c.id FROM cards c JOIN notes n ON n.id = c.note_id WHERE n.deck_id = ?
    `).all(deckId) as Array<{ id: string }>).map((r) => r.id);
    return { clearedCards: clearClassifications(ids, exam.id) };
}

// ── Yield Scores ────────────────────────────────────────────────────────────

export interface YieldScoreRow {
    cardId: string;
    yieldScore: number | null;
    yieldLevel: 'high' | 'medium' | 'low' | 'unclassified';
    systemKey: string | null;
    topicKey: string | null;
}

function getYieldScores(examKey: string, cardIds?: string[]): YieldScoreRow[] {
    const db = getDb();

    const examRow = db.prepare(
        'SELECT id FROM blueprint_exams WHERE exam_key = ?'
    ).get(examKey) as { id: number } | undefined;
    if (!examRow) throw new Error(`Exam not found: ${examKey}`);

    let cardFilter = '';
    const params: unknown[] = [examRow.id];

    if (cardIds && cardIds.length > 0) {
        const placeholders = cardIds.map(() => '?').join(',');
        cardFilter = `AND cc.card_id IN (${placeholders})`;
        params.push(...cardIds);
    }

    const rows = db.prepare(yieldCteBody(cardFilter)).all(...params) as Array<{
        card_id: string;
        yield_score: number | null;
        max_confidence: number | null;
        system_key: string | null;
        topic_key: string | null;
    }>;

    const resultMap = new Map<string, YieldScoreRow>();
    for (const row of rows) {
        resultMap.set(row.card_id, {
            cardId: row.card_id,
            yieldScore: row.yield_score,
            yieldLevel: toYieldLevel(row.yield_score, row.max_confidence),
            systemKey: row.system_key,
            topicKey: row.topic_key,
        });
    }

    if (cardIds) {
        for (const id of cardIds) {
            if (!resultMap.has(id)) {
                resultMap.set(id, {
                    cardId: id,
                    yieldScore: null,
                    yieldLevel: 'unclassified',
                    systemKey: null,
                    topicKey: null,
                });
            }
        }
    }

    return Array.from(resultMap.values());
}

function getYieldExplanation(cardId: string, examKey: string): string {
    const db = getDb();

    const row = db.prepare(`
        SELECT
            cc.confidence,
            cc.split_weight,
            bs.label AS system_label,
            bs.weight_min,
            bs.weight_max,
            bt.relative_weight,
            be.label AS exam_label
        FROM card_classifications cc
        JOIN blueprint_exams be ON be.id = cc.exam_id
        JOIN blueprint_systems bs ON bs.id = cc.system_id
        LEFT JOIN blueprint_topics bt ON bt.id = cc.topic_id
        WHERE cc.card_id = ? AND be.exam_key = ?
        ORDER BY cc.split_weight DESC
        LIMIT 1
    `).get(cardId, examKey) as {
        confidence: number;
        split_weight: number;
        system_label: string;
        weight_min: number;
        weight_max: number;
        relative_weight: number | null;
        exam_label: string;
    } | undefined;

    if (!row) return 'Unclassified: no blueprint classification found for this card.';

    const scores = getYieldScores(examKey, [cardId]);
    const score = scores[0];
    const level = score?.yieldLevel ?? 'unclassified';

    if (level === 'unclassified') {
        return `Unclassified: ${row.system_label} — low confidence (${row.confidence.toFixed(2)}).`;
    }

    const midWeight = ((row.weight_min + row.weight_max) / 2).toFixed(0);
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
    const matchStrength = row.confidence >= 0.85 ? 'strong' : row.confidence >= 0.6 ? 'moderate' : 'weak';

    return `${levelLabel} yield: ${row.system_label} (${midWeight}% of ${row.exam_label}) — ${matchStrength} blueprint match, confidence ${row.confidence.toFixed(2)}`;
}

// ── Session Queue ────────────────────────────────────────────────────────────

function computeTimeMultiplier(
    profileRow: { exam_date: string; session_mode: string } | undefined,
): { timeMultiplier: number; daysUntilExam: number | null } {
    if (!profileRow) return { timeMultiplier: 1.0, daysUntilExam: null };

    if (profileRow.session_mode === 'triage') {
        return { timeMultiplier: 2.5, daysUntilExam: daysUntilExamLocal(profileRow.exam_date) };
    }

    if (profileRow.session_mode === 'mixed') {
        return { timeMultiplier: 1.0, daysUntilExam: null };
    }

    // session_mode = 'auto' or any other value — use step function.
    // Whole LOCAL calendar days (0 = exam day) — see daysUntilExamLocal.
    const daysUntilExam = daysUntilExamLocal(profileRow.exam_date);

    let timeMultiplier = 1.0;
    if (daysUntilExam < 7)        timeMultiplier = 2.5;
    else if (daysUntilExam < 30)  timeMultiplier = 2.0;
    else if (daysUntilExam < 90)  timeMultiplier = 1.5;
    else if (daysUntilExam <= 180) timeMultiplier = 1.2;

    return { timeMultiplier, daysUntilExam };
}

function buildSessionQueue(userId: string, examKey: string, limit = 200): SessionQueueCard[] {
    const db = getDb();
    const now = new Date().toISOString();

    const examRow = db.prepare(
        'SELECT id FROM blueprint_exams WHERE exam_key = ?'
    ).get(examKey) as { id: number } | undefined;
    if (!examRow) throw new Error(`Exam not found: ${examKey}`);

    const profileRow = db.prepare(`
        SELECT exam_date, session_mode
        FROM user_exam_profiles
        WHERE user_id = ? AND exam_id = ? AND is_primary = 1
    `).get(userId, examRow.id) as { exam_date: string; session_mode: string } | undefined;

    const { timeMultiplier, daysUntilExam } = computeTimeMultiplier(profileRow);

    const rows = db.prepare(`
        WITH yield_cte AS (${yieldCteBody()})
        SELECT base.*, ys.yield_score, ys.max_confidence, ys.system_key, ys.topic_key
        FROM (
            ${CARD_WITH_NOTE_SQL}
            WHERE c.user_id = ?
              AND (
                  c.state IN ('learning', 'relearning', 'new')
                  OR (c.state = 'review' AND c.due <= ?)
              )
        ) base
        LEFT JOIN yield_cte ys ON ys.card_id = base.id
        ORDER BY
            CASE WHEN ys.yield_score IS NULL THEN 1 ELSE 0 END ASC,
            ys.yield_score DESC
        LIMIT ?
    `).all(examRow.id, userId, now, limit) as Array<Record<string, unknown>>;

    return rows.map(row => {
        const card = buildCardWithNote(row);
        const yieldScore = (row.yield_score as number | null) ?? null;
        const maxConfidence = (row.max_confidence as number | null) ?? null;
        const prioritizationScore = yieldScore !== null
            ? Math.round(yieldScore * timeMultiplier * 10) / 10
            : 0;

        return {
            ...card,
            yield_score: yieldScore,
            yield_level: toYieldLevel(yieldScore, maxConfidence),
            prioritization_score: prioritizationScore,
            system_key: (row.system_key as string | null) ?? null,
            topic_key: (row.topic_key as string | null) ?? null,
            time_multiplier: timeMultiplier,
            days_until_exam: daysUntilExam,
        };
    });
}

// ── Per-deck classification count ────────────────────────────────────────────

/**
 * classified  = cards mapped to a blueprint system with enough confidence to
 *               get a yield level (the same rule toYieldLevel uses);
 * notRelated  = cards that were checked but aren't exam material (off-exam,
 *               or only low-confidence matches);
 * total       = all of the deck's own cards.
 */
export function getDeckClassificationCount(
    deckId: string,
    examKey: string,
): { classified: number; notRelated: number; total: number } {
    const row = getDb().prepare(`
        WITH per_card AS (
            SELECT
                c.id,
                MAX(CASE WHEN cc.card_id IS NOT NULL THEN 1 ELSE 0 END) AS checked,
                MAX(CASE WHEN cc.system_id IS NOT NULL AND cc.confidence >= ? THEN 1 ELSE 0 END) AS mapped
            FROM cards c
            JOIN notes n ON c.note_id = n.id
            JOIN blueprint_exams be ON be.exam_key = ?
            LEFT JOIN card_classifications cc
                ON cc.card_id = c.id AND cc.exam_id = be.id
            WHERE n.deck_id = ?
            GROUP BY c.id
        )
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(mapped), 0) AS classified,
            COALESCE(SUM(CASE WHEN checked = 1 AND mapped = 0 THEN 1 ELSE 0 END), 0) AS not_related
        FROM per_card
    `).get(MIN_YIELD_CONFIDENCE, examKey, deckId) as { total: number; classified: number; not_related: number } | undefined;

    return {
        classified: row?.classified ?? 0,
        notRelated: row?.not_related ?? 0,
        total: row?.total ?? 0,
    };
}

// ── IPC Registration ────────────────────────────────────────────────────────

export function setupClassifyHandlers(): void {
    // A single card is too small to screen as a deck; the per-card check applies.
    instrumentedHandle('yield:classify-card', (_e, cardId: string, examKey?: string) =>
        classifyCardsBatch([String(cardId)], examKey, true, { skipRelevanceCheck: true }));

    instrumentedHandle('yield:classify-batch', (_e, cardIds: string[], examKey?: string, force?: boolean, options?: ClassifyBatchOptions) =>
        classifyCardsBatch(
            Array.isArray(cardIds) ? cardIds.map(String) : [],
            examKey,
            force === true,
            { skipRelevanceCheck: options?.skipRelevanceCheck === true },
        ));

    instrumentedHandle('yield:clear-deck-classifications', (_e, deckId: string, examKey: string) =>
        clearDeckClassifications(String(deckId), String(examKey)));

    instrumentedHandle('yield:get-scores', (_e, examKey: string, cardIds?: string[]) =>
        getYieldScores(examKey, cardIds));

    instrumentedHandle('yield:get-explanation', (_e, cardId: string, examKey: string) =>
        getYieldExplanation(cardId, examKey));

    instrumentedHandle('yield:build-session-queue', (_e, userId: string, examKey: string, limit?: number) =>
        buildSessionQueue(userId, examKey, limit));

    instrumentedHandle('classify:getSystemPerformanceNeeds', (_e, userId: string, examKey: string) =>
        getSystemPerformanceNeeds(userId, examKey));

    instrumentedHandle('yield:getDeckClassificationCount', (_e, deckId: string, examKey: string) =>
        getDeckClassificationCount(deckId, examKey));

    instrumentedHandle('yield:getDeckYieldMix', (_e, deckIds: string[], examKey: string) =>
        fetchDeckYieldMix(deckIds, examKey));
}
