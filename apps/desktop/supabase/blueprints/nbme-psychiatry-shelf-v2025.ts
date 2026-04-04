/**
 * nbme-psychiatry-shelf-v2025.ts — Seed Psychiatry Subject Exam blueprint into Supabase.
 *
 * Source: NBME Psychiatry Subject Exam Content Outline, Clinical Science.
 * https://www.nbme.org/subject-exams/clinical-science/psychiatry
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam psychiatry-shelf
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'psychiatry-shelf',
    label:             'Psychiatry Subject Exam',
    issuer:            'NBME',
    category:          'Clinical Science',
    level:             '3rd Year Clerkship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/clinical-science/psychiatry',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 5,  weight_max: 10 },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 65, weight_max: 70 },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 10, weight_max: 15 },
        { system_key: 'multisystem',                   label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 5,  weight_max: 10 },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Communication and Medical Ethics and Jurisprudence',          weight_min: 1,  weight_max: 5  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
