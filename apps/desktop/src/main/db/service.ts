import { randomUUID } from 'node:crypto';
import { getDb } from './index';
import { logDeckDeletion, logNoteDeletion } from '../backup/deletionLog';
import { getRetrievability } from '../../lib/fsrs';
import type {
    Deck, DeckInsert, DeckUpdate,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    Card, CardInsert,
    CardTemplate,
    Review,
    Media, MediaInsert,
    DeckSession,
    DraftCard, DraftCardInsert,
    SessionAnalytics,
    Rating,
} from '@sekel/db';
import type { DeckStats, TodaySummary, CardCountsByMaturity, RetentionByMaturity } from '@sekel/db';
import type { MissedSystemBreakdown, MissedTopicRow, MissedCardStats, MissRateTrendPoint, DateRangeDays } from '@sekel/db';
import type { CardWithNote } from '@sekel/db';
import type { InsertReviewParams, ReviewDayCount } from '@sekel/db';

// ── JSON helpers ──────────────────────────────────────────────────────────────

function j<T>(value: unknown): T {
    if (typeof value === 'string') return JSON.parse(value) as T;
    return value as T;
}

function s(value: unknown): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapDeck(row: Record<string, unknown>): Deck {
    return row as unknown as Deck;
}

function mapNoteType(row: Record<string, unknown>): NoteType {
    return {
        ...(row as unknown as NoteType),
        fields: j(row.fields),
        card_templates: j(row.card_templates),
    };
}

function mapNote(row: Record<string, unknown>): Note {
    return {
        ...(row as unknown as Note),
        fields: j(row.fields),
        tags: j(row.tags),
    };
}

function mapCard(row: Record<string, unknown>): Card {
    return row as unknown as Card;
}

function mapDraft(row: Record<string, unknown>): DraftCard {
    return row as unknown as DraftCard;
}

// ── Decks ─────────────────────────────────────────────────────────────────────

export function fetchDecks(userId: string): Deck[] {
    const rows = getDb()
        .prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as Record<string, unknown>[];
    return rows.map(mapDeck);
}

