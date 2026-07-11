import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../main/db/migrations';

// Stub the boot logger (same reason as backfillPlanCoverage.test.ts) and inject
// an in-memory DB in place of the real getDb() singleton so planService/service
// run against the test database.
vi.mock('@sekel/observability', () => ({
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {} }),
    consoleTransport: {},
    instrumentedHandle: () => {},
    trackedCompletion: async () => ({ choices: [{ message: { content: '{}' } }] }),
}));

const h = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../main/db/index', () => ({ getDb: () => h.db }));

import { computePlan, getActivePlan } from '../main/db/planService';

// ── Schema + seed ───────────────────────────────────────────────────────────

function setupDb(): Database.Database {
    const d = new Database(':memory:');
    // FKs off: we seed only the tables the plan engine reads (no note_types/decks
    // needed for an all-decks plan, whose unseen query hits `cards` directly).
    d.pragma('foreign_keys = OFF');
    d.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    for (let i = 0; i < MIGRATIONS.length; i++) {
        d.exec(MIGRATIONS[i]);
        d.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
    }
    return d;
}

const TS = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-06-01'; // far exam date → availableDays is large, coverage never rate-limited

/** Seed a shelf-style exam with TWO systems that ship NO topics (topic_id stays NULL
 *  on their classifications) — the exact shape that used to blank System Coverage. */
function seedTopiclessExam(db: Database.Database) {
    db.prepare('INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (1, ?, ?, ?)')
        .run('im-shelf', 'IM Shelf', TS);
    db.prepare('INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (?,?,?,?,?,?)')
        .run(10, 1, 'cardio', 'Cardiovascular', 20, 30);
    db.prepare('INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (?,?,?,?,?,?)')
        .run(11, 1, 'renal', 'Renal', 10, 20);
    db.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                VALUES ('u1', 1, ?, 1, 'auto', ?, ?)`).run(FUTURE, TS, TS);
}

function insertNewCard(db: Database.Database, id: string) {
    db.prepare(`INSERT INTO cards (id, user_id, note_id, state, due, created_at, updated_at)
                VALUES (?, 'u1', ?, 'new', ?, ?, ?)`).run(id, `note-${id}`, TS, TS, TS);
}

function insertSeenCard(db: Database.Database, id: string) {
    // Realistic FSRS state — getSystemPerformanceNeeds computes retrievability, which
    // requires a non-zero stability and a real last_review.
    db.prepare(`INSERT INTO cards (id, user_id, note_id, state, due, stability, difficulty,
                    elapsed_days, scheduled_days, reps, lapses, last_review, created_at, updated_at)
                VALUES (?, 'u1', ?, 'review', ?, 10, 5, 5, 10, 3, 0, ?, ?, ?)`)
        .run(id, `note-${id}`, FUTURE, TS, TS, TS);
}

function classify(db: Database.Database, cardId: string, systemId: number) {
    // topic_id NULL — the classification a shelf exam (no topics) always produces.
    db.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at)
                VALUES (?, 1, ?, NULL, 0.9, 1.0, ?)`).run(cardId, systemId, TS);
}

beforeEach(() => {
    h.db = setupDb();
});

describe('computePlan — topic-less (shelf-exam) classifications', () => {
    it('buckets topic-less classified cards into their system instead of dropping them', () => {
        seedTopiclessExam(h.db);
        insertNewCard(h.db, 'c1'); classify(h.db, 'c1', 10); // cardio
        insertNewCard(h.db, 'c2'); classify(h.db, 'c2', 11); // renal
        insertNewCard(h.db, 'c3');                            // unclassified

        const result = computePlan('u1', 'im-shelf');
        expect(result).not.toBeNull();
        expect(result!.unseenTotal).toBe(3);

        const cardio = result!.systemCoverage.find(s => s.systemKey === 'cardio')!;
        const renal  = result!.systemCoverage.find(s => s.systemKey === 'renal')!;

        // The regression this guards: before the LEFT JOIN these were 0 (cards dropped
        // by the inner join to blueprint_topics) → System Coverage rendered blank.
        expect(cardio.totalCards).toBe(1);
        expect(renal.totalCards).toBe(1);
        expect(cardio.cardsInPlan).toBe(1);   // far exam date → whole scope is in-plan
        expect(cardio.coveragePct).toBe(100);

        // hasClassifiedCards (drives the grid vs empty-state) is now true.
        expect(result!.systemCoverage.some(s => s.totalCards > 0)).toBe(true);
    });

    it('reports seenCards (studied) separately from unseen totalCards', () => {
        seedTopiclessExam(h.db);
        insertNewCard(h.db, 'c1');  classify(h.db, 'c1', 10); // cardio, unseen
        insertSeenCard(h.db, 'c2'); classify(h.db, 'c2', 10); // cardio, studied
        insertSeenCard(h.db, 'c3'); classify(h.db, 'c3', 10); // cardio, studied
        insertSeenCard(h.db, 'c4'); classify(h.db, 'c4', 11); // renal, studied (mastered — no unseen)

        const r = computePlan('u1', 'im-shelf')!;
        const cardio = r.systemCoverage.find(s => s.systemKey === 'cardio')!;
        const renal  = r.systemCoverage.find(s => s.systemKey === 'renal')!;

        expect(r.unseenTotal).toBe(1);          // only c1 is state='new'
        expect(cardio.totalCards).toBe(1);       // 1 unseen
        expect(cardio.seenCards).toBe(2);        // 2 studied
        // Mastered system: 0 unseen but studied > 0 → renders "Covered", not "No data".
        expect(renal.totalCards).toBe(0);
        expect(renal.seenCards).toBe(1);
    });

    it('returns null when the exam profile is missing', () => {
        // no seed → no primary exam profile
        expect(computePlan('u1', 'im-shelf')).toBeNull();
    });
});

