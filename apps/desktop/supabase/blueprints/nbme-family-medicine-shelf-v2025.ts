/**
 * nbme-family-medicine-shelf-v2025.ts — Seed Family Medicine Modular Subject Exam blueprint into Supabase.
 *
 * Source: NBME Family Medicine Modular Subject Exam Content Outline, Clinical Science.
 * https://www.nbme.org/subject-exams/clinical-science/family-medicine-modular
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam family-medicine-shelf
 *
 * Note: This exam is 100% ambulatory — no Emergency Department or Inpatient site-of-care entries.
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'family-medicine-shelf',
    label:             'Family Medicine Modular Subject Exam',
    issuer:            'NBME',
    category:          'Clinical Science',
    level:             '3rd Year Clerkship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/clinical-science/family-medicine-modular',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient',                                   weight_min: 5,  weight_max: 10 },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                                                            weight_min: 1,  weight_max: 5  },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                                                          weight_min: 1,  weight_max: 5  },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                                                        weight_min: 5,  weight_max: 10 },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                                                         weight_min: 1,  weight_max: 5  },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                                                              weight_min: 3,  weight_max: 7  },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                                                  weight_min: 5,  weight_max: 10 },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                                                    weight_min: 5,  weight_max: 10 },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                                                                 weight_min: 5,  weight_max: 10 },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                                                  weight_min: 1,  weight_max: 5  },
        { system_key: 'pregnancy-childbirth',          label: 'Pregnancy, Childbirth, & the Puerperium',                                                                                weight_min: 1,  weight_max: 5  },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                                                                                    weight_min: 1,  weight_max: 5  },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                                                                weight_min: 1,  weight_max: 5  },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                                                         weight_min: 5,  weight_max: 10 },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                                                       weight_min: 1,  weight_max: 5  },
        { system_key: 'biostatistics-epidemiology',    label: 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature',                              weight_min: 1,  weight_max: 5  },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Communication, Medical Ethics and Jurisprudence, and Systems-Based Practice and Patient Safety', weight_min: 5, weight_max: 10 },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