export function fetchDeck(id: string): Deck | null {
    const row = getDb().prepare('SELECT * FROM decks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapDeck(row) : null;
}

export function createDeck(deck: DeckInsert): Deck {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO decks (id, user_id, name, description, algorithm, parent_id, anki_id, anki_meta, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, deck.user_id, deck.name, deck.description ?? null, deck.algorithm ?? 'fsrs', deck.parent_id ?? null, deck.anki_id ?? null, deck.anki_meta ?? null, now, now);
    return fetchDeck(id)!;
}

export function updateDeck(id: string, updates: DeckUpdate): Deck {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.algorithm !== undefined) { sets.push('algorithm = ?'); values.push(updates.algorithm); }
    if (updates.parent_id !== undefined) { sets.push('parent_id = ?'); values.push(updates.parent_id); }
    if (updates.anki_id !== undefined) { sets.push('anki_id = ?'); values.push(updates.anki_id); }

    values.push(id);
    getDb().prepare(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return fetchDeck(id)!;
}

export function deleteDeck(id: string): void {
    const db = getDb();
    logDeckDeletion(id);
    db.transaction(() => {
        // Remove classifications for cards in this deck (before CASCADE deletes the cards)
        db.prepare(`
            DELETE FROM card_classifications WHERE card_id IN (
                SELECT c.id FROM cards c
                JOIN notes n ON c.note_id = n.id
                WHERE n.deck_id = ?
            )
        `).run(id);
        // Unlink child decks so parent delete doesn't cascade children
        db.prepare('UPDATE decks SET parent_id = NULL WHERE parent_id = ?').run(id);
        db.prepare('DELETE FROM decks WHERE id = ?').run(id);
    })();
}

export function deleteDecks(ids: string[]): void {
    if (ids.length === 0) return;
    const db = getDb();
    for (const id of ids) logDeckDeletion(id);
    const placeholders = ids.map(() => '?').join(', ');
    db.transaction(() => {
        // Remove classifications for cards in these decks
        db.prepare(`
            DELETE FROM card_classifications WHERE card_id IN (
                SELECT c.id FROM cards c
                JOIN notes n ON c.note_id = n.id
                WHERE n.deck_id IN (${placeholders})
            )
        `).run(...ids);
        // Unlink child decks
        db.prepare(`UPDATE decks SET parent_id = NULL WHERE parent_id IN (${placeholders})`).run(...ids);
        db.prepare(`DELETE FROM decks WHERE id IN (${placeholders})`).run(...ids);
    })();
}

export function fetchDecksByAnkiIds(userId: string, ankiIds: number[]): Deck[] {
    if (ankiIds.length === 0) return [];
    const placeholders = ankiIds.map(() => '?').join(', ');
    const rows = getDb()
        .prepare(`SELECT * FROM decks WHERE user_id = ? AND anki_id IN (${placeholders})`)
        .all(userId, ...ankiIds) as Record<string, unknown>[];
    return rows.map(mapDeck);
}

/** Get the ISO string for the start of today (local midnight). */
function todayMidnight(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

/** Count distinct cards studied today by state_before category for a given deck. */
function countStudiedToday(deckId: string, userId: string): { newStudied: number; reviewStudied: number } {
    const midnight = todayMidnight();
    const db = getDb();

    const newRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) as cnt FROM reviews
        WHERE user_id = ? AND deck_id = ? AND state_before = 'new' AND review_time >= ?
    `).get(userId, deckId, midnight) as { cnt: number };

    const reviewRow = db.prepare(`
        SELECT COUNT(DISTINCT card_id) as cnt FROM reviews
        WHERE user_id = ? AND deck_id = ? AND state_before = 'review' AND review_time >= ?
    `).get(userId, deckId, midnight) as { cnt: number };

    return { newStudied: newRow.cnt, reviewStudied: reviewRow.cnt };
}

export function fetchDeckStats(
    deckId: string,
    userId?: string,
    dailyNewLimit?: number,
    dailyReviewLimit?: number,
): DeckStats {
    const now = new Date().toISOString();
    const db = getDb();

    type StatRow = { state: string; due: string };
    const cards = db.prepare(`
        SELECT c.state, c.due
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        WHERE n.deck_id = ?
    `).all(deckId) as StatRow[];

    let newCount = 0;
    let learningCount = 0;
    let reviewCount = 0;
    for (const card of cards) {
        if (card.state === 'new') newCount++;
        else if (card.state === 'learning' || card.state === 'relearning') learningCount++;
        else if (card.state === 'review' && card.due <= now) reviewCount++;
    }

    // Apply daily limits if provided
    if (userId && dailyNewLimit != null && dailyReviewLimit != null) {
        const studied = countStudiedToday(deckId, userId);
        newCount = Math.min(newCount, Math.max(0, dailyNewLimit - studied.newStudied));
        reviewCount = Math.min(reviewCount, Math.max(0, dailyReviewLimit - studied.reviewStudied));
    }

    return { deckId, newCount, learningCount, reviewCount, totalCount: cards.length };
}

export function fetchAllDueCardsCount(
    userId: string,
    dailyNewLimit?: number,
    dailyReviewLimit?: number,
): number {
    const now = new Date().toISOString();
    const db = getDb();

    // If no limits, use the simple count
    if (dailyNewLimit == null || dailyReviewLimit == null) {
        const row = db.prepare(`
            SELECT COUNT(*) as cnt
            FROM cards c
            JOIN notes n ON c.note_id = n.id
            JOIN decks d ON n.deck_id = d.id
            WHERE d.user_id = ?
              AND (c.state IN ('new', 'learning', 'relearning')
                   OR (c.state = 'review' AND c.due <= ?))
        `).get(userId, now) as { cnt: number };
        return row.cnt;
    }

    // With limits: count per category per deck, apply limits, sum
    type DeckCategoryRow = { deck_id: string; state: string; cnt: number };
    const rows = db.prepare(`
        SELECT n.deck_id, c.state, COUNT(*) as cnt
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        JOIN decks d ON n.deck_id = d.id
        WHERE d.user_id = ?
          AND (c.state IN ('new', 'learning', 'relearning')
               OR (c.state = 'review' AND c.due <= ?))
        GROUP BY n.deck_id, c.state
    `).all(userId, now) as DeckCategoryRow[];

    // Group by deck
    const deckMap = new Map<string, { newCount: number; learningCount: number; reviewCount: number }>();
    for (const row of rows) {
        if (!deckMap.has(row.deck_id)) deckMap.set(row.deck_id, { newCount: 0, learningCount: 0, reviewCount: 0 });
        const entry = deckMap.get(row.deck_id)!;
        if (row.state === 'new') entry.newCount += row.cnt;
        else if (row.state === 'learning' || row.state === 'relearning') entry.learningCount += row.cnt;
        else if (row.state === 'review') entry.reviewCount += row.cnt;
    }

    let total = 0;
    const midnight = todayMidnight();
    for (const [deckId, counts] of deckMap) {
        const newStudiedRow = db.prepare(`
            SELECT COUNT(DISTINCT card_id) as cnt FROM reviews
            WHERE user_id = ? AND deck_id = ? AND state_before = 'new' AND review_time >= ?
        `).get(userId, deckId, midnight) as { cnt: number };
        const reviewStudiedRow = db.prepare(`
            SELECT COUNT(DISTINCT card_id) as cnt FROM reviews
            WHERE user_id = ? AND deck_id = ? AND state_before = 'review' AND review_time >= ?
        `).get(userId, deckId, midnight) as { cnt: number };

        total += counts.learningCount; // always counted
        total += Math.min(counts.newCount, Math.max(0, dailyNewLimit - newStudiedRow.cnt));
        total += Math.min(counts.reviewCount, Math.max(0, dailyReviewLimit - reviewStudiedRow.cnt));
    }

    return total;
}

export function fetchGlobalRetention(userId: string, days = 30): number | null {
    const since = new Date();
    since.setDate(since.getDate() - days);

    type RatingRow = { rating: string };
    const rows = getDb().prepare(`
        SELECT rating FROM reviews
        WHERE user_id = ? AND review_time >= ?
    `).all(userId, since.toISOString()) as RatingRow[];

    if (rows.length === 0) return null;
    const nonAgain = rows.filter(r => r.rating !== 'again').length;
    return Math.round((nonAgain / rows.length) * 100);
}

// ── Statistics ────────────────────────────────────────────────────────────────

export function fetchTodaySummary(userId: string): TodaySummary {
    const midnight = todayMidnight();
    type Row = {
        total_reviews: number;
        again_count: number;
        new_count: number;
        learn_count: number;
        review_count: number;
        relearn_count: number;
        total_time_ms: number;
    };
    const row = getDb().prepare(`
        SELECT
            COUNT(*) as total_reviews,
            SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END) as again_count,
            SUM(CASE WHEN state_before = 'new' THEN 1 ELSE 0 END) as new_count,
            SUM(CASE WHEN state_before = 'learning' THEN 1 ELSE 0 END) as learn_count,
            SUM(CASE WHEN state_before = 'review' THEN 1 ELSE 0 END) as review_count,
            SUM(CASE WHEN state_before = 'relearning' THEN 1 ELSE 0 END) as relearn_count,
            SUM(COALESCE(review_duration_ms, 0)) as total_time_ms
        FROM reviews
        WHERE user_id = ? AND review_time >= ?
    `).get(userId, midnight) as Row;

    return {
        totalReviews: row.total_reviews,
        againCount: row.again_count,
        newCount: row.new_count,
        learnCount: row.learn_count,
        reviewCount: row.review_count,
        relearnCount: row.relearn_count,
        totalTimeMs: row.total_time_ms,
    };
}

export function fetchCardCountsByMaturity(userId: string, deckId?: string): CardCountsByMaturity {
    const params: unknown[] = [userId];
    let deckFilter = '';
    if (deckId) {
        deckFilter = 'AND n.deck_id = ?';
        params.push(deckId);
    }

    type Row = { new_count: number; learning_count: number; young_count: number; mature_count: number };
    const row = getDb().prepare(`
        SELECT
            SUM(CASE WHEN c.state = 'new' THEN 1 ELSE 0 END) as new_count,
            SUM(CASE WHEN c.state IN ('learning', 'relearning') THEN 1 ELSE 0 END) as learning_count,
            SUM(CASE WHEN c.state = 'review' AND c.scheduled_days < 21 THEN 1 ELSE 0 END) as young_count,
            SUM(CASE WHEN c.state = 'review' AND c.scheduled_days >= 21 THEN 1 ELSE 0 END) as mature_count
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        JOIN decks d ON n.deck_id = d.id
        WHERE d.user_id = ? ${deckFilter}
    `).get(...params) as Row;

    return {
        newCount: row.new_count ?? 0,
        learningCount: row.learning_count ?? 0,
        youngCount: row.young_count ?? 0,
        matureCount: row.mature_count ?? 0,
    };
}

export function fetchRetentionByMaturity(userId: string, days = 30): RetentionByMaturity {
    const since = new Date();
    since.setDate(since.getDate() - days);

    type Row = { rating: string; scheduled_days: number };
    const rows = getDb().prepare(`
        SELECT r.rating, r.scheduled_days
        FROM reviews r
        WHERE r.user_id = ? AND r.review_time >= ? AND r.state_before = 'review'
    `).all(userId, since.toISOString()) as Row[];

    const young = rows.filter(r => r.scheduled_days < 21);
    const mature = rows.filter(r => r.scheduled_days >= 21);

    const calcRetention = (list: Row[]): number | null => {
        if (list.length === 0) return null;
        const pass = list.filter(r => r.rating !== 'again').length;
        return Math.round((pass / list.length) * 100);
    };

    return {
        youngRetention: calcRetention(young),
        matureRetention: calcRetention(mature),
        overallRetention: calcRetention(rows),
    };
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export type CardWithNoteRow = Record<string, unknown>;

export function buildCardWithNote(row: CardWithNoteRow): CardWithNote {
    const noteType: NoteType = {
        id: row.nt_id as string,
        user_id: row.user_id as string,
        anki_id: (row.nt_anki_id as number | null) ?? null,
        anki_meta: (row.nt_anki_meta as string | null) ?? null,
        name: row.nt_name as string,
        fields: j(row.nt_fields),
        card_templates: j(row.nt_templates),
        created_at: row.nt_created_at as string,
        updated_at: row.nt_updated_at as string,
    };
    const note: Note & { note_type: NoteType } = {
        id: row.note_id as string,
        user_id: row.user_id as string,
        deck_id: row.deck_id as string,
        note_type_id: row.note_type_id as string,
        fields: j(row.note_fields),
        tags: j(row.note_tags),
        anki_id: (row.anki_id as number | null) ?? null,
        anki_guid: (row.anki_guid as string | null) ?? null,
        anki_meta: (row.note_anki_meta as string | null) ?? null,
        created_at: row.note_created_at as string,
        updated_at: row.note_updated_at as string,
        note_type: noteType,
    };
    return {
        id: row.id as string,
        user_id: row.user_id as string,
        anki_id: (row.anki_id as number | null) ?? null,
        anki_meta: (row.card_anki_meta as string | null) ?? null,
        ease_factor: (row.ease_factor as number | null) ?? null,

        note_id: row.note_id as string,
        template_index: row.template_index as number,
        state: row.state as Card['state'],
        due: row.due as string,
        stability: row.stability as number,
        difficulty: row.difficulty as number,
        elapsed_days: row.elapsed_days as number,
        scheduled_days: row.scheduled_days as number,
        reps: row.reps as number,
        lapses: row.lapses as number,
        last_review: row.last_review as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        note,
    };
}

export const CARD_WITH_NOTE_SQL = `
    SELECT
        c.id, c.user_id, c.note_id, c.template_index,
        c.state, c.due, c.stability, c.difficulty,
        c.elapsed_days, c.scheduled_days, c.reps, c.lapses,
        c.last_review, c.created_at, c.updated_at,
        c.anki_meta    AS card_anki_meta,
        n.id       AS note_id,
        n.deck_id  AS deck_id,
        n.note_type_id,
        n.fields   AS note_fields,
        n.tags     AS note_tags,
        n.anki_meta AS note_anki_meta,
        n.created_at AS note_created_at,
        n.updated_at AS note_updated_at,
        nt.id          AS nt_id,
        nt.anki_id     AS nt_anki_id,
        nt.anki_meta   AS nt_anki_meta,
        nt.name        AS nt_name,
        nt.fields      AS nt_fields,
        nt.card_templates AS nt_templates,
        nt.created_at  AS nt_created_at,
        nt.updated_at  AS nt_updated_at
    FROM cards c
    JOIN notes n  ON c.note_id = n.id
    JOIN note_types nt ON n.note_type_id = nt.id
`;

export function fetchDueCards(
    deckId: string,
    userId?: string,
    dailyNewLimit?: number,
    dailyReviewLimit?: number,
    examKey = 'step1',
): CardWithNote[] {
    const now = new Date().toISOString();
    const db = getDb();

    // If no limits provided, fall back to original behavior (no yield ordering)
    if (!userId || dailyNewLimit == null || dailyReviewLimit == null) {
        const rows = db.prepare(`
            ${CARD_WITH_NOTE_SQL}
            WHERE n.deck_id = ?
              AND (c.state IN ('new', 'learning', 'relearning')
                   OR (c.state = 'review' AND c.due <= ?))
            ORDER BY c.due ASC
        `).all(deckId, now) as CardWithNoteRow[];
        return rows.map(buildCardWithNote);
    }

    const studied = countStudiedToday(deckId, userId);
    const remainingNew = Math.max(0, dailyNewLimit - studied.newStudied);
    const remainingReview = Math.max(0, dailyReviewLimit - studied.reviewStudied);

    // Learning/relearning: always shown (no limit), ordered by due date
    const learningRows = db.prepare(`
        ${CARD_WITH_NOTE_SQL}
        WHERE n.deck_id = ? AND c.state IN ('learning', 'relearning')
        ORDER BY c.due ASC
    `).all(deckId) as CardWithNoteRow[];

    // New cards: ordered by yield score descending, unclassified cards fall to the end
    const newRows = remainingNew > 0
        ? db.prepare(`
            WITH yield_proxy AS (
                SELECT cc.card_id,
                    MAX(
                        ((bs.weight_min + bs.weight_max) / 2.0)
                        * cc.confidence
                        * cc.split_weight
                    ) AS proxy
                FROM card_classifications cc
                JOIN blueprint_systems bs ON bs.id = cc.system_id
                WHERE cc.exam_id = (SELECT id FROM blueprint_exams WHERE exam_key = ? LIMIT 1)
                GROUP BY cc.card_id
            )
            SELECT
                c.id, c.user_id, c.note_id, c.template_index,
                c.state, c.due, c.stability, c.difficulty,
                c.elapsed_days, c.scheduled_days, c.reps, c.lapses,
                c.last_review, c.created_at, c.updated_at,
                c.anki_meta    AS card_anki_meta,
                n.id       AS note_id,
                n.deck_id  AS deck_id,
                n.note_type_id,
                n.fields   AS note_fields,
                n.tags     AS note_tags,
                n.anki_meta AS note_anki_meta,
                n.created_at AS note_created_at,
                n.updated_at AS note_updated_at,
                nt.id          AS nt_id,
                nt.anki_id     AS nt_anki_id,
                nt.anki_meta   AS nt_anki_meta,
                nt.name        AS nt_name,
                nt.fields      AS nt_fields,
                nt.card_templates AS nt_templates,
                nt.created_at  AS nt_created_at,
                nt.updated_at  AS nt_updated_at
            FROM cards c
            JOIN notes n  ON c.note_id = n.id
            JOIN note_types nt ON n.note_type_id = nt.id
            LEFT JOIN yield_proxy yp ON yp.card_id = c.id
            WHERE n.deck_id = ? AND c.state = 'new'
            ORDER BY
                CASE WHEN yp.proxy IS NULL THEN 1 ELSE 0 END ASC,
                yp.proxy DESC,
                c.due ASC
            LIMIT ?
        `).all(examKey, deckId, remainingNew) as CardWithNoteRow[]
        : [];

    // Review cards: capped by daily limit, ordered by due date
    const reviewRows = remainingReview > 0
        ? db.prepare(`
            ${CARD_WITH_NOTE_SQL}
            WHERE n.deck_id = ? AND c.state = 'review' AND c.due <= ?
            ORDER BY c.due ASC
            LIMIT ?
        `).all(deckId, now, remainingReview) as CardWithNoteRow[]
        : [];

    return [...learningRows, ...newRows, ...reviewRows].map(buildCardWithNote);
}

export function fetchAllCardsForStudy(deckId: string, limit = 50): CardWithNote[] {
    const rows = getDb().prepare(`
        ${CARD_WITH_NOTE_SQL}
        WHERE n.deck_id = ?
        ORDER BY c.last_review ASC NULLS FIRST
        LIMIT ?
    `).all(deckId, limit) as CardWithNoteRow[];
    return rows.map(buildCardWithNote);
}

export function fetchAllCardsForDeck(deckId: string): CardWithNote[] {
    const rows = getDb().prepare(`
        ${CARD_WITH_NOTE_SQL}
        WHERE n.deck_id = ?
        ORDER BY n.created_at ASC, c.template_index ASC
    `).all(deckId) as CardWithNoteRow[];
    return rows.map(buildCardWithNote);
}

export function updateCardAfterReview(cardId: string, updates: Partial<Card>): Card {
    const now = new Date().toISOString();
    const fields = ['updated_at'];
    const values: unknown[] = [now];

    const allowed: (keyof Card)[] = [
        'state', 'due', 'stability', 'difficulty',
        'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'last_review',
    ];
    for (const key of allowed) {
        if (key in updates) {
            fields.push(`${key} = ?`);
            values.push(updates[key] as unknown);
        }
    }

    values.push(cardId);
    getDb().prepare(`UPDATE cards SET ${fields.map((f, i) => (i === 0 ? 'updated_at = ?' : f)).join(', ')} WHERE id = ?`).run(...values);
    return fetchCardById(cardId)!;
}

function fetchCardById(id: string): Card | null {
    const row = getDb().prepare('SELECT * FROM cards WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapCard(row) : null;
}

export function createCard(card: CardInsert): Card {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO cards (id, user_id, note_id, template_index, state, due,
            stability, difficulty, elapsed_days, scheduled_days, reps, lapses,
            last_review, anki_id, ease_factor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, card.user_id, card.note_id, card.template_index,
        card.state, card.due, card.stability, card.difficulty,
        card.elapsed_days, card.scheduled_days, card.reps, card.lapses,
        card.last_review ?? null, card.anki_id ?? null, card.ease_factor ?? null, now, now,
    );
    return fetchCardById(id)!;
}

export function fetchCardsByNote(noteId: string): Card[] {
    const rows = getDb().prepare('SELECT * FROM cards WHERE note_id = ?').all(noteId) as Record<string, unknown>[];
    return rows.map(mapCard);
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export function fetchNotesByDeck(deckId: string): Note[] {
    const rows = getDb().prepare('SELECT * FROM notes WHERE deck_id = ? ORDER BY created_at DESC').all(deckId) as Record<string, unknown>[];
    return rows.map(mapNote);
}

export function createNote(note: NoteInsert): Note {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO notes (id, user_id, deck_id, note_type_id, fields, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, note.user_id, note.deck_id, note.note_type_id, s(note.fields), s(note.tags), now, now);
    return fetchNoteById(id)!;
}

function fetchNoteById(id: string): Note | null {
    const row = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapNote(row) : null;
}

export function updateNote(id: string, updates: NoteUpdate): Note {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.deck_id !== undefined) { sets.push('deck_id = ?'); values.push(updates.deck_id); }
    if (updates.note_type_id !== undefined) { sets.push('note_type_id = ?'); values.push(updates.note_type_id); }
    if (updates.fields !== undefined) { sets.push('fields = ?'); values.push(s(updates.fields)); }
    if (updates.tags !== undefined) { sets.push('tags = ?'); values.push(s(updates.tags)); }

    values.push(id);
    getDb().prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return fetchNoteById(id)!;
}

export function deleteNote(id: string): void {
    logNoteDeletion(id);
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}

export function createNoteWithCards(note: NoteInsert, templateCount = 1): { note: Note; cards: Card[] } {
    const result = { note: null as unknown as Note, cards: [] as Card[] };

    const tx = getDb().transaction(() => {
        result.note = createNote(note);
        for (let i = 0; i < templateCount; i++) {
            result.cards.push(createCard({
                user_id: note.user_id,
                note_id: result.note.id,
                template_index: i,
                state: 'new',
                due: new Date().toISOString(),
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                last_review: null,
            }));
        }
    });
    tx();

    return result;
}

// ── Note Types ────────────────────────────────────────────────────────────────

export function fetchNoteTypes(userId: string): NoteType[] {
    const rows = getDb().prepare('SELECT * FROM note_types WHERE user_id = ?').all(userId) as Record<string, unknown>[];
    return rows.map(mapNoteType);
}

export function createNoteType(noteType: NoteTypeInsert): NoteType {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO note_types (id, user_id, name, fields, card_templates, anki_id, anki_meta, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, noteType.user_id, noteType.name, s(noteType.fields), s(noteType.card_templates), noteType.anki_id ?? null, noteType.anki_meta ?? null, now, now);
    const row = getDb().prepare('SELECT * FROM note_types WHERE id = ?').get(id) as Record<string, unknown>;
    return mapNoteType(row);
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export function insertReview(params: InsertReviewParams): Review {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO reviews (id, user_id, card_id, rating, review_time, review_duration_ms,
            state_before, stability_before, difficulty_before,
            state_after, stability_after, difficulty_after,
            scheduled_days, session_id, deck_id, review_index,
            interval_before, ease_factor_after, review_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, params.user_id, params.card_id, params.rating, now,
        params.review_duration_ms ?? null,
        params.state_before, params.stability_before, params.difficulty_before,
        params.state_after, params.stability_after, params.difficulty_after,
        params.scheduled_days, params.session_id, params.deck_id, params.review_index,
        params.interval_before ?? null, params.ease_factor_after ?? null, params.review_type ?? null,
        now,
    );
    return getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(id) as Review;
}

export function fetchUserReviewHistory(userId: string, days = 365): ReviewDayCount[] {
    const since = new Date();
    since.setDate(since.getDate() - days);

    type Row = { review_time: string };
    const rows = getDb().prepare(`
        SELECT review_time FROM reviews
        WHERE user_id = ? AND review_time >= ?
        ORDER BY review_time ASC
    `).all(userId, since.toISOString()) as Row[];

    const counts = new Map<string, number>();
    for (const row of rows) {
        const d = new Date(row.review_time);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

// ── Deck Sessions ─────────────────────────────────────────────────────────────

export function createDeckSession(userId: string, deckId: string): DeckSession {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO deck_sessions (id, user_id, deck_id, status, started_at, completed_at, created_at)
        VALUES (?, ?, ?, 'in_progress', ?, NULL, ?)
    `).run(id, userId, deckId, now, now);
    return getDb().prepare('SELECT * FROM deck_sessions WHERE id = ?').get(id) as DeckSession;
}

