/**
 * Lightweight IPC input validation for critical database write operations.
 *
 * Validates payloads at the IPC boundary before they reach the service layer.
 * Throws on the first failing rule with a descriptive error message.
 */

// ── Helpers ──────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
    return typeof v === 'string';
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every(item => typeof item === 'string');
}

function isOneOf<T extends string>(v: unknown, values: readonly T[]): v is T {
    return typeof v === 'string' && (values as readonly string[]).includes(v);
}

// ── Core validate function ───────────────────────────────────────────

interface Rule {
    field: string;
    check: (value: unknown) => boolean;
    message: string;
}

export function validate(
    channel: string,
    payload: unknown,
    rules: Rule[],
): void {
    if (!isObject(payload)) {
        throw new Error(`IPC validation failed (${channel}): payload must be a non-null object`);
    }
    for (const rule of rules) {
        if (!rule.check(payload[rule.field])) {
            throw new Error(`IPC validation failed (${channel}): ${rule.message}`);
        }
    }
}

// ── Shared constants ────────────────────────────────────────────────

const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
const ALGORITHMS = ['fsrs', 'sm2'] as const;
const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;

// ── Schema: createDeck ──────────────────────────────────────────────

export const createDeckRules: Rule[] = [
    {
        field: 'user_id',
        check: isNonEmptyString,
        message: "field 'user_id' must be a non-empty string",
    },
    {
        field: 'name',
        check: (v) => isNonEmptyString(v) && v.length <= MAX_NAME_LENGTH,
        message: `field 'name' must be a non-empty string (max ${MAX_NAME_LENGTH} chars)`,
    },
    {
        field: 'description',
        check: (v) => v === undefined || v === null || (isString(v) && v.length <= MAX_DESCRIPTION_LENGTH),
        message: `field 'description' must be a string (max ${MAX_DESCRIPTION_LENGTH} chars) or null`,
    },
    {
        field: 'algorithm',
        check: (v) => v === undefined || isOneOf(v, ALGORITHMS),
        message: "field 'algorithm' must be 'fsrs' or 'sm2'",
    },
    {
        field: 'parent_id',
        check: (v) => v === undefined || v === null || isNonEmptyString(v),
        message: "field 'parent_id' must be a string or null",
    },
];

// ── Schema: createNote ──────────────────────────────────────────────

export const createNoteRules: Rule[] = [
    {
        field: 'user_id',
        check: isNonEmptyString,
        message: "field 'user_id' must be a non-empty string",
    },
    {
        field: 'deck_id',
        check: isNonEmptyString,
        message: "field 'deck_id' must be a non-empty string",
    },
    {
        field: 'note_type_id',
        check: isNonEmptyString,
        message: "field 'note_type_id' must be a non-empty string",
    },
    {
        field: 'fields',
        check: isObject,
        message: "field 'fields' must be a non-null object",
    },
    {
        field: 'tags',
        check: isStringArray,
        message: "field 'tags' must be an array of strings",
    },
];

// ── Schema: updateCardAfterReview ───────────────────────────────────

export const updateCardAfterReviewRules: Rule[] = [
    {
        field: 'state',
        check: (v) => v === undefined || isOneOf(v, CARD_STATES),
        message: "field 'state' must be one of: new, learning, review, relearning",
    },
    {
        field: 'due',
        check: (v) => v === undefined || isNonEmptyString(v),
        message: "field 'due' must be a non-empty string (ISO date)",
    },
    {
        field: 'stability',
        check: (v) => v === undefined || isFiniteNumber(v),
        message: "field 'stability' must be a finite number",
    },
    {
        field: 'difficulty',
        check: (v) => v === undefined || isFiniteNumber(v),
        message: "field 'difficulty' must be a finite number",
    },
    {
        field: 'elapsed_days',
        check: (v) => v === undefined || isFiniteNumber(v),
        message: "field 'elapsed_days' must be a finite number",
    },
    {
        field: 'scheduled_days',
        check: (v) => v === undefined || isFiniteNumber(v),
        message: "field 'scheduled_days' must be a finite number",
    },
    {
        field: 'reps',
        check: (v) => v === undefined || isNonNegativeInt(v),
        message: "field 'reps' must be a non-negative integer",
    },
    {
        field: 'lapses',
        check: (v) => v === undefined || isNonNegativeInt(v),
        message: "field 'lapses' must be a non-negative integer",
    },
    {
        field: 'last_review',
        check: (v) => v === undefined || v === null || isNonEmptyString(v),
        message: "field 'last_review' must be a string (ISO date) or null",
    },
];

// ── Schema: insertReview ────────────────────────────────────────────

export const insertReviewRules: Rule[] = [
    {
        field: 'user_id',
        check: isNonEmptyString,
        message: "field 'user_id' must be a non-empty string",
    },
    {
        field: 'card_id',
        check: isNonEmptyString,
        message: "field 'card_id' must be a non-empty string",
    },
    {
        field: 'rating',
        check: (v) => isOneOf(v, RATINGS),
        message: "field 'rating' must be one of: again, hard, good, easy",
    },
    {
        field: 'session_id',
        check: isNonEmptyString,
        message: "field 'session_id' must be a non-empty string",
    },
    {
        field: 'deck_id',
        check: isNonEmptyString,
        message: "field 'deck_id' must be a non-empty string",
    },
    {
        field: 'review_index',
        check: isNonNegativeInt,
        message: "field 'review_index' must be a non-negative integer",
    },
    {
        field: 'state_before',
        check: (v) => isOneOf(v, CARD_STATES),
        message: "field 'state_before' must be one of: new, learning, review, relearning",
    },
    {
        field: 'stability_before',
        check: isFiniteNumber,
        message: "field 'stability_before' must be a finite number",
    },
    {
        field: 'difficulty_before',
        check: isFiniteNumber,
        message: "field 'difficulty_before' must be a finite number",
    },
    {
        field: 'state_after',
        check: (v) => isOneOf(v, CARD_STATES),
        message: "field 'state_after' must be one of: new, learning, review, relearning",
    },
    {
        field: 'stability_after',
        check: isFiniteNumber,
        message: "field 'stability_after' must be a finite number",
    },
    {
        field: 'difficulty_after',
        check: isFiniteNumber,
        message: "field 'difficulty_after' must be a finite number",
    },
    {
        field: 'scheduled_days',
        check: isFiniteNumber,
        message: "field 'scheduled_days' must be a finite number",
    },
    {
        field: 'review_duration_ms',
        check: (v) => v === undefined || v === null || (isFiniteNumber(v) && v >= 0),
        message: "field 'review_duration_ms' must be a non-negative number or null",
    },
];
