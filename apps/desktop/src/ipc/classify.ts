/**
 * Card Classification Service
 *
 * Classifies flashcards into an exam blueprint taxonomy using GPT-4.1 Mini.
 * Writes results to the card_classifications table in SQLite.
 */

import { instrumentedHandle, trackedCompletion, createLogger, consoleTransport } from '@sekel/observability';
import { OpenAI } from 'openai';

const log = createLogger({ module: 'classify', transports: [consoleTransport] });
import { getDb } from '../main/db/index';
import { CARD_WITH_NOTE_SQL, buildCardWithNote, getSystemPerformanceNeeds } from '../main/db/service';
import type { SessionQueueCard } from '../types/electron';

// ── OpenAI lazy singleton (same pattern as ai.ts) ──────────────────────────

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

const MODEL = 'gpt-4.1-mini';

const SYSTEM_PROMPT =
    'You are a medical education content classifier. Your job is to classify flashcard content into a structured exam blueprint taxonomy. You will be given a flashcard (front and back) and a blueprint taxonomy. Return ONLY a JSON object. If the card maps cleanly to one system, return: { exam_key, system_key, topic_key, confidence, reasoning }. If the card spans multiple systems, return: { exam_key, multi_system: true, classifications: [{ system_key, topic_key, confidence, split_weight, reasoning }] } where split_weight values sum to 1.0. Confidence reflects how cleanly the card maps (0.0–1.0). If the card is off-blueprint, return system_key: \'other\' with confidence < 0.3. Never return markdown, code blocks, or any text outside the JSON object.';

// ── Types ───────────────────────────────────────────────────────────────────

interface SingleClassification {
    exam_key: string;
    system_key: string;
    topic_key: string;
    confidence: number;
    reasoning: string;
}

interface MultiClassification {
    exam_key: string;
    multi_system: true;
    classifications: Array<{
        system_key: string;
        topic_key: string;
        confidence: number;
        split_weight: number;
        reasoning: string;
    }>;
}

type ClassificationResponse = SingleClassification | MultiClassification;

