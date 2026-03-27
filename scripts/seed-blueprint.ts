#!/usr/bin/env npx tsx
/**
 * seed-blueprint.ts — Seed the local SQLite database with exam blueprint data.
 *
 * Usage:
 *   npx tsx scripts/seed-blueprint.ts              # defaults to step1
 *   npx tsx scripts/seed-blueprint.ts --exam step1
 *
 * Idempotent — safe to run multiple times (uses ON CONFLICT ... DO UPDATE).
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types matching the JSON schema ──────────────────────────────────────────

interface BlueprintTopic {
    topic_key: string;
    label: string;
    physician_task: string | null;
    relative_weight: number | null;
}

interface BlueprintSystem {
    system_key: string;
    label: string;
    weight_min: number | null;
    weight_max: number | null;
    topics: BlueprintTopic[];
}

interface BlueprintFile {
    exam_key: string;
    label: string;
    source_url: string | null;
    version: string | null;
    systems: BlueprintSystem[];
}

// ── Resolve Electron userData path without Electron ─────────────────────────
// In production the folder is "Sekel" (from forge packagerConfig.name).
// In dev mode Electron derives it from package.json name → "@sekel/desktop".
// We check both paths and prefer whichever exists.

function getUserDataPath(): string {
    const platform = os.platform();

    let base: string;
    if (platform === 'win32') {
        base = process.env.APPDATA!;
    } else if (platform === 'darwin') {
        base = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
        base = path.join(os.homedir(), '.config');
    }

    // Dev mode path (scoped package name)
    const devPath = path.join(base, '@sekel', 'desktop');
    // Production path (forge packagerConfig.name)
    const prodPath = path.join(base, 'Sekel');

    if (fs.existsSync(path.join(devPath, 'sekel.db'))) return devPath;
    if (fs.existsSync(path.join(prodPath, 'sekel.db'))) return prodPath;

    // Fallback: return prod path (will show "not found" error with correct hint)
    return prodPath;
}

// ── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs(): string {
    const args = process.argv.slice(2);
    const examIdx = args.indexOf('--exam');
    if (examIdx !== -1 && args[examIdx + 1]) {
        return args[examIdx + 1];
    }
    return 'step1';
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
    const examKey = parseArgs();
    const jsonPath = path.resolve(__dirname, 'blueprints', `${examKey}.json`);

    if (!fs.existsSync(jsonPath)) {
        console.error(`Blueprint file not found: ${jsonPath}`);
        process.exit(1);
    }

    const blueprint: BlueprintFile = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const dbPath = path.join(getUserDataPath(), 'sekel.db');
    if (!fs.existsSync(dbPath)) {
        console.error(`Database not found: ${dbPath}`);
        console.error('Run the desktop app at least once to create the database.');
        process.exit(1);
    }

    console.log(`Opening database: ${dbPath}`);
    const db = new Database(dbPath, { timeout: 5000 });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const now = new Date().toISOString();

    // ── Prepared statements ─────────────────────────────────────────────

    const upsertExam = db.prepare(`
        INSERT INTO blueprint_exams (exam_key, label, source_url, version, updated_at)
        VALUES (@exam_key, @label, @source_url, @version, @updated_at)
        ON CONFLICT(exam_key) DO UPDATE SET
            label      = excluded.label,
            source_url = excluded.source_url,
            version    = excluded.version,
            updated_at = excluded.updated_at
    `);

    const selectExamId = db.prepare(`SELECT id FROM blueprint_exams WHERE exam_key = @exam_key`);

    const upsertSystem = db.prepare(`
        INSERT INTO blueprint_systems (exam_id, system_key, label, weight_min, weight_max)
        VALUES (@exam_id, @system_key, @label, @weight_min, @weight_max)
        ON CONFLICT(exam_id, system_key) DO UPDATE SET
            label      = excluded.label,
            weight_min = excluded.weight_min,
            weight_max = excluded.weight_max
    `);

    const selectSystemId = db.prepare(
        `SELECT id FROM blueprint_systems WHERE exam_id = @exam_id AND system_key = @system_key`
    );

    const upsertTopic = db.prepare(`
        INSERT INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        VALUES (@system_id, @topic_key, @label, @physician_task, @relative_weight)
        ON CONFLICT(system_id, topic_key) DO UPDATE SET
            label           = excluded.label,
            physician_task  = excluded.physician_task,
            relative_weight = excluded.relative_weight
    `);

    // ── Transaction ─────────────────────────────────────────────────────

    const seed = db.transaction(() => {
        upsertExam.run({
            exam_key: blueprint.exam_key,
            label: blueprint.label,
            source_url: blueprint.source_url ?? null,
            version: blueprint.version ?? null,
            updated_at: now,
        });
        const examRow = selectExamId.get({ exam_key: blueprint.exam_key }) as { id: number };
        const examId = examRow.id;

        console.log(`\nExam: ${blueprint.label} (id=${examId})`);

        let totalTopics = 0;

        for (const sys of blueprint.systems) {
            upsertSystem.run({
                exam_id: examId,
                system_key: sys.system_key,
                label: sys.label,
                weight_min: sys.weight_min ?? null,
                weight_max: sys.weight_max ?? null,
            });
            const sysRow = selectSystemId.get({ exam_id: examId, system_key: sys.system_key }) as { id: number };
            const systemId = sysRow.id;

            let topicCount = 0;
            for (const topic of sys.topics) {
                upsertTopic.run({
                    system_id: systemId,
                    topic_key: topic.topic_key,
                    label: topic.label,
                    physician_task: topic.physician_task ?? null,
                    relative_weight: topic.relative_weight ?? null,
                });
                topicCount++;
            }

            console.log(`  ${sys.label}: ${topicCount} topics (${sys.weight_min}–${sys.weight_max}%)`);
            totalTopics += topicCount;
        }

        console.log(`\nDone. ${blueprint.systems.length} systems, ${totalTopics} topics seeded.`);
    });

    seed();
    db.close();
}

main();
