/**
 * _seed.ts — Shared upsert utility for Supabase blueprint seeding.
 *
 * All exam seed files call upsertBlueprint() from this module.
 * No upsert logic is duplicated across exam files.
 *
 * Requires env vars:
 *   SUPABASE_URL             — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for seeding)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlueprintSystemSeed {
    system_key: string;
    label: string;
    weight_min: number | null;
    weight_max: number | null;
}

export interface BlueprintSeedData {
    exam_key: string;
    /** Display name, e.g. "USMLE Step 1" */
    label: string;
    /** Organisation that owns the exam, e.g. "USMLE" */
    issuer: string;
    /** Broad grouping, e.g. "Medical Licensing" */
    category: string;
    /** Exam level as a string, e.g. "1", "2", "3" — null if not applicable */
    level: string | null;
    /** Short human-readable name, e.g. "Step 1" */
    alias: string | null;
    source_url: string | null;
    blueprint_version: string | null;
    systems: BlueprintSystemSeed[];
}

// ── Supabase client ───────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.'
        );
    }
    return createClient(url, key);
}

// ── Core upsert logic ─────────────────────────────────────────────────────────

export async function upsertBlueprint(data: BlueprintSeedData): Promise<void> {
    const supabase = getClient();
    const now = new Date().toISOString();

    console.log(`\nSeeding: ${data.label} (${data.exam_key})`);

    // 1. Upsert the exam row ---------------------------------------------------
    const { data: examRow, error: examErr } = await supabase
        .from('blueprint_exams')
        .upsert(
            {
                exam_key:         data.exam_key,
                name:             data.label,
                issuer:           data.issuer,
                category:         data.category,
                level:            data.level,
                alias:            data.alias,
                source_url:       data.source_url,
                blueprint_version: data.blueprint_version,
                updated_at:       now,
            },
            { onConflict: 'exam_key' }
        )
        .select('id')
        .single();

    if (examErr) throw new Error(`blueprint_exams upsert failed: ${examErr.message}`);
    const examId: string = examRow.id;
    console.log(`  exam id: ${examId}`);

    // 2. Upsert systems --------------------------------------------------------
    const systemRows = data.systems.map((s) => ({
        exam_id:    examId,
        system_key: s.system_key,
        label:      s.label,
        weight_min: s.weight_min,
        weight_max: s.weight_max,
    }));

    const { error: sysErr } = await supabase
        .from('blueprint_systems')
        .upsert(systemRows, { onConflict: 'exam_id,system_key' });

    if (sysErr) throw new Error(`blueprint_systems upsert failed: ${sysErr.message}`);

    for (const s of data.systems) {
        console.log(`  ${s.label}: ${s.weight_min}–${s.weight_max}%`);
    }

    console.log(`  Done. ${data.systems.length} systems upserted.`);
}
