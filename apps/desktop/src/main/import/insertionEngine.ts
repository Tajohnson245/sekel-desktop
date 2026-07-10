/**
 * Phase 6 — Anki → Sekel data insertion.
 * Pure synchronous function wrapping all writes in a single SQLite transaction.
 * Never touches IPC or React.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index';
import { metrics, createLogger, consoleTransport } from '@sekel/observability';

const log = createLogger({ module: 'import', transports: [consoleTransport] });
import {
    createDeck,
    fetchDecksByAnkiIds,
    fetchNoteTypes,
    createNoteType,
} from '../db/service';
import type { NoteType } from '@sekel/db';
import type { CardState } from '@sekel/db';
import type {
    ImportOptions,
    ImportOptionsDeck,
    AnkiCard,
    AnkiReviewLog,
} from './types';
import { sanitizeNoteFields, sanitizeTemplateHtml } from './sanitizeFields';

// Anki stores review-card due dates as "days since 2006-01-01 UTC"
const ANKI_EPOCH_MS = 1136073600000;

export interface ImportResult {
    decksCreated: number;
    decksSkipped: number;
    notesInserted: number;
    /** Notes skipped during merge because they already exist in the collection. */
    notesSkipped: number;
    cardsInserted: number;
    reviewsInserted: number;
}

export type ImportProgressCallback = (stage: string, detail: string, percent: number) => void;