describe('computePlan — normalized yield scoring', () => {
    // A topic'd exam (like the USMLE Steps / NAPLEX) with a heavy and a light system,
    // plus a mid system, so the normalized 0–100 score spans high / medium / low.
    function seedTopicedExam(db: Database.Database) {
        db.prepare('INSERT INTO blueprint_exams (id, exam_key, label, updated_at) VALUES (2, ?, ?, ?)')
            .run('step-x', 'Step X', TS);
        // system mid weights: 40 (heavy), 20 (mid), 5 (light)
        db.prepare('INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (?,?,?,?,?,?)')
            .run(20, 2, 'heavy', 'Heavy', 40, 40);
        db.prepare('INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (?,?,?,?,?,?)')
            .run(21, 2, 'light', 'Light', 5, 5);
        db.prepare('INSERT INTO blueprint_systems (id, exam_id, system_key, label, weight_min, weight_max) VALUES (?,?,?,?,?,?)')
            .run(22, 2, 'mid', 'Mid', 20, 20);
        // topics with relative weights → exam max system×topic = 40*0.5 = 20
        db.prepare('INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (?,?,?,?,?)')
            .run(200, 20, 'tHeavy', 'T Heavy', 0.5);
        db.prepare('INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (?,?,?,?,?)')
            .run(201, 21, 'tLight', 'T Light', 0.2);
        db.prepare('INSERT INTO blueprint_topics (id, system_id, topic_key, label, relative_weight) VALUES (?,?,?,?,?)')
            .run(202, 22, 'tMid', 'T Mid', 0.5);
        db.prepare(`INSERT INTO user_exam_profiles (user_id, exam_id, exam_date, is_primary, session_mode, created_at, updated_at)
                    VALUES ('u2', 2, ?, 1, 'auto', ?, ?)`).run(FUTURE, TS, TS);
    }
    function insertCardU2(db: Database.Database, id: string) {
        db.prepare(`INSERT INTO cards (id, user_id, note_id, state, due, created_at, updated_at)
                    VALUES (?, 'u2', ?, 'new', ?, ?, ?)`).run(id, `note-${id}`, TS, TS, TS);
    }
    function classifyTopic(db: Database.Database, cardId: string, systemId: number, topicId: number, confidence: number) {
        db.prepare(`INSERT INTO card_classifications (card_id, exam_id, system_id, topic_id, confidence, split_weight, classified_at)
                    VALUES (?, 2, ?, ?, ?, 1.0, ?)`).run(cardId, systemId, topicId, confidence, TS);
    }

    it('spreads cards across high / medium / low / unclassified by exam weight', () => {
        seedTopicedExam(h.db);
        insertCardU2(h.db, 'h'); classifyTopic(h.db, 'h', 20, 200, 0.9); // 40*0.5*0.9/20*100 = 90 → high
        insertCardU2(h.db, 'm'); classifyTopic(h.db, 'm', 22, 202, 0.9); // 20*0.5*0.9/20*100 = 45 → medium
        insertCardU2(h.db, 'l'); classifyTopic(h.db, 'l', 21, 201, 0.9); //  5*0.2*0.9/20*100 = 4.5 → low
        insertCardU2(h.db, 'u'); classifyTopic(h.db, 'u', 20, 200, 0.3); // low confidence → unclassified

        const r = computePlan('u2', 'step-x')!;
        expect(r.unseenTotal).toBe(4);
        expect(r.unseenHighYield).toBe(1);
        expect(r.unseenMediumYield).toBe(1);
        expect(r.unseenLowYield).toBe(1);
        expect(r.unseenUnclassified).toBe(1);
    });
});

describe('getActivePlan — live view recompute', () => {
    it('returns a live view reflecting the CURRENT unseen pool, not the frozen snapshot', () => {
        seedTopiclessExam(h.db);
        insertNewCard(h.db, 'c1'); classify(h.db, 'c1', 10);
        insertNewCard(h.db, 'c2'); classify(h.db, 'c2', 11);
        insertNewCard(h.db, 'c3');

        // A plan whose FROZEN snapshot is deliberately stale (claims 999 unseen).
        const staleSnapshot = JSON.stringify({ unseenTotal: 999, availableDays: 1, projectedCoverage: 0.1, systemCoverage: [] });
        h.db.prepare(`INSERT INTO plans (id, user_id, exam_key, name, cards_per_day, suggested_per_day,
                        snapshot, deck_filter, status, activated_at, created_at, updated_at)
                      VALUES ('p1', 'u1', 'im-shelf', 'P', 25, 25, ?, NULL, 'active', ?, ?, ?)`)
            .run(staleSnapshot, TS, TS, TS);

        const active = getActivePlan('u1', 'im-shelf');
        expect(active).not.toBeNull();
        // Frozen record is preserved untouched…
        expect(active!.plan.snapshot.unseenTotal).toBe(999);
        // …while the live view reflects reality (3 unseen cards right now).
        expect(active!.liveView).not.toBeNull();
        expect(active!.liveView!.unseenTotal).toBe(3);
        expect(active!.liveView!.systemCoverage.find(s => s.systemKey === 'cardio')!.totalCards).toBe(1);
    });
});