export function completeDeckSession(sessionId: string): DeckSession {
    const now = new Date().toISOString();
    getDb().prepare(`
        UPDATE deck_sessions SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(now, sessionId);
    return getDb().prepare('SELECT * FROM deck_sessions WHERE id = ?').get(sessionId) as DeckSession;
}

export function fetchSessionAnalytics(sessionId: string): SessionAnalytics | null {
    const db = getDb();

    type SessionRow = { status: string };
    const session = db.prepare('SELECT status FROM deck_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
    if (!session || session.status !== 'completed') return null;

    type ReviewRow = { id: string; card_id: string; rating: string; review_index: number | null; review_duration_ms: number | null };
    const reviews = db.prepare(`
        SELECT id, card_id, rating, review_index, review_duration_ms FROM reviews
        WHERE session_id = ?
        ORDER BY review_index ASC
    `).all(sessionId) as ReviewRow[];

    if (reviews.length === 0) {
        return {
            retentionTrend: [],
            ratingDistribution: [],
            lapseStats: { lapseCount: 0, lapseRate: 0, totalReviews: 0, topForgottenCards: [], missedCardIds: [] },
        };
    }

    const totalReviews = reviews.length;
    const againCount = reviews.filter(r => r.rating === 'again').length;

    let correctSoFar = 0;
    const retentionTrend = reviews.map((r, i) => {
        if (r.rating === 'good' || r.rating === 'easy' || r.rating === 'hard') correctSoFar++;
        return { reviewIndex: i + 1, retentionRate: Math.round((correctSoFar / (i + 1)) * 1000) / 1000 };
    });

    const ratingOrder: Rating[] = ['again', 'hard', 'good', 'easy'];
    const ratingDistribution = ratingOrder.map(rating => {
        const count = reviews.filter(r => r.rating === rating).length;
        return { rating, count, percent: totalReviews > 0 ? (count / totalReviews) * 100 : 0 };
    });

    const cardAgainCounts = new Map<string, number>();
    for (const r of reviews) {
        if (r.rating === 'again') cardAgainCounts.set(r.card_id, (cardAgainCounts.get(r.card_id) ?? 0) + 1);
    }
    const topCardIds = [...cardAgainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cardId]) => cardId);

    const topForgottenCards = topCardIds.map(cardId => {
        const item = { cardId, lapseCount: cardAgainCounts.get(cardId) ?? 0, frontPreview: null as string | null };

        if (topCardIds.length > 0) {
            type CardNoteRow = { note_fields: string };
            const row = db.prepare(`
                SELECT n.fields AS note_fields
                FROM cards c
                JOIN notes n ON c.note_id = n.id
                WHERE c.id = ?
            `).get(cardId) as CardNoteRow | undefined;

            if (row) {
                const fields = j<Record<string, string>>(row.note_fields);
                const preview = fields.Front ?? fields.front ?? Object.values(fields)[0] ?? '';
                item.frontPreview = String(preview).replace(/\s+/g, ' ').trim().slice(0, 60);
            }
        }
        return item;
    });

    // Time stats (only if any reviews have duration data)
    const reviewsWithTime = reviews.filter(r => r.review_duration_ms != null);
    const timeStats = reviewsWithTime.length > 0 ? (() => {
        const totalMs = reviewsWithTime.reduce((sum, r) => sum + r.review_duration_ms!, 0);
        const averageTimeMs = Math.round(totalMs / reviewsWithTime.length);

        const timeByRatingMap = new Map<string, { totalMs: number; count: number }>();
        for (const r of reviewsWithTime) {
            const entry = timeByRatingMap.get(r.rating) ?? { totalMs: 0, count: 0 };
            entry.totalMs += r.review_duration_ms!;
            entry.count++;
            timeByRatingMap.set(r.rating, entry);
        }
        const timeByRating = ratingOrder
            .filter(rating => timeByRatingMap.has(rating))
            .map(rating => {
                const entry = timeByRatingMap.get(rating)!;
                return { rating, averageMs: Math.round(entry.totalMs / entry.count), count: entry.count };
            });

        // Top 5 slowest cards by duration
        const cardMaxTime = new Map<string, number>();
        for (const r of reviewsWithTime) {
            const prev = cardMaxTime.get(r.card_id) ?? 0;
            if (r.review_duration_ms! > prev) cardMaxTime.set(r.card_id, r.review_duration_ms!);
        }
        const slowestCardIds = [...cardMaxTime.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const slowestCards = slowestCardIds.map(([cardId, durationMs]) => {
            let frontPreview: string | null = null;
            type CardNoteRow = { note_fields: string };
            const row = db.prepare(`
                SELECT n.fields AS note_fields
                FROM cards c JOIN notes n ON c.note_id = n.id
                WHERE c.id = ?
            `).get(cardId) as CardNoteRow | undefined;
            if (row) {
                const fields = j<Record<string, string>>(row.note_fields);
                const preview = fields.Front ?? fields.front ?? Object.values(fields)[0] ?? '';
                frontPreview = String(preview).replace(/\s+/g, ' ').trim().slice(0, 60);
            }
            return { cardId, durationMs, frontPreview };
        });

        return { averageTimeMs, timeByRating, slowestCards };
    })() : undefined;

    return {
        retentionTrend,
        ratingDistribution,
        lapseStats: {
            lapseCount: againCount,
            lapseRate: totalReviews > 0 ? (againCount / totalReviews) * 100 : 0,
            totalReviews,
            topForgottenCards,
            missedCardIds: [...cardAgainCounts.keys()],
        },
        timeStats,
    };
}

export function createDeckFromMissedCards(userId: string, deckName: string, cardIds: string[]): Deck {
    const db = getDb();
    let newDeck!: Deck;

    db.transaction(() => {
        newDeck = createDeck({ user_id: userId, name: deckName, description: null, algorithm: 'fsrs', anki_id: null, parent_id: null });

        for (const cardId of cardIds) {
            type Row = { note_type_id: string; note_fields: string; note_tags: string; nt_templates: string };
            const row = db.prepare(`
                SELECT n.note_type_id, n.fields AS note_fields, n.tags AS note_tags,
                       nt.card_templates AS nt_templates
                FROM cards c
                JOIN notes n ON c.note_id = n.id
                JOIN note_types nt ON n.note_type_id = nt.id
                WHERE c.id = ?
            `).get(cardId) as Row | undefined;

            if (!row) continue;

            const fields = j<Record<string, string>>(row.note_fields);
            const tags = j<string[]>(row.note_tags);
            const templates = j<CardTemplate[]>(row.nt_templates);

            const note = createNote({
                user_id: userId,
                deck_id: newDeck.id,
                note_type_id: row.note_type_id,
                fields,
                tags,
            });

            for (let i = 0; i < templates.length; i++) {
                createCard({
                    user_id: userId,
                    note_id: note.id,
                    template_index: i,
                    state: 'new',
                    due: new Date().toISOString(),
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    lapses: 0,
                    last_review: null,
                });
            }
        }
    })();

    return newDeck;
}

// ── Media ─────────────────────────────────────────────────────────────────────

export function createMedia(media: MediaInsert): Media {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO media (id, user_id, filename, file_path, file_hash, file_size, mime_type, import_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, media.user_id, media.filename, media.file_path, media.file_hash, media.file_size ?? null, media.mime_type ?? null, media.import_id ?? null, now);
    return getDb().prepare('SELECT * FROM media WHERE id = ?').get(id) as Media;
}

export function fetchMediaByFilename(userId: string, filename: string): Media | null {
    const row = getDb().prepare('SELECT * FROM media WHERE user_id = ? AND filename = ?').get(userId, filename) as Media | undefined;
    return row ?? null;
}

export function fetchMediaByHash(userId: string, fileHash: string): Media | null {
    const row = getDb().prepare('SELECT * FROM media WHERE user_id = ? AND file_hash = ?').get(userId, fileHash) as Media | undefined;
    return row ?? null;
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export function fetchDrafts(userId: string): DraftCard[] {
    const rows = getDb().prepare('SELECT * FROM card_drafts WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Record<string, unknown>[];
    return rows.map(mapDraft);
}

export function saveDraft(userId: string, draft: DraftCardInsert): DraftCard {
    const now = new Date().toISOString();
    const id = randomUUID();
    getDb().prepare(`
        INSERT INTO card_drafts (id, user_id, front, back, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, draft.front, draft.back, draft.source ?? null, now);
    return getDb().prepare('SELECT * FROM card_drafts WHERE id = ?').get(id) as DraftCard;
}

export function updateDraft(id: string, updates: Partial<Pick<DraftCard, 'front' | 'back'>>): DraftCard {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.front !== undefined) { sets.push('front = ?'); values.push(updates.front); }
    if (updates.back !== undefined) { sets.push('back = ?'); values.push(updates.back); }
    if (sets.length === 0) return getDb().prepare('SELECT * FROM card_drafts WHERE id = ?').get(id) as DraftCard;
    values.push(id);
    getDb().prepare(`UPDATE card_drafts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getDb().prepare('SELECT * FROM card_drafts WHERE id = ?').get(id) as DraftCard;
}

export function deleteDraft(id: string): void {
    getDb().prepare('DELETE FROM card_drafts WHERE id = ?').run(id);
}

export function clearDrafts(userId: string): void {
    getDb().prepare('DELETE FROM card_drafts WHERE user_id = ?').run(userId);
}

// ── Performance Needs ─────────────────────────────────────────────────────────

export interface SystemPerformanceNeed {
    system_key: string;
    blueprint_weight_midpoint: number;
    performance_need: number;
    total_reviews: number;
}

/**
 * Compute per-system performance need for a user.
 *
 * performance_need = lapse_rate * 0.5 + (1 - avg_retrievability) * 0.5
 *
 * Returns 0–1 per system where 1 = poor performance, 0 = strong performance.
 * Sorted by performance_need DESC. Systems with no reviewed cards get
 * avg_retrievability = 1.0 (assumed strong, not penalized for being unstarted).
 */
export function getSystemPerformanceNeeds(
    userId: string,
    examKey: string,
): SystemPerformanceNeed[] {
    const db = getDb();

    const examRow = db.prepare('SELECT id FROM blueprint_exams WHERE exam_key = ?')
        .get(examKey) as { id: number } | undefined;
    if (!examRow) return [];

    type SystemRow = { id: number; system_key: string; weight_min: number | null; weight_max: number | null };
    const systems = db.prepare(
        'SELECT id, system_key, weight_min, weight_max FROM blueprint_systems WHERE exam_id = ?'
    ).all(examRow.id) as SystemRow[];

    if (systems.length === 0) return [];

    type ReviewStatRow = { system_id: number; total_reviews: number; lapse_count: number };
    const reviewStats = db.prepare(`
        SELECT
            cc.system_id,
            COUNT(*)                                                        AS total_reviews,
            SUM(CASE WHEN r.rating = 'again' THEN 1 ELSE 0 END)            AS lapse_count
        FROM reviews r
        JOIN card_classifications cc ON cc.card_id = r.card_id AND cc.exam_id = ?
        WHERE r.user_id = ?
        GROUP BY cc.system_id
    `).all(examRow.id, userId) as ReviewStatRow[];

    const reviewMap = new Map(reviewStats.map(r => [r.system_id, r]));

    type CardRow = {
        system_id: number;
        state: string;
        due: string;
        stability: number;
        difficulty: number;
        elapsed_days: number;
        scheduled_days: number;
        reps: number;
        lapses: number;
        last_review: string | null;
    };

    const cardRows = db.prepare(`
        SELECT
            cc.system_id,
            c.state, c.due, c.stability, c.difficulty,
            c.elapsed_days, c.scheduled_days, c.reps, c.lapses, c.last_review
        FROM cards c
        JOIN card_classifications cc ON cc.card_id = c.id AND cc.exam_id = ?
        WHERE c.user_id = ? AND c.state != 'new'
    `).all(examRow.id, userId) as CardRow[];

    const systemCards = new Map<number, Card[]>();
    for (const row of cardRows) {
        if (!systemCards.has(row.system_id)) systemCards.set(row.system_id, []);
        systemCards.get(row.system_id)!.push({
            state: row.state,
            due: row.due,
            stability: row.stability,
            difficulty: row.difficulty,
            elapsed_days: row.elapsed_days,
            scheduled_days: row.scheduled_days,
            reps: row.reps,
            lapses: row.lapses,
            last_review: row.last_review,
        } as unknown as Card);
    }

    return systems.map(sys => {
        const stats = reviewMap.get(sys.id);
        const total_reviews = stats?.total_reviews ?? 0;
        const lapse_count = stats?.lapse_count ?? 0;
        const lapse_rate = total_reviews > 0 ? lapse_count / total_reviews : 0;

        const cards = systemCards.get(sys.id) ?? [];
        const avg_retrievability = cards.length > 0
            ? cards.reduce((sum, c) => sum + getRetrievability(c), 0) / cards.length
            : 1.0;

        const performance_need = lapse_rate * 0.5 + (1 - avg_retrievability) * 0.5;
        const weight_min = sys.weight_min ?? 0;
        const weight_max = sys.weight_max ?? 0;

        return {
            system_key: sys.system_key,
            blueprint_weight_midpoint: (weight_min + weight_max) / 2,
            performance_need,
            total_reviews,
        };
    }).sort((a, b) => b.performance_need - a.performance_need);
}

// ─────────────────────────────────────────────────────────────────
// Missed Card Statistics
// ─────────────────────────────────────────────────────────────────

export function fetchSessionClassificationBreakdown(sessionId: string): MissedSystemBreakdown[] {
    const db = getDb();

    type Row = {
        card_id: string;
        system_key: string | null;
        system_label: string | null;
        topic_key: string | null;
        topic_label: string | null;
        split_weight: number | null;
    };

    const rows = db.prepare(`
        SELECT r.card_id,
               bs.system_key,
               bs.label  AS system_label,
               bt.topic_key,
               bt.label  AS topic_label,
               cc.split_weight
        FROM reviews r
        LEFT JOIN card_classifications cc
            ON cc.card_id = r.card_id
            AND cc.exam_id = (
                SELECT uep.exam_id
                FROM deck_sessions ds
                JOIN user_exam_profiles uep
                    ON uep.user_id = ds.user_id AND uep.is_primary = 1
                WHERE ds.id = r.session_id
                LIMIT 1
            )
        LEFT JOIN blueprint_systems bs ON bs.id = cc.system_id
        LEFT JOIN blueprint_topics  bt ON bt.id = cc.topic_id
        WHERE r.session_id = ? AND r.rating = 'again'
        ORDER BY r.card_id, cc.split_weight DESC
    `).all(sessionId) as Row[];

    const systemMap = new Map<string, { breakdown: MissedSystemBreakdown; cardIds: Set<string>; topicCardIds: Map<string, Set<string>>; topicTotals: Map<string, number> }>();

    for (const row of rows) {
        if (!row.system_key || !row.system_label) continue;

        if (!systemMap.has(row.system_key)) {
            systemMap.set(row.system_key, {
                breakdown: {
                    systemKey: row.system_key,
                    systemLabel: row.system_label,
                    missCount: 0,
                    totalReviewsInSystem: 0,
                    missRate: 0,
                    topics: [],
                },
                cardIds: new Set(),
                topicCardIds: new Map(),
                topicTotals: new Map(),
            });
        }

        const entry = systemMap.get(row.system_key)!;
        entry.cardIds.add(row.card_id);

        if (row.topic_key && row.topic_label) {
            if (!entry.topicCardIds.has(row.topic_key)) {
                entry.topicCardIds.set(row.topic_key, new Set());
            }
            entry.topicCardIds.get(row.topic_key)!.add(row.card_id);
        }
    }

    // Get total reviews per system for miss rate denominator
    if (rows.length === 0) return [];

    const result: MissedSystemBreakdown[] = [];
    for (const [, entry] of systemMap) {
        entry.breakdown.missCount = entry.cardIds.size;

        const topics: MissedTopicRow[] = [];
        for (const [topicKey, cardIds] of entry.topicCardIds) {
            const topicLabel = rows.find(r => r.topic_key === topicKey)?.topic_label ?? topicKey;
            topics.push({
                topicKey,
                topicLabel,
                missCount: cardIds.size,
                totalReviewsInTopic: cardIds.size, // approximate — session context
                missRate: 100, // all retrieved rows are 'again' — rate within session context is simplified
            });
        }
        topics.sort((a, b) => b.missCount - a.missCount);
        entry.breakdown.topics = topics;
        entry.breakdown.missRate = 100; // all rows here are 'again' by definition
        result.push(entry.breakdown);
    }

    return result.sort((a, b) => b.missCount - a.missCount);
}

export function fetchMissedCardStats(userId: string, examKey: string, days: DateRangeDays): MissedCardStats {
    const db = getDb();

    const examRow = db.prepare(`SELECT id FROM blueprint_exams WHERE exam_key = ?`).get(examKey) as { id: number } | undefined;
    if (!examRow) {
        return { systems: [], unclassifiedMissCount: 0, totalMissCount: 0, dateRangeDays: days };
    }

    const sinceISO = days != null
        ? (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); })()
        : null;

    const dateFilter = sinceISO ? `AND r.review_time >= ?` : '';
    const baseParams = sinceISO
        ? [examRow.id, userId, sinceISO]
        : [examRow.id, userId];

    type MissRow = {
        system_key: string;
        system_label: string;
        topic_key: string | null;
        topic_label: string | null;
        miss_card_count: number;
    };

    type TotalRow = {
        system_id: number;
        topic_id: number | null;
        total_cards_reviewed: number;
        system_key: string;
        topic_key: string | null;
    };

    const missRows = db.prepare(`
        SELECT bs.system_key,
               bs.label                          AS system_label,
               bt.topic_key,
               bt.label                          AS topic_label,
               COUNT(DISTINCT r.card_id)         AS miss_card_count
        FROM reviews r
        JOIN card_classifications cc ON cc.card_id = r.card_id AND cc.exam_id = ?
        JOIN blueprint_systems    bs ON bs.id = cc.system_id
        LEFT JOIN blueprint_topics bt ON bt.id = cc.topic_id
        WHERE r.user_id = ? AND r.rating = 'again'
        ${dateFilter}
        GROUP BY bs.system_key, bs.label, bt.topic_key, bt.label
        ORDER BY miss_card_count DESC
    `).all(...baseParams) as MissRow[];

    const totalRows = db.prepare(`
        SELECT cc.system_id,
               cc.topic_id,
               bs.system_key,
               bt.topic_key,
               COUNT(DISTINCT r.card_id) AS total_cards_reviewed
        FROM reviews r
        JOIN card_classifications cc ON cc.card_id = r.card_id AND cc.exam_id = ?
        JOIN blueprint_systems    bs ON bs.id = cc.system_id
        LEFT JOIN blueprint_topics bt ON bt.id = cc.topic_id
        WHERE r.user_id = ?
        ${dateFilter}
        GROUP BY cc.system_id, cc.topic_id
    `).all(...baseParams) as TotalRow[];

    // Build total lookup: systemKey+topicKey → total_cards_reviewed
    const totalMap = new Map<string, number>();
    for (const row of totalRows) {
        const key = `${row.system_key}::${row.topic_key ?? '__none__'}`;
        totalMap.set(key, row.total_cards_reviewed);
    }

    // Unclassified miss count
    const unclassifiedParams = sinceISO ? [userId, sinceISO, examRow.id] : [userId, examRow.id];
    const unclassifiedFilter = sinceISO ? `AND r.review_time >= ?` : '';
    const { cnt: unclassifiedMissCount } = db.prepare(`
        SELECT COUNT(DISTINCT r.card_id) AS cnt
        FROM reviews r
        WHERE r.user_id = ? AND r.rating = 'again'
        ${unclassifiedFilter}
        AND NOT EXISTS (
            SELECT 1 FROM card_classifications cc
            WHERE cc.card_id = r.card_id AND cc.exam_id = ?
        )
    `).get(...unclassifiedParams) as { cnt: number };

    // Total miss count (no classification join — avoids double-counting)
    const totalMissParams = sinceISO ? [userId, sinceISO] : [userId];
    const totalMissFilter = sinceISO ? `AND review_time >= ?` : '';
    const { cnt: totalMissCount } = db.prepare(`
        SELECT COUNT(DISTINCT card_id) AS cnt
        FROM reviews
        WHERE user_id = ? AND rating = 'again'
        ${totalMissFilter}
    `).get(...totalMissParams) as { cnt: number };

    // Build hierarchical structure
    const systemMap = new Map<string, MissedSystemBreakdown>();
    for (const row of missRows) {
        if (!systemMap.has(row.system_key)) {
            systemMap.set(row.system_key, {
                systemKey: row.system_key,
                systemLabel: row.system_label,
                missCount: 0,
                totalReviewsInSystem: 0,
                missRate: 0,
                topics: [],
            });
        }
        const sys = systemMap.get(row.system_key)!;

        if (row.topic_key && row.topic_label) {
            const totalKey = `${row.system_key}::${row.topic_key}`;
            const totalInTopic = totalMap.get(totalKey) ?? row.miss_card_count;
            sys.topics.push({
                topicKey: row.topic_key,
                topicLabel: row.topic_label,
                missCount: row.miss_card_count,
                totalReviewsInTopic: totalInTopic,
                missRate: totalInTopic > 0 ? (row.miss_card_count / totalInTopic) * 100 : 0,
            });
        }

        // System-level miss count = max distinct missed cards (no topic = card may span multiple topics)
        const sysTotal = totalMap.get(`${row.system_key}::__none__`) ??
            totalRows.filter(t => t.system_key === row.system_key).reduce((s, t) => s + t.total_cards_reviewed, 0);
        sys.missCount = Math.max(sys.missCount, row.miss_card_count);
        sys.totalReviewsInSystem = sysTotal;
        sys.missRate = sysTotal > 0 ? (sys.missCount / sysTotal) * 100 : 0;
    }

    // Recalculate system missCount as sum of distinct cards across topics
    for (const [, sys] of systemMap) {
        sys.topics.sort((a, b) => b.missCount - a.missCount);
        const sysMissKey = `${sys.systemKey}::__none__`;
        const totalInSys = totalMap.get(sysMissKey) ??
            totalRows.filter(t => t.system_key === sys.systemKey)
                .reduce((acc, t) => acc + t.total_cards_reviewed, 0);
        if (totalInSys > 0) {
            sys.totalReviewsInSystem = totalInSys;
            sys.missRate = (sys.missCount / totalInSys) * 100;
        }
    }

    const systems = [...systemMap.values()].sort((a, b) => b.missCount - a.missCount);

    return { systems, unclassifiedMissCount, totalMissCount, dateRangeDays: days };
}

export function fetchMissRateTrend(userId: string, days: DateRangeDays): MissRateTrendPoint[] {
    const db = getDb();

    const sinceISO = days != null
        ? (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); })()
        : null;

    const dateFilter = sinceISO ? `AND review_time >= ?` : '';
    const params = sinceISO ? [userId, sinceISO] : [userId];

    // Use daily buckets for bounded ranges, weekly for all-time
    const dateBucket = days == null
        ? `strftime('%Y-W%W', review_time)`
        : `DATE(review_time)`;

    type TrendRow = {
        review_date: string;
        total_reviews: number;
        miss_count: number;
    };

    const rows = db.prepare(`
        SELECT ${dateBucket}                                          AS review_date,
               COUNT(*)                                              AS total_reviews,
               SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END)    AS miss_count
        FROM reviews
        WHERE user_id = ?
        ${dateFilter}
        GROUP BY ${dateBucket}
        ORDER BY review_date ASC
    `).all(...params) as TrendRow[];

    return rows.map(r => ({
        date: r.review_date,
        totalReviews: r.total_reviews,
        missCount: r.miss_count,
        missRate: r.total_reviews > 0 ? (r.miss_count / r.total_reviews) * 100 : 0,
    }));
}