interface TaxonomySystem {
    system_key: string;
    label: string;
    topics: Array<{
        topic_key: string;
        label: string;
        physician_task: string | null;
    }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fetchCardContent(cardId: string): { front: string; back: string } {
    const row = getDb().prepare(`
        SELECT n.fields AS note_fields
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        WHERE c.id = ?
    `).get(cardId) as { note_fields: string } | undefined;

    if (!row) throw new Error(`Card not found: ${cardId}`);

    const fields = JSON.parse(row.note_fields) as Record<string, string>;
    const front = fields.Front ?? fields.front ?? Object.values(fields)[0] ?? '';
    const back = fields.Back ?? fields.back ?? Object.values(fields)[1] ?? '';
    return { front, back };
}

function loadBlueprintTaxonomy(examKey: string): { examId: number; taxonomy: TaxonomySystem[] } {
    const examRow = getDb().prepare(
        'SELECT id FROM blueprint_exams WHERE exam_key = ?'
    ).get(examKey) as { id: number } | undefined;

    if (!examRow) throw new Error(`Exam not found: ${examKey}`);

    const rows = getDb().prepare(`
        SELECT
            bs.system_key, bs.label AS system_label,
            bt.topic_key, bt.label AS topic_label, bt.physician_task
        FROM blueprint_systems bs
        LEFT JOIN blueprint_topics bt ON bt.system_id = bs.id
        WHERE bs.exam_id = ?
        ORDER BY bs.system_key, bt.topic_key
    `).all(examRow.id) as Array<{
        system_key: string;
        system_label: string;
        topic_key: string | null;
        topic_label: string | null;
        physician_task: string | null;
    }>;

    const systemMap = new Map<string, TaxonomySystem>();
    for (const row of rows) {
        let sys = systemMap.get(row.system_key);
        if (!sys) {
            sys = { system_key: row.system_key, label: row.system_label, topics: [] };
            systemMap.set(row.system_key, sys);
        }
        if (row.topic_key) {
            sys.topics.push({
                topic_key: row.topic_key,
                label: row.topic_label!,
                physician_task: row.physician_task,
            });
        }
    }

    const taxonomy = Array.from(systemMap.values());
    if (taxonomy.length === 0) throw new Error(`No systems found for exam: ${examKey}`);

    return { examId: examRow.id, taxonomy };
}

function resolveSystemId(examId: number, systemKey: string): number | null {
    if (systemKey === 'other') return null;
    const row = getDb().prepare(
        'SELECT id FROM blueprint_systems WHERE exam_id = ? AND system_key = ?'
    ).get(examId, systemKey) as { id: number } | undefined;
    return row?.id ?? null;
}

function resolveTopicId(systemId: number | null, topicKey: string): number | null {
    if (!systemId) return null;
    const row = getDb().prepare(
        'SELECT id FROM blueprint_topics WHERE system_id = ? AND topic_key = ?'
    ).get(systemId, topicKey) as { id: number } | undefined;
    return row?.id ?? null;
}

function upsertClassification(
    cardId: string,
    examId: number,
    response: ClassificationResponse,
): void {
    const now = new Date().toISOString();
    const db = getDb();

    const isMulti = 'multi_system' in response && response.multi_system === true;

    const upsert = db.prepare(`
        INSERT INTO card_classifications
            (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at, model_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(card_id, exam_id, system_id) DO UPDATE SET
            topic_id      = excluded.topic_id,
            confidence    = excluded.confidence,
            split_weight  = excluded.split_weight,
            classified_at = excluded.classified_at,
            model_version = excluded.model_version
    `);

    const deleteExisting = db.prepare(
        'DELETE FROM card_classifications WHERE card_id = ? AND exam_id = ?'
    );

    if (isMulti) {
        const multi = response as MultiClassification;
        db.transaction(() => {
            deleteExisting.run(cardId, examId);
            for (const c of multi.classifications) {
                const systemId = resolveSystemId(examId, c.system_key);
                const topicId = resolveTopicId(systemId, c.topic_key);
                upsert.run(cardId, examId, systemId, topicId, c.confidence, c.split_weight, now, MODEL);
            }
        })();
    } else {
        const single = response as SingleClassification;
        const systemId = resolveSystemId(examId, single.system_key);
        const topicId = resolveTopicId(systemId, single.topic_key);
        upsert.run(cardId, examId, systemId, topicId, single.confidence, 1.0, now, MODEL);
    }
}

// ── Core Functions ──────────────────────────────────────────────────────────

async function classifyCard(
    cardId: string,
    examKey: string,
): Promise<ClassificationResponse> {
    const { front, back } = fetchCardContent(cardId);
    const { examId, taxonomy } = loadBlueprintTaxonomy(examKey);

    const response = await trackedCompletion({
        operation: 'classify',
        logger: log,
        call: getOpenAI().chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Card Front: ${front}\nCard Back: ${back}\n\nBlueprint Taxonomy:\n${JSON.stringify(taxonomy)}`,
                },
            ],
            response_format: { type: 'json_object' },
        }),
    });

    const raw = JSON.parse(response.choices[0].message.content || '{}') as ClassificationResponse;
    upsertClassification(cardId, examId, raw);
    return raw;
}

async function classifyCardsBatch(
    cardIds: string[],
    examKey: string,
    force: boolean = false,
): Promise<{ classified: number; skipped: number; errors: number }> {
    const examRow = getDb().prepare(
        'SELECT id FROM blueprint_exams WHERE exam_key = ?'
    ).get(examKey) as { id: number } | undefined;
    if (!examRow) throw new Error(`Exam not found: ${examKey}`);

    let remaining = cardIds;
    let skipped = 0;

    if (!force && cardIds.length > 0) {
        const placeholders = cardIds.map(() => '?').join(',');
        const existing = getDb().prepare(
            `SELECT DISTINCT card_id FROM card_classifications WHERE card_id IN (${placeholders}) AND exam_id = ?`
        ).all(...cardIds, examRow.id) as Array<{ card_id: string }>;

        const existingSet = new Set(existing.map(r => r.card_id));
        remaining = cardIds.filter(id => !existingSet.has(id));
        skipped = cardIds.length - remaining.length;
    }

    let classified = 0;
    let errors = 0;

    for (let i = 0; i < remaining.length; i++) {
        console.log(`[classify] ${i + 1}/${remaining.length}: ${remaining[i]}`);
        try {
            await classifyCard(remaining[i], examKey);
            classified++;
        } catch (err) {
            console.error(`[classify] failed for ${remaining[i]}:`, err);
            errors++;
        }
        if (i < remaining.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log(`[classify] Done. classified=${classified} skipped=${skipped} errors=${errors}`);
    return { classified, skipped, errors };
}

// ── Yield Scores ────────────────────────────────────────────────────────────

export interface YieldScoreRow {
    cardId: string;
    yieldScore: number | null;
    yieldLevel: 'high' | 'medium' | 'low' | 'unclassified';
    systemKey: string | null;
    topicKey: string | null;
}

function toYieldLevel(score: number | null, confidence: number | null): YieldScoreRow['yieldLevel'] {
    if (score === null || confidence === null || confidence < 0.5) return 'unclassified';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
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

    const rows = db.prepare(`
        SELECT
            cc.card_id,
            ROUND(
                SUM(
                    ((bs.weight_min + bs.weight_max) / 2.0)
                    * bt.relative_weight
                    * cc.confidence
                    * cc.split_weight
                    * 100
                ), 1
            ) AS yield_score,
            MAX(cc.confidence) AS max_confidence,
            (
                SELECT bs2.system_key
                FROM card_classifications cc2
                JOIN blueprint_systems bs2 ON bs2.id = cc2.system_id
                WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
                ORDER BY cc2.split_weight DESC LIMIT 1
            ) AS system_key,
            (
                SELECT bt2.topic_key
                FROM card_classifications cc2
                LEFT JOIN blueprint_topics bt2 ON bt2.id = cc2.topic_id
                WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
                ORDER BY cc2.split_weight DESC LIMIT 1
            ) AS topic_key
        FROM card_classifications cc
        JOIN blueprint_systems bs ON bs.id = cc.system_id
        JOIN blueprint_topics bt ON bt.id = cc.topic_id
        WHERE cc.exam_id = ? ${cardFilter}
        GROUP BY cc.card_id
    `).all(...params) as Array<{
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
        const examDate = new Date(profileRow.exam_date);
        const days = Math.floor((examDate.getTime() - Date.now()) / 86_400_000);
        return { timeMultiplier: 2.5, daysUntilExam: days };
    }

    if (profileRow.session_mode === 'mixed') {
        return { timeMultiplier: 1.0, daysUntilExam: null };
    }

    // session_mode = 'auto' or any other value — use step function
    const examDate = new Date(profileRow.exam_date);
    const daysUntilExam = Math.floor((examDate.getTime() - Date.now()) / 86_400_000);

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
        WITH yield_cte AS (
            SELECT
                cc.card_id,
                ROUND(SUM(
                    ((bs.weight_min + bs.weight_max) / 2.0)
                    * bt.relative_weight
                    * cc.confidence
                    * cc.split_weight
                    * 100
                ), 1) AS yield_score,
                MAX(cc.confidence) AS max_confidence,
                (
                    SELECT bs2.system_key
                    FROM card_classifications cc2
                    JOIN blueprint_systems bs2 ON bs2.id = cc2.system_id
                    WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
                    ORDER BY cc2.split_weight DESC LIMIT 1
                ) AS system_key,
                (
                    SELECT bt2.topic_key
                    FROM card_classifications cc2
                    LEFT JOIN blueprint_topics bt2 ON bt2.id = cc2.topic_id
                    WHERE cc2.card_id = cc.card_id AND cc2.exam_id = cc.exam_id
                    ORDER BY cc2.split_weight DESC LIMIT 1
                ) AS topic_key
            FROM card_classifications cc
            JOIN blueprint_systems bs ON bs.id = cc.system_id
            JOIN blueprint_topics bt ON bt.id = cc.topic_id
            WHERE cc.exam_id = ?
            GROUP BY cc.card_id
        )
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

// ── IPC Registration ────────────────────────────────────────────────────────

export function setupClassifyHandlers(): void {
    instrumentedHandle('yield:classify-card', (_e, cardId: string, examKey: string) =>
        classifyCard(cardId, examKey));

    instrumentedHandle('yield:classify-batch', (_e, cardIds: string[], examKey: string, force?: boolean) =>
        classifyCardsBatch(cardIds, examKey, force));

    instrumentedHandle('yield:get-scores', (_e, examKey: string, cardIds?: string[]) =>
        getYieldScores(examKey, cardIds));

    instrumentedHandle('yield:get-explanation', (_e, cardId: string, examKey: string) =>
        getYieldExplanation(cardId, examKey));

    instrumentedHandle('yield:build-session-queue', (_e, userId: string, examKey: string, limit?: number) =>
        buildSessionQueue(userId, examKey, limit));

    instrumentedHandle('classify:getSystemPerformanceNeeds', (_e, userId: string, examKey: string) =>
        getSystemPerformanceNeeds(userId, examKey));
}
