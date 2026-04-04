/**
 * nbme-pediatrics-shelf-v2025.ts — Seed Pediatrics Subject Exam blueprint into Supabase.
 *
 * Source: NBME Pediatrics Subject Exam Content Outline, Clinical Science.
 * https://www.nbme.org/subject-exams/clinical-science/pediatrics
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam pediatrics-shelf
 *
 * Note: This exam has no Patient Age dimension — only systems are seeded.
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'pediatrics-shelf',
    label:             'Pediatrics Subject Exam',
    issuer:            'NBME',
    category:          'Clinical Science',
    level:             '3rd Year Clerkship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/clinical-science/pediatrics',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 3,  weight_max: 7  },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                          weight_min: 3,  weight_max: 7  },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                        weight_min: 3,  weight_max: 7  },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 1,  weight_max: 5  },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                            weight_min: 1,  weight_max: 5  },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                weight_min: 3,  weight_max: 7  },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                  weight_min: 5,  weight_max: 10 },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                     weight_min: 5,  weight_max: 10 },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                               weight_min: 8,  weight_max: 12 },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                weight_min: 5,  weight_max: 10 },
        { system_key: 'newborn-congenital',            label: 'Disorders of the Newborn & Congenital Disorders',                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'female-reproductive',           label: 'Female Reproductive System',                                                            weight_min: 3,  weight_max: 7  },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                              weight_min: 1,  weight_max: 5  },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                     weight_min: 10, weight_max: 15 },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Consent and Physician-Patient Relationship',                 weight_min: 1,  weight_max: 5  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
