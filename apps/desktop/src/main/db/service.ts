import { randomUUID } from 'node:crypto';
import { getDb } from './index';
import type {
    Deck, DeckInsert, DeckUpdate,
    Note, NoteInsert, NoteUpdate,
    NoteType, NoteTypeInsert,
    Card, CardInsert,
    Review,
    Media, MediaInsert,
    DeckSession,
    DraftCard, DraftCardInsert,
    SessionAnalytics,
    Rating,
} from '@sekel/db';
import type { DeckStats } from '@sekel/db';
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
        INSERT INTO decks (id, user_id, name, description, algorithm, parent_id, anki_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, deck.user_id, deck.name, deck.description ?? null, deck.algorithm ?? 'fsrs', deck.parent_id ?? null, deck.anki_id ?? null, now, now);
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
    getDb().prepare('DELETE FROM decks WHERE id = ?').run(id);
}

export function deleteDecks(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    getDb().prepare(`DELETE FROM decks WHERE id IN (${placeholders})`).run(...ids);
}

export function fetchDecksByAnkiIds(userId: string, ankiIds: number[]): Deck[] {
    if (ankiIds.length === 0) return [];
    const placeholders = ankiIds.map(() => '?').join(', ');
    const rows = getDb()
        .prepare(`SELECT * FROM decks WHERE user_id = ? AND anki_id IN (${placeholders})`)
        .all(userId, ...ankiIds) as Record<string, unknown>[];
    return rows.map(mapDeck);
}

export function fetchDeckStats(deckId: string): DeckStats {
    const now = new Date().toISOString();
    const db = getDb();

    type StatRow = { state: string; due: string };
    const cards = db.prepare(`
        SELECT c.state, c.due
        FROM cards c
        JOIN notes n ON c.note_id = n.id
        WHERE n.deck_id = ?
    `).all(deckId) as StatRow[];

    const stats: DeckStats = { deckId, newCount: 0, learningCount: 0, reviewCount: 0, totalCount: cards.length };
    for (const card of cards) {
        if (card.state === 'new') stats.newCount++;
        else if (card.state === 'learning' || card.state === 'relearning') stats.learningCount++;
        else if (card.state === 'review' && card.due <= now) stats.reviewCount++;
    }
    return stats;
}

export function fetchAllDueCardsCount(userId: string): number {
    const now = new Date().toISOString();
    const row = getDb().prepare(`
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

// ── Cards ─────────────────────────────────────────────────────────────────────

type CardWithNoteRow = Record<string, unknown>;

function buildCardWithNote(row: CardWithNoteRow): CardWithNote {
    const noteType: NoteType = {
        id: row.nt_id as string,
        user_id: row.user_id as string,
        anki_id: (row.nt_anki_id as number | null) ?? null,
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
        created_at: row.note_created_at as string,
        updated_at: row.note_updated_at as string,
        note_type: noteType,
    };
    return {
        id: row.id as string,
        user_id: row.user_id as string,
        anki_id: (row.anki_id as number | null) ?? null,
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

const CARD_WITH_NOTE_SQL = `
    SELECT
        c.id, c.user_id, c.note_id, c.template_index,
        c.state, c.due, c.stability, c.difficulty,
        c.elapsed_days, c.scheduled_days, c.reps, c.lapses,
        c.last_review, c.created_at, c.updated_at,
        n.id       AS note_id,
        n.deck_id  AS deck_id,
        n.note_type_id,
        n.fields   AS note_fields,
        n.tags     AS note_tags,
        n.created_at AS note_created_at,
        n.updated_at AS note_updated_at,
        nt.id          AS nt_id,
        nt.anki_id     AS nt_anki_id,
        nt.name        AS nt_name,
        nt.fields      AS nt_fields,
        nt.card_templates AS nt_templates,
        nt.created_at  AS nt_created_at,
        nt.updated_at  AS nt_updated_at
    FROM cards c
    JOIN notes n  ON c.note_id = n.id
    JOIN note_types nt ON n.note_type_id = nt.id
`;

export function fetchDueCards(deckId: string, limit = 50): CardWithNote[] {
    const now = new Date().toISOString();
    const rows = getDb().prepare(`
        ${CARD_WITH_NOTE_SQL}
        WHERE n.deck_id = ?
          AND (c.state IN ('new', 'learning', 'relearning')
               OR (c.state = 'review' AND c.due <= ?))
        ORDER BY c.due ASC
        LIMIT ?
    `).all(deckId, now, limit) as CardWithNoteRow[];
    return rows.map(buildCardWithNote);
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
        INSERT INTO note_types (id, user_id, name, fields, card_templates, anki_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, noteType.user_id, noteType.name, s(noteType.fields), s(noteType.card_templates), noteType.anki_id ?? null, now, now);
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

    type ReviewRow = { id: string; card_id: string; rating: string; review_index: number | null };
    const reviews = db.prepare(`
        SELECT id, card_id, rating, review_index FROM reviews
        WHERE session_id = ?
        ORDER BY review_index ASC
    `).all(sessionId) as ReviewRow[];

    if (reviews.length === 0) {
        return {
            retentionTrend: [],
            ratingDistribution: [],
            lapseStats: { lapseCount: 0, lapseRate: 0, totalReviews: 0, topForgottenCards: [] },
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

    return {
        retentionTrend,
        ratingDistribution,
        lapseStats: {
            lapseCount: againCount,
            lapseRate: totalReviews > 0 ? (againCount / totalReviews) * 100 : 0,
            totalReviews,
            topForgottenCards,
        },
    };
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