export function executeImport(
    options: ImportOptions,
    userId: string,
    onProgress?: ImportProgressCallback,
): ImportResult {
    const result: ImportResult = { decksCreated: 0, decksSkipped: 0, notesInserted: 0, notesSkipped: 0, cardsInserted: 0, reviewsInserted: 0 };
    const { parsedData, decks: deckOptions } = options;

    const selectedOptions = new Map(
        deckOptions.filter(d => d.selected).map(d => [d.ankiDeckId, d]),
    );
    if (selectedOptions.size === 0) return result;

    // Conflict detection: existing Sekel decks keyed by anki_id
    const existingByAnkiId = new Map(
        fetchDecksByAnkiIds(userId, Array.from(selectedOptions.keys()))
            .filter(d => d.anki_id !== null)
            .map(d => [d.anki_id!, d]),
    );

    // NoteType cache: anki_id → Sekel NoteType (avoid duplicate creates)
    const noteTypeCache = new Map<number, NoteType>(
        fetchNoteTypes(userId)
            .filter(nt => nt.anki_id !== null)
            .map(nt => [nt.anki_id!, nt]),
    );

    // Process decks sorted by hierarchy depth so parents are created first
    const sortedDeckIds = Array.from(selectedOptions.keys()).sort((a, b) => {
        const da = parsedData.decks.get(a)?.nameComponents.length ?? 0;
        const db = parsedData.decks.get(b)?.nameComponents.length ?? 0;
        return da - db;
    });

    // Full deck name ("A::B") → Sekel deck UUID (for parent_id resolution)
    const nameToSekelId = new Map<string, string>();

    const db = getDb();

    // Prepare statements used in the hot loop (created once, reused per row)
    const insertNote = db.prepare(`
        INSERT INTO notes
            (id, user_id, deck_id, note_type_id, fields, tags, anki_id, anki_guid, anki_meta, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCard = db.prepare(`
        INSERT INTO cards
            (id, user_id, note_id, template_index, state, due,
             stability, difficulty, elapsed_days, scheduled_days,
             reps, lapses, last_review, anki_id, anki_meta, ease_factor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findNoteByGuid = db.prepare(
        'SELECT id FROM notes WHERE user_id = ? AND anki_guid = ?',
    );
    const deleteCards = db.prepare(
        "DELETE FROM cards WHERE note_id IN (SELECT id FROM notes WHERE deck_id = ?)",
    );
    const deleteNotes = db.prepare('DELETE FROM notes WHERE deck_id = ?');
    const insertReviewLog = db.prepare(`
        INSERT INTO reviews
            (id, user_id, card_id, rating, review_time, review_duration_ms,
             state_before, stability_before, difficulty_before,
             state_after, stability_after, difficulty_after,
             scheduled_days, session_id, deck_id, review_index,
             interval_before, ease_factor_after, review_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Pre-count total cards for progress reporting
    const totalCards = parsedData.cards.filter(c => selectedOptions.has(c.did)).length;
    const totalRevlogs = parsedData.revlog.length;

    // Cards that actually have review history. In 'keep' mode, a card with no
    // history starts as new regardless of its Anki type, so shared/prebuilt decks
    // (whose cards may carry type=review with no personal revlog) don't import as a
    // wall of spuriously-due cards. (SEKEL-138)
    const cardsWithHistory = new Set<number>(parsedData.revlog.map(r => r.cid));

    // Maps built during card insertion for use when inserting review logs
    const ankiCardIdToSekelCardId = new Map<number, string>();
    const ankiCardIdToSekelDeckId = new Map<number, string>();
    // Tracks which anki deck ids used 'keep' scheduling (only those get review logs)
    const keepSchedulingDeckIds = new Set<number>();

    const tx = db.transaction(() => {
        onProgress?.('inserting-decks', `Creating ${sortedDeckIds.length} deck(s)`, 30);

        for (const ankiDeckId of sortedDeckIds) {
            const opt = selectedOptions.get(ankiDeckId)!;
            const ankiDeck = parsedData.decks.get(ankiDeckId);
            if (!ankiDeck) continue;

            const existing = existingByAnkiId.get(ankiDeckId);

            let sekelDeckId: string;

            if (existing) {
                if (opt.conflict === 'skip') {
                    result.decksSkipped++;
                    nameToSekelId.set(ankiDeck.name, existing.id);
                    continue;
                }
                if (opt.conflict === 'overwrite') {
                    // Wipe all existing content so we do a clean re-import
                    deleteCards.run(existing.id);
                    deleteNotes.run(existing.id);
                }
                // overwrite and merge both reuse the existing deck record
                sekelDeckId = existing.id;
            } else {
                // Resolve parent deck id from the name hierarchy (subdecks mode only)
                let parentId: string | null = null;
                if (options.hierarchyMode !== 'individual' && ankiDeck.nameComponents.length > 1) {
                    const parentName = ankiDeck.nameComponents.slice(0, -1).join('::');
                    parentId = nameToSekelId.get(parentName) ?? null;
                }

                const dconf = parsedData.deckConfigs.get(ankiDeck.conf) ?? null;
                const sekelDeck = createDeck({
                    user_id: userId,
                    name: opt.deckName,
                    description: null,
                    algorithm: opt.algorithm,
                    parent_id: parentId,
                    anki_id: ankiDeckId,
                    anki_meta: JSON.stringify({
                        conf: ankiDeck.conf,
                        mod: ankiDeck.mod,
                        collapsed: ankiDeck.collapsed,
                        dconf: dconf ? { id: dconf.id, name: dconf.name, new: dconf.new, rev: dconf.rev, lapse: dconf.lapse } : null,
                    }),
                });
                sekelDeckId = sekelDeck.id;
                result.decksCreated++;
            }

            nameToSekelId.set(ankiDeck.name, sekelDeckId);
            if (opt.scheduling === 'keep') keepSchedulingDeckIds.add(ankiDeckId);

            // Report note type / notes progress once per deck
            if (result.cardsInserted === 0) {
                onProgress?.('inserting-notes', `Importing notes and cards...`, 35);
            }

            // All Anki cards belonging to this deck
            const ankiCards = parsedData.cards.filter(c => c.did === ankiDeckId);

            // Group cards by note id
            const cardsByNote = new Map<number, AnkiCard[]>();
            for (const card of ankiCards) {
                let group = cardsByNote.get(card.nid);
                if (!group) { group = []; cardsByNote.set(card.nid, group); }
                group.push(card);
            }

            const now = new Date().toISOString();

            for (const [ankiNoteId, cards] of cardsByNote) {
                const ankiNote = parsedData.notes.get(ankiNoteId);
                if (!ankiNote) continue;

                // Merge mode: skip notes already imported (identified by anki_guid)
                if (opt.conflict === 'merge' && existing) {
                    if (findNoteByGuid.get(userId, ankiNote.guid)) {
                        result.notesSkipped++;
                        continue;
                    }
                }

                // Ensure NoteType exists (upsert by anki_id)
                let noteType = noteTypeCache.get(ankiNote.mid);
                if (!noteType) {
                    const model = parsedData.models.get(ankiNote.mid);
                    if (!model) continue;
                    noteType = createNoteType({
                        user_id: userId,
                        name: model.name,
                        anki_id: model.id,
                        fields: model.flds.map(f => ({ name: f.name })),
                        card_templates: model.tmpls.map(t => ({
                            name: t.name,
                            front_template: sanitizeTemplateHtml(t.qfmt),
                            back_template: sanitizeTemplateHtml(t.afmt),
                        })),
                        anki_meta: JSON.stringify({
                            css: model.css,
                            type: model.type,
                            mod: model.mod,
                            fields: model.flds.map(f => ({ name: f.name, sticky: f.sticky, font: f.font, size: f.size })),
                            templates: model.tmpls.map(t => ({ name: t.name, bqfmt: t.bqfmt, bafmt: t.bafmt })),
                        }),
                    });
                    noteTypeCache.set(ankiNote.mid, noteType);
                }

                // Insert note (with anki_id + anki_guid for future dedup/sync)
                const noteId = randomUUID();
                insertNote.run(
                    noteId,
                    userId,
                    sekelDeckId,
                    noteType.id,
                    sanitizeNoteFields(ankiNote.fields),
                    JSON.stringify(ankiNote.tags),
                    ankiNoteId,
                    ankiNote.guid,
                    JSON.stringify({ mod: ankiNote.mod }),
                    now,
                    now,
                );
                result.notesInserted++;

                // Insert one Sekel card per Anki card (preserves multi-template notes)
                for (const ankiCard of cards) {
                    const cardId = randomUUID();
                    const { state, due, stability, difficulty, scheduledDays, easeFactor } =
                        mapScheduling(ankiCard, opt, cardsWithHistory.has(ankiCard.id));

                    insertCard.run(
                        cardId,
                        userId,
                        noteId,
                        ankiCard.ord,        // template_index
                        state,
                        due,
                        stability,
                        difficulty,
                        Math.max(ankiCard.ivl, 0),  // elapsed_days
                        scheduledDays,
                        ankiCard.reps,
                        ankiCard.lapses,
                        null,                // last_review
                        ankiCard.id,         // anki_id
                        JSON.stringify({ queue: ankiCard.queue, mod: ankiCard.mod }),
                        easeFactor,
                        now,
                        now,
                    );
                    result.cardsInserted++;
                    ankiCardIdToSekelCardId.set(ankiCard.id, cardId);
                    ankiCardIdToSekelDeckId.set(ankiCard.id, sekelDeckId);

                    // Report progress every 100 cards
                    if (result.cardsInserted % 100 === 0) {
                        const cardPercent = totalCards > 0
                            ? 35 + Math.round((result.cardsInserted / totalCards) * 45)
                            : 35;
                        onProgress?.(
                            'inserting-cards',
                            `${result.cardsInserted.toLocaleString()} / ${totalCards.toLocaleString()} cards`,
                            Math.min(cardPercent, 80),
                        );
                    }
                }
            }
        }

        // Insert Anki review logs for all cards that used 'keep' scheduling
        if (keepSchedulingDeckIds.size > 0) {
            onProgress?.('inserting-reviews', `Importing review history...`, 80);
            const createdAt = new Date().toISOString();
            let reviewsProcessed = 0;
            for (const revlog of parsedData.revlog) {
                const sekelCardId = ankiCardIdToSekelCardId.get(revlog.cid);
                if (!sekelCardId) continue; // card was not imported (different deck or deselected)

                const deckId = ankiCardIdToSekelDeckId.get(revlog.cid)!;
                // Determine which anki deck this card belongs to — skip if 'fresh' scheduling
                const ankiCard = parsedData.cards.find(c => c.id === revlog.cid);
                if (!ankiCard || !keepSchedulingDeckIds.has(ankiCard.did)) continue;

                insertReviewLog.run(
                    randomUUID(),
                    userId,
                    sekelCardId,
                    mapAnkiEaseToRating(revlog.ease),
                    new Date(revlog.id).toISOString(),      // review_time (revlog.id is Unix ms)
                    revlog.time,                             // review_duration_ms
                    mapRevlogStateBefore(revlog),            // state_before
                    Math.max(0, revlog.lastIvl),             // stability_before ≈ lastIvl
                    mapFactorToDifficulty(revlog.factor),    // difficulty_before
                    mapRevlogStateAfter(revlog.type),        // state_after
                    Math.max(0, revlog.ivl),                 // stability_after ≈ ivl
                    mapFactorToDifficulty(revlog.factor),    // difficulty_after
                    Math.max(0, revlog.ivl),                 // scheduled_days
                    null,                                    // session_id
                    deckId,                                  // deck_id
                    null,                                    // review_index
                    Math.max(0, revlog.lastIvl),             // interval_before
                    revlog.factor > 0 ? revlog.factor / 1000 : null, // ease_factor_after (SM-2 ratio)
                    revlog.type,                             // review_type (0=learn,1=review,2=relearn,3=filtered)
                    createdAt,
                );
                result.reviewsInserted++;
                reviewsProcessed++;

                // Report progress every 500 review logs
                if (reviewsProcessed % 500 === 0) {
                    const revPercent = totalRevlogs > 0
                        ? 80 + Math.round((reviewsProcessed / totalRevlogs) * 15)
                        : 80;
                    onProgress?.(
                        'inserting-reviews',
                        `${reviewsProcessed.toLocaleString()} / ${totalRevlogs.toLocaleString()} reviews`,
                        Math.min(revPercent, 95),
                    );
                }
            }
        }
    });

    const endTimer = metrics.startTimer('import.transaction_ms');
    tx();
    const ms = endTimer();
    log.info('Import transaction completed', {
        durationMs: Math.round(ms),
        decksCreated: result.decksCreated,
        cardsInserted: result.cardsInserted,
        notesInserted: result.notesInserted,
        reviewsInserted: result.reviewsInserted,
    });
    metrics.increment('import.cards_inserted', {}, result.cardsInserted);
    return result;
}

// ── Scheduling helpers ────────────────────────────────────────────────────────

interface SchedulingValues {
    state: CardState;
    due: string;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    easeFactor: number | null;
}

function mapScheduling(ankiCard: AnkiCard, opt: ImportOptionsDeck, hasHistory: boolean): SchedulingValues {
    const now = new Date().toISOString();

    // Reset to new when the user chose 'fresh', OR (in 'keep' mode) when the card
    // has no review history — "no data → new". Cards with real history keep their
    // schedule below.
    if (opt.scheduling === 'fresh' || !hasHistory) {
        return {
            state: 'new',
            due: now,
            stability: 0,
            difficulty: 0,
            scheduledDays: 0,
            easeFactor: null,
        };
    }

    // Keep scheduling: map Anki state + compute due date
    const state = mapAnkiState(ankiCard.type);
    const due = computeDue(ankiCard, now);
    const ivl = Math.max(ankiCard.ivl, 0);

    // FSRS approximation: stability ≈ interval, difficulty derived from ease factor
    // Anki ease: 2500 = default (good learner). Higher = easier = lower FSRS difficulty.
    // Map range [1300, 3500] → difficulty [10, 0]
    const difficulty = Math.max(0, Math.min(10, (3500 - ankiCard.factor) / 200));

    // SM-2 ease factor stored as ratio (e.g. 2.5)
    const easeFactor = opt.algorithm === 'sm2' ? ankiCard.factor / 1000 : null;

    return {
        state,
        due,
        stability: ivl,
        difficulty,
        scheduledDays: ivl,
        easeFactor,
    };
}

function mapAnkiState(type: number): CardState {
    switch (type) {
        case 0: return 'new';
        case 1: return 'learning';
        case 2: return 'review';
        case 3: return 'relearning';
        default: return 'new';
    }
}

// ── Review log helpers ────────────────────────────────────────────────────────

/** Maps Anki ease (1–4) to Sekel rating string. */
function mapAnkiEaseToRating(ease: number): string {
    switch (ease) {
        case 1: return 'again';
        case 2: return 'hard';
        case 3: return 'good';
        case 4: return 'easy';
        default: return 'good';
    }
}

/**
 * Approximates state_before from the revlog entry.
 * Anki doesn't store state_before directly; we infer it from lastIvl.
 * lastIvl = 0 means the card was new before this review.
 */
function mapRevlogStateBefore(revlog: AnkiReviewLog): string {
    if (revlog.lastIvl === 0) return 'new';
    if (revlog.lastIvl < 0) return 'learning'; // negative ivl = learning step in seconds
    return 'review';
}

/** Maps Anki review type (0–3) to Sekel state_after. */
function mapRevlogStateAfter(type: number): string {
    switch (type) {
        case 0: return 'learning';
        case 1: return 'review';
        case 2: return 'relearning';
        case 3: return 'review'; // filtered deck reviews
        default: return 'review';
    }
}

/** Maps Anki ease factor to FSRS difficulty (0–10 scale). */
function mapFactorToDifficulty(factor: number): number {
    if (factor === 0) return 5; // default difficulty when factor is unknown
    return Math.max(0, Math.min(10, (3500 - factor) / 200));
}

function computeDue(ankiCard: AnkiCard, now: string): string {
    if (ankiCard.type === 0) return now;

    if (ankiCard.type === 2) {
        // Review: due is days since Anki epoch (2006-01-01)
        return new Date(ANKI_EPOCH_MS + ankiCard.due * 86400000).toISOString();
    }

    if ((ankiCard.type === 1 || ankiCard.type === 3) && ankiCard.due > 0) {
        // Learning/relearning: due is Unix timestamp in seconds
        return new Date(ankiCard.due * 1000).toISOString();
    }

    return now;
}
