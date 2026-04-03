#!/usr/bin/env npx tsx
/**
 * seed-blueprints-supabase.ts — Seed USMLE blueprint data into Supabase.
 *
 * Each exam lives in apps/desktop/supabase/blueprints/ as a standalone file
 * named {issuer}-{exam_key}-v{version}.ts. This runner discovers and executes
 * them. Adding a new exam requires only a new file in that directory.
 *
 * Usage:
 *   npx tsx scripts/seed-blueprints-supabase.ts              # seed all exams
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam step1 # seed one exam
 *
 * Required env vars (set in .env or shell):
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *
 * Idempotent — safe to run multiple times. Uses upsert semantics throughout.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// ── Resolve blueprints directory ─────────────────────────────────────────────

const BLUEPRINTS_DIR = path.resolve(
    __dirname,
    '../apps/desktop/supabase/blueprints'
);

// ── CLI arg: --exam <key> ────────────────────────────────────────────────────

function parseExamKey(): string | null {
    const args = process.argv.slice(2);
    const idx = args.indexOf('--exam');
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ── Discover seed files ──────────────────────────────────────────────────────
// Convention: any *.ts file in blueprints/ that does NOT start with _

function discoverFiles(examKey: string | null): string[] {
    const all = fs
        .readdirSync(BLUEPRINTS_DIR)
        .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
        .sort()
        .map((f) => path.join(BLUEPRINTS_DIR, f));

    if (!examKey) return all;

    const match = all.filter((f) => path.basename(f).includes(`-${examKey}-`));
    if (match.length === 0) {
        console.error(`No seed file found for exam key: ${examKey}`);
        console.error(
            `Available files:\n  ${all.map((f) => path.basename(f)).join('\n  ')}`
        );
        process.exit(1);
    }
    return match;
}

// ── Run a single seed file via npx tsx ───────────────────────────────────────

function runFile(filePath: string): void {
    console.log(`\nRunning: ${path.basename(filePath)}`);
    const result = spawnSync('npx', ['tsx', filePath], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env },
    });

    if (result.status !== 0) {
        console.error(`Failed: ${path.basename(filePath)} (exit ${result.status})`);
        process.exit(result.status ?? 1);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
    const examKey = parseExamKey();
    const files = discoverFiles(examKey);

    console.log(`Seeding ${files.length} blueprint file(s) into Supabase...`);

    for (const file of files) {
        runFile(file);
    }

    console.log('\nAll blueprints seeded successfully.');
}

main();
