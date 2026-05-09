/**
 * nabp-naplex-v2025-05.ts — Seed NAPLEX blueprint into Supabase.
 *
 * Source: NAPLEX Content Outline (May 2025), NABP.
 * https://nabp.pharmacy/wp-content/uploads/NAPLEX-Content-Outline.pdf
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam naplex
 *
 * Hierarchy note: NAPLEX has 3 levels (domain / subdomain letter / sub-subdomain
 * number). The Supabase blueprint_systems table is flat, so only the 5 domains
 * are seeded here as systems with their explicit single-percent weights. The
 * sub-domain and sub-subdomain detail is preserved in the local SQLite blueprint
 * (apps/desktop/src/main/db/blueprints.ts → NAPLEX_BLUEPRINT) via topic_keys
 * like 'A.1' or 'B.2'. Yield scoring runs against SQLite, so this asymmetry
 * does not affect classification accuracy.
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'naplex',
    label:             'NAPLEX',
    issuer:            'NABP',
    category:          'Pharmacist Licensure',
    level:             null,
    alias:             'NAPLEX',
    source_url:        'https://nabp.pharmacy/wp-content/uploads/NAPLEX-Content-Outline.pdf',
    blueprint_version: '2025-05',
    systems: [
        { system_key: '1', label: 'Foundational Knowledge for Pharmacy Practice',                                                                  weight_min: 25, weight_max: 25 },
        { system_key: '2', label: 'Medication Use Process (Prescribing, Transcribing and Documenting, Dispensing, Administering, and Monitoring)', weight_min: 25, weight_max: 25 },
        { system_key: '3', label: 'Person-Centered Assessment and Treatment Planning',                                                             weight_min: 40, weight_max: 40 },
        { system_key: '4', label: 'Professional Practice',                                                                                         weight_min:  5, weight_max:  5 },
        { system_key: '5', label: 'Pharmacy Management and Leadership',                                                                            weight_min:  5, weight_max:  5 },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
