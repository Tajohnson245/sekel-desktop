/**
 * Shared yield-score SQL — single source of truth for "how exam-important is this
 * card." Previously this CTE was copy-pasted in three places (computePlan in
 * planService, getYieldScores + buildSessionQueue in ipc/classify), which let the
 * formula, joins, and thresholds drift independently. They now all build from here.
 *
 * ── Scoring model ────────────────────────────────────────────────────────────
 * A card's raw exam weight = Σ over its classifications of
 *     systemWeightMidpoint(%) × topicRelativeWeight × confidence × splitWeight
 * where systemWeightMidpoint is the system's share of the exam (0–100) and
 * topicRelativeWeight is the topic's share of that system (0–1).
 *
 * That raw value is then NORMALIZED to a 0–100 scale by dividing by the exam's
 * single heaviest system×topic weight, so a card testing the exam's most
 * important material scores ~100 and the high/medium/low thresholds mean the same
 * thing regardless of how a given blueprint is structured. (The previous formula
 * multiplied an already-percentage weight by ×100, pushing almost every card past
 * the "high" threshold and making the chips useless.)
 *
 * COALESCE(relative_weight, 1.0): a classification with no resolved topic — every
 * NBME shelf/subject exam, which ships systems but no topics — is scored on its
 * system weight alone (topic share treated as the whole system) instead of being
 * dropped. Paired with the LEFT JOIN below so those cards are scored, not skipped.
 */

/** Normalized 0–100 yield score expression, evaluated per grouped card (`cc`). */
export const YIELD_SCORE_EXPR = `
    ROUND(
        100.0 * SUM(
            ((bs.weight_min + bs.weight_max) / 2.0)
            * COALESCE(bt.relative_weight, 1.0)
            * cc.confidence
            * cc.split_weight
        )
        / NULLIF((
            SELECT MAX(((bs3.weight_min + bs3.weight_max) / 2.0) * COALESCE(bt3.relative_weight, 1.0))
            FROM blueprint_systems bs3
            LEFT JOIN blueprint_topics bt3 ON bt3.system_id = bs3.id
            WHERE bs3.exam_id = cc.exam_id
        ), 0.0)
    , 1)
`;

/**
 * Inner SELECT for the yield CTE: one row per card with its normalized yield
 * score, max confidence, and dominant system/topic keys. Binds a single `?` for
 * `exam_id`; pass a `cardFilter` (already containing its own `?` placeholders,
 * bound AFTER exam_id) to scope to specific cards.
 */
export function yieldCteBody(cardFilter = ''): string {
    return `
        SELECT
            cc.card_id,
            ${YIELD_SCORE_EXPR} AS yield_score,
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
        -- LEFT JOIN (not INNER): classifications with no resolved topic — notably every
        -- NBME shelf/subject exam, which ships system weights but no topic rows — must
        -- still be scored and bucketed into their system rather than silently dropped.
        LEFT JOIN blueprint_topics bt ON bt.id = cc.topic_id
        WHERE cc.exam_id = ? ${cardFilter}
        GROUP BY cc.card_id
    `;
}

export type YieldLevel = 'high' | 'medium' | 'low' | 'unclassified';

/** Priority order for yield-first sorting (high first). */
export const YIELD_LEVEL_ORDER: Record<YieldLevel, number> = { high: 0, medium: 1, low: 2, unclassified: 3 };

/**
 * Bucket a normalized 0–100 yield score into a level. A card the model mapped with
 * low confidence (<0.5) is "unclassified" regardless of score. Thresholds are set
 * against the normalized scale: ≥66 high, ≥33 medium, else low.
 */
export function toYieldLevel(score: number | null, confidence: number | null): YieldLevel {
    if (score === null || confidence === null || confidence < 0.5) return 'unclassified';
    if (score >= 66) return 'high';
    if (score >= 33) return 'medium';
    return 'low';
}
