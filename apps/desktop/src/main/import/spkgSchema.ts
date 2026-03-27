/**
 * Schema validation for .spkg import data.
 *
 * Validates JSON parsed from .spkg archive files before database insertion.
 * Uses hand-written validators (no external schema library) to check types,
 * required fields, and enforce size bounds to prevent DoS and data corruption.
 */

// ── Size bounds ──────────────────────────────────────────────────────────────

const MAX_DECKS = 50_000;
const MAX_NOTE_TYPES = 10_000;
const MAX_NOTES = 500_000;
const MAX_CARDS = 500_000;
const MAX_REVIEWS = 5_000_000;
const MAX_SESSIONS = 100_000;
const MAX_MEDIA_META = 100_000;

const MAX_NAME_LEN = 500;
const MAX_DESC_LEN = 5_000;
const MAX_FIELDS_SERIALIZED = 1_048_576; // 1 MB per note's fields
const MAX_TEMPLATES_SERIALIZED = 2_097_152; // 2 MB per note type's templates

// ── Error helper ─────────────────────────────────────────────────────────────

export class SpkgValidationError extends Error {
    constructor(file: string, detail: string) {
        super(`Invalid .spkg data in ${file}: ${detail}`);
        this.name = 'SpkgValidationError';
    }
}

// ── Utility checks ───────────────────────────────────────────────────────────

function assertString(val: unknown, label: string, file: string, maxLen?: number): asserts val is string {
    if (typeof val !== 'string') {
        throw new SpkgValidationError(file, `${label} must be a string, got ${typeof val}`);
    }
    if (maxLen !== undefined && val.length > maxLen) {
        throw new SpkgValidationError(file, `${label} exceeds max length (${val.length} > ${maxLen})`);
    }
}

function assertNumber(val: unknown, label: string, file: string): asserts val is number {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new SpkgValidationError(file, `${label} must be a finite number, got ${typeof val === 'number' ? val : typeof val}`);
    }
}

function assertOptionalString(val: unknown, label: string, file: string, maxLen?: number): void {
    if (val == null) return;
    assertString(val, label, file, maxLen);
}

function assertOptionalNumber(val: unknown, label: string, file: string): void {
    if (val == null) return;
    assertNumber(val, label, file);
}

function assertArray(val: unknown, file: string, maxLen: number): asserts val is unknown[] {
    if (!Array.isArray(val)) {
        throw new SpkgValidationError(file, `expected an array, got ${typeof val}`);
    }
    if (val.length > maxLen) {
        throw new SpkgValidationError(file, `array has ${val.length} entries, max allowed is ${maxLen}`);
    }
}

function assertObject(val: unknown, label: string, file: string): asserts val is Record<string, unknown> {
    if (val == null || typeof val !== 'object' || Array.isArray(val)) {
        throw new SpkgValidationError(file, `${label} must be an object`);
    }
}

function assertFieldsOrString(val: unknown, label: string, file: string, maxSerializedLen: number): void {
    if (typeof val === 'string') {
        if (val.length > maxSerializedLen) {
            throw new SpkgValidationError(file, `${label} string exceeds max length (${val.length} > ${maxSerializedLen})`);
        }
        return;
    }
    if (val != null && typeof val === 'object') {
        const serialized = JSON.stringify(val);
        if (serialized.length > maxSerializedLen) {
            throw new SpkgValidationError(file, `${label} serialized size exceeds max (${serialized.length} > ${maxSerializedLen})`);
        }
        return;
    }
    throw new SpkgValidationError(file, `${label} must be a string or object, got ${typeof val}`);
}

// ── Validated types ──────────────────────────────────────────────────────────

export interface SpkgCollection {
    formatVersion: number;
    exportDate: string;
    appVersion?: string;
    deckId?: string;
}

