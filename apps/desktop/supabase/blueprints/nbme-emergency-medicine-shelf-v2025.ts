/**
 * nbme-emergency-medicine-shelf-v2025.ts — Seed Emergency Medicine Subject Exam blueprint into Supabase.
 *
 * Source: NBME Emergency Medicine Subject Exam Content Outline, Advanced Clinical Science.
 * https://www.nbme.org/subject-exams/advanced-clinical/emergency-medicine
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam emergency-medicine-shelf
 *
 * Note: This exam has no Site of Care dimension — only systems are seeded.
 *
 * Cross-cutting content note (not representable as system rows — no metadata column in schema):
 *   - Resuscitation/trauma: 10–15% of items span across organ systems
 *   - Environmental/toxicologic disorders: 10–15% of items span across organ systems
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'emergency-medicine-shelf',
    label:             'Emergency Medicine Subject Exam',
    issuer:            'NBME',
    category:          'Advanced Clinical Science',
    level:             '4th Year / Sub-Internship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/advanced-clinical/emergency-medicine',
    blueprint_version: '2025',
    systems: [
        { system_key: 'immune-system',                 label: 'Immune System',                                          weight_min: 1,  weight_max: 5  },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                        weight_min: 1,  weight_max: 5  },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                      weight_min: 1,  weight_max: 5  },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                       weight_min: 5,  weight_max: 10 },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                            weight_min: 1,  weight_max: 5  },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                weight_min: 5,  weight_max: 10 },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                  weight_min: 10, weight_max: 15 },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                     weight_min: 10, weight_max: 15 },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                               weight_min: 10, weight_max: 15 },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                weight_min: 1,  weight_max: 5  },
        { system_key: 'pregnancy-childbirth',          label: 'Pregnancy, Childbirth, & the Puerperium',              weight_min: 1,  weight_max: 5  },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                  weight_min: 1,  weight_max: 5  },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                              weight_min: 1,  weight_max: 5  },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                     weight_min: 10, weight_max: 15 },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Medical Ethics and Jurisprudence', weight_min: 1, weight_max: 5 },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
