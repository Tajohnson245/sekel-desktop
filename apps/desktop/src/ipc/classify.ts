/**
 * Card Classification Service
 *
 * Classifies flashcards into an exam blueprint taxonomy using GPT-4.1 Mini.
 * Writes results to the card_classifications table in SQLite.
 */

import { ipcMain } from 'electron';
import { OpenAI } from 'openai';
import { getDb } from '../main/db/index';

// ── OpenAI lazy singleton (same pattern as ai.ts) ──────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!_openai) {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing VITE_OPENAI_API_KEY. Set it in your .env.local file.');
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

    const response = await getOpenAI().chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Card Front: ${front}\nCard Back: ${back}\n\nBlueprint Taxonomy:\n${JSON.stringify(taxonomy)}`,
            },
        ],
        response_format: { type: 'json_object' },
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

// ── IPC Registration ────────────────────────────────────────────────────────

export function setupClassifyHandlers(): void {
    ipcMain.handle('yield:classify-card', (_e, cardId: string, examKey: string) =>
        classifyCard(cardId, examKey));

    ipcMain.handle('yield:classify-batch', (_e, cardIds: string[], examKey: string, force?: boolean) =>
        classifyCardsBatch(cardIds, examKey, force));
}
