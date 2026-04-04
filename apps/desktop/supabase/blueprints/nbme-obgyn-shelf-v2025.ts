/**
 * nbme-obgyn-shelf-v2025.ts — Seed Obstetrics & Gynecology Subject Exam blueprint into Supabase.
 *
 * Source: NBME Obstetrics & Gynecology Subject Exam Content Outline, Clinical Science.
 * https://www.nbme.org/subject-exams/clinical-science/obstetrics-and-gynecology
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam obgyn-shelf
 *
 * Note: This exam has no Patient Age dimension — only systems are seeded.
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'obgyn-shelf',
    label:             'Obstetrics & Gynecology Subject Exam',
    issuer:            'NBME',
    category:          'Clinical Science',
    level:             '3rd Year Clerkship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/clinical-science/obstetrics-and-gynecology',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',        label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 1,  weight_max: 5  },
        { system_key: 'pregnancy-childbirth',      label: 'Pregnancy, Childbirth, & the Puerperium',                                               weight_min: 40, weight_max: 45 },
        { system_key: 'female-reproductive-breast', label: 'Female Reproductive System & Breast',                                                  weight_min: 40, weight_max: 45 },
        { system_key: 'endocrine',                 label: 'Endocrine System',                                                                       weight_min: 1,  weight_max: 5  },
        { system_key: 'multisystem',               label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 5,  weight_max: 10 },
        { system_key: 'social-sciences',           label: 'Social Sciences, Including Communication, Medical Ethics and Jurisprudence',             weight_min: 1,  weight_max: 5  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
