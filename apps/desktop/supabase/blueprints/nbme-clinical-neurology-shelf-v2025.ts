/**
 * nbme-clinical-neurology-shelf-v2025.ts — Seed Clinical Neurology Subject Exam blueprint into Supabase.
 *
 * Source: NBME Clinical Neurology Subject Exam Content Outline, Clinical Science.
 * https://www.nbme.org/subject-exams/clinical-science/clinical-neurology
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam clinical-neurology-shelf
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'clinical-neurology-shelf',
    label:             'Clinical Neurology Subject Exam',
    issuer:            'NBME',
    category:          'Clinical Science',
    level:             '3rd Year Clerkship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/clinical-science/clinical-neurology',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 1,  weight_max: 5  },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 3,  weight_max: 7  },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 60, weight_max: 65 },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                weight_min: 10, weight_max: 15 },
        { system_key: 'multisystem',                   label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 15, weight_max: 20 },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Death and Dying and Palliative Care',                        weight_min: 1,  weight_max: 5  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
