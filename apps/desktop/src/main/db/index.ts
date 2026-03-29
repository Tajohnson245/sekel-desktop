import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { MIGRATIONS } from './migrations';
import { STEP1_BLUEPRINT, STEP2CK_BLUEPRINT } from './blueprints';
import { createLogger, consoleTransport } from '@sekel/observability';

const log = createLogger({ module: 'db', transports: [consoleTransport] });

let db: Database.Database;

export function initDatabase(): Database.Database {
    // Close existing connection if reinitializing (e.g. after restore)
    if (db && db.open) {
        db.close();
    }

    const dbPath = path.join(app.getPath('userData'), 'sekel.db');
    db = new Database(dbPath, { timeout: 5000 });

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db);
    seedBlueprints(db);
    return db;
}

export function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

/** Returns the file path of the current database. */
export function getDbPath(): string {
    return path.join(app.getPath('userData'), 'sekel.db');
}

function runMigrations(database: Database.Database): void {
    database.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
    `);

    const row = database.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
    const currentVersion = row.v ?? 0;

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
        const applyMigration = database.transaction(() => {
            database.exec(MIGRATIONS[i]);
            database.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
        });
        applyMigration();
        log.info('Applied migration', { version: i + 1 });
    }
}

// ── Blueprint Auto-Seed ─────────────────────────────────────────────────────
// Seeds exam blueprint data on first run. Idempotent via ON CONFLICT.

function seedBlueprints(database: Database.Database): void {
    const now = new Date().toISOString();

    const selectExam = database.prepare('SELECT id FROM blueprint_exams WHERE exam_key = ?');
    const upsertExam = database.prepare(`
        INSERT INTO blueprint_exams (exam_key, label, source_url, version, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(exam_key) DO UPDATE SET
            label = excluded.label, source_url = excluded.source_url,
            version = excluded.version, updated_at = excluded.updated_at
    `);
    const upsertSystem = database.prepare(`
        INSERT INTO blueprint_systems (exam_id, system_key, label, weight_min, weight_max)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(exam_id, system_key) DO UPDATE SET
            label = excluded.label, weight_min = excluded.weight_min, weight_max = excluded.weight_max
    `);
    const selectSystemId = database.prepare(
        'SELECT id FROM blueprint_systems WHERE exam_id = ? AND system_key = ?'
    );
    const upsertTopic = database.prepare(`
        INSERT INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(system_id, topic_key) DO UPDATE SET
            label = excluded.label, physician_task = excluded.physician_task,
            relative_weight = excluded.relative_weight
    `);

    for (const bp of [STEP1_BLUEPRINT, STEP2CK_BLUEPRINT]) {
        // Check per exam_key so existing Step 1 installs still get Step 2 CK seeded
        const existing = selectExam.get(bp.exam_key) as { id: number } | undefined;
        if (existing) continue;

        const seed = database.transaction(() => {
            upsertExam.run(bp.exam_key, bp.label, bp.source_url ?? null, bp.version ?? null, now);
            const examId = (selectExam.get(bp.exam_key) as { id: number }).id;

            for (const sys of bp.systems) {
                upsertSystem.run(examId, sys.system_key, sys.label, sys.weight_min ?? null, sys.weight_max ?? null);
                const systemId = (selectSystemId.get(examId, sys.system_key) as { id: number }).id;

                for (const topic of sys.topics) {
                    upsertTopic.run(systemId, topic.topic_key, topic.label,
                        topic.physician_task ?? null, topic.relative_weight ?? null);
                }
            }
        });

        seed();
        log.info('Seeded blueprint', { label: bp.label, systems: bp.systems.length });
    }
}