export interface SpkgDeck {
    id: string;
    name: string;
    description?: string | null;
    algorithm?: string | null;
    parent_id?: string | null;
    anki_id?: number | null;
    anki_meta?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SpkgNoteType {
    id: string;
    name: string;
    fields: string | unknown;
    card_templates: string | unknown;
    anki_id?: number | null;
    anki_meta?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SpkgNote {
    id: string;
    deck_id: string;
    note_type_id: string;
    fields: string | unknown;
    tags?: string | unknown[] | null;
    anki_id?: number | null;
    anki_guid?: string | null;
    anki_meta?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SpkgCard {
    id: string;
    note_id: string;
    template_index?: number | null;
    state?: string | null;
    due?: string | null;
    stability?: number | null;
    difficulty?: number | null;
    elapsed_days?: number | null;
    scheduled_days?: number | null;
    reps?: number | null;
    lapses?: number | null;
    last_review?: string | null;
    anki_id?: number | null;
    ease_factor?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SpkgReview {
    id: string;
    card_id: string;
    rating: string | number;
    review_time: string;
    review_duration_ms?: number | null;
    state_before?: string | null;
    stability_before?: number | null;
    difficulty_before?: number | null;
    state_after?: string | null;
    stability_after?: number | null;
    difficulty_after?: number | null;
    scheduled_days?: number | null;
    session_id?: string | null;
    deck_id?: string | null;
    review_index?: number | null;
    interval_before?: number | null;
    ease_factor_after?: number | null;
    review_type?: number | null;
    created_at?: string | null;
}

export interface SpkgSession {
    id: string;
    deck_id: string;
    status: string;
    started_at: string;
    completed_at?: string | null;
    created_at?: string | null;
}

export interface SpkgMediaRecord {
    filename: string;
    file_path: string;
    mime_type?: string | null;
}

// ── Validators ───────────────────────────────────────────────────────────────

export function validateCollection(data: unknown): SpkgCollection {
    const file = 'collection.json';
    assertObject(data, 'collection', file);
    assertNumber(data.formatVersion, 'formatVersion', file);
    assertString(data.exportDate, 'exportDate', file);
    return data as unknown as SpkgCollection;
}

export function validateDecks(data: unknown): SpkgDeck[] {
    const file = 'decks.json';
    assertArray(data, file, MAX_DECKS);
    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        assertObject(d, `decks[${i}]`, file);
        assertString(d.id, `decks[${i}].id`, file);
        assertString(d.name, `decks[${i}].name`, file, MAX_NAME_LEN);
        assertOptionalString(d.description, `decks[${i}].description`, file, MAX_DESC_LEN);
        assertOptionalString(d.algorithm, `decks[${i}].algorithm`, file, 50);
        assertOptionalString(d.parent_id, `decks[${i}].parent_id`, file);
    }
    return data as SpkgDeck[];
}

export function validateNoteTypes(data: unknown): SpkgNoteType[] {
    const file = 'note_types.json';
    assertArray(data, file, MAX_NOTE_TYPES);
    for (let i = 0; i < data.length; i++) {
        const nt = data[i];
        assertObject(nt, `note_types[${i}]`, file);
        assertString(nt.id, `note_types[${i}].id`, file);
        assertString(nt.name, `note_types[${i}].name`, file, MAX_NAME_LEN);
        assertFieldsOrString(nt.fields, `note_types[${i}].fields`, file, MAX_TEMPLATES_SERIALIZED);
        assertFieldsOrString(nt.card_templates, `note_types[${i}].card_templates`, file, MAX_TEMPLATES_SERIALIZED);
    }
    return data as SpkgNoteType[];
}

export function validateNotes(data: unknown): SpkgNote[] {
    const file = 'notes.json';
    assertArray(data, file, MAX_NOTES);
    for (let i = 0; i < data.length; i++) {
        const n = data[i];
        assertObject(n, `notes[${i}]`, file);
        assertString(n.id, `notes[${i}].id`, file);
        assertString(n.deck_id, `notes[${i}].deck_id`, file);
        assertString(n.note_type_id, `notes[${i}].note_type_id`, file);
        assertFieldsOrString(n.fields, `notes[${i}].fields`, file, MAX_FIELDS_SERIALIZED);
    }
    return data as SpkgNote[];
}

export function validateCards(data: unknown): SpkgCard[] {
    const file = 'cards.json';
    assertArray(data, file, MAX_CARDS);
    for (let i = 0; i < data.length; i++) {
        const c = data[i];
        assertObject(c, `cards[${i}]`, file);
        assertString(c.id, `cards[${i}].id`, file);
        assertString(c.note_id, `cards[${i}].note_id`, file);
        assertOptionalNumber(c.template_index, `cards[${i}].template_index`, file);
        assertOptionalString(c.state, `cards[${i}].state`, file, 50);
        assertOptionalNumber(c.stability, `cards[${i}].stability`, file);
        assertOptionalNumber(c.difficulty, `cards[${i}].difficulty`, file);
        assertOptionalNumber(c.reps, `cards[${i}].reps`, file);
        assertOptionalNumber(c.lapses, `cards[${i}].lapses`, file);
        assertOptionalNumber(c.elapsed_days, `cards[${i}].elapsed_days`, file);
        assertOptionalNumber(c.scheduled_days, `cards[${i}].scheduled_days`, file);
    }
    return data as SpkgCard[];
}

export function validateReviews(data: unknown): SpkgReview[] {
    const file = 'reviews.json';
    assertArray(data, file, MAX_REVIEWS);
    for (let i = 0; i < data.length; i++) {
        const r = data[i];
        assertObject(r, `reviews[${i}]`, file);
        assertString(r.id, `reviews[${i}].id`, file);
        assertString(r.card_id, `reviews[${i}].card_id`, file);
    }
    return data as SpkgReview[];
}

export function validateSessions(data: unknown): SpkgSession[] {
    const file = 'sessions.json';
    assertArray(data, file, MAX_SESSIONS);
    for (let i = 0; i < data.length; i++) {
        const s = data[i];
        assertObject(s, `sessions[${i}]`, file);
        assertString(s.id, `sessions[${i}].id`, file);
        assertString(s.deck_id, `sessions[${i}].deck_id`, file);
    }
    return data as SpkgSession[];
}

export function validateMediaMeta(data: unknown): SpkgMediaRecord[] {
    const file = 'media.json';
    assertArray(data, file, MAX_MEDIA_META);
    for (let i = 0; i < data.length; i++) {
        const m = data[i];
        assertObject(m, `media[${i}]`, file);
        assertString(m.filename, `media[${i}].filename`, file, MAX_NAME_LEN);
        assertString(m.file_path, `media[${i}].file_path`, file);
    }
    return data as SpkgMediaRecord[];
}
