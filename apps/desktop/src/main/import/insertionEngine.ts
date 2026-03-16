/**
 * Phase 6 — Anki → Sekel data insertion.
 * Pure synchronous function wrapping all writes in a single SQLite transaction.
 * Never touches IPC or React.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index';
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
} from './types';

// Anki stores review-card due dates as "days since 2006-01-01 UTC"
const ANKI_EPOCH_MS = 1136073600000;

export interface ImportResult {
    decksCreated: number;
    decksSkipped: number;
    notesInserted: number;
    cardsInserted: number;
}

export function executeImport(options: ImportOptions, userId: string): ImportResult {
    const result: ImportResult = { decksCreated: 0, decksSkipped: 0, notesInserted: 0, cardsInserted: 0 };
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
            (id, user_id, deck_id, note_type_id, fields, tags, anki_id, anki_guid, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCard = db.prepare(`
        INSERT INTO cards
            (id, user_id, note_id, template_index, state, due,
             stability, difficulty, elapsed_days, scheduled_days,
             reps, lapses, last_review, anki_id, ease_factor, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findNoteByGuid = db.prepare(
        'SELECT id FROM notes WHERE deck_id = ? AND anki_guid = ?',
    );
    const deleteCards = db.prepare(
        "DELETE FROM cards WHERE note_id IN (SELECT id FROM notes WHERE deck_id = ?)",
    );
    const deleteNotes = db.prepare('DELETE FROM notes WHERE deck_id = ?');

    const tx = db.transaction(() => {
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
                // Resolve parent deck id from the name hierarchy
                let parentId: string | null = null;
                if (ankiDeck.nameComponents.length > 1) {
                    const parentName = ankiDeck.nameComponents.slice(0, -1).join('::');
                    parentId = nameToSekelId.get(parentName) ?? null;
                }

                const sekelDeck = createDeck({
                    user_id: userId,
                    name: opt.deckName,
                    description: null,
                    algorithm: opt.algorithm,
                    parent_id: parentId,
                    anki_id: ankiDeckId,
                });
                sekelDeckId = sekelDeck.id;
                result.decksCreated++;
            }

            nameToSekelId.set(ankiDeck.name, sekelDeckId);

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
                    if (findNoteByGuid.get(sekelDeckId, ankiNote.guid)) continue;
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
                            front_template: t.qfmt,
                            back_template: t.afmt,
                        })),
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
                    JSON.stringify(ankiNote.fields),
                    JSON.stringify(ankiNote.tags),
                    ankiNoteId,
                    ankiNote.guid,
                    now,
                    now,
                );
                result.notesInserted++;

                // Insert one Sekel card per Anki card (preserves multi-template notes)
                for (const ankiCard of cards) {
                    const cardId = randomUUID();
                    const { state, due, stability, difficulty, scheduledDays, easeFactor } =
                        mapScheduling(ankiCard, opt);

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
                        null,                // last_review (not tracked per-card in Anki revlog in this phase)
                        ankiCard.id,         // anki_id
                        easeFactor,
                        now,
                        now,
                    );
                    result.cardsInserted++;
                }
            }
        }
    });

    tx();
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

function mapScheduling(ankiCard: AnkiCard, opt: ImportOptionsDeck): SchedulingValues {
    const now = new Date().toISOString();

    if (opt.scheduling === 'fresh') {
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
