/**
 * nbme-internal-medicine-advanced-shelf-v2025.ts — Seed Internal Medicine Subject Exam blueprint into Supabase.
 *
 * Source: NBME Internal Medicine Subject Exam Content Outline, Advanced Clinical Science.
 * https://www.nbme.org/subject-exams/advanced-clinical/internal-medicine
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam internal-medicine-advanced-shelf
 *
 * IMPORTANT: This is the Advanced Clinical Science (4th Year / Sub-I) exam.
 * It is distinct from the Medicine Subject Exam (3rd Year Clerkship, exam_key: im-shelf).
 *
 * Note: System labels for this exam use older ICD-style category names — do not normalize
 * them to match other exams' system label conventions. Seed exactly as sourced.
 *
 * Note: Physician task labels for this exam differ from 3rd-year shelf conventions:
 *   - Promoting Health and Health Maintenance: 5–10%
 *   - Understanding Mechanisms of Disease: 5–10%
 *   - Establishing a Diagnosis: 35–45%
 *   - Applying Principles of Management: 40–50%
 *
 * Note: No Ambulatory site of care for this exam.
 *   - Emergency Department: 20–30%
 *   - Inpatient: 70–80%
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'internal-medicine-advanced-shelf',
    label:             'Internal Medicine Subject Exam',
    issuer:            'NBME',
    category:          'Advanced Clinical Science',
    level:             '4th Year / Sub-Internship',
    alias:             null,
    source_url:        'https://www.nbme.org/subject-exams/advanced-clinical/internal-medicine',
    blueprint_version: '2025',
    systems: [
        { system_key: 'general-principles',                label: 'General Principles',                                        weight_min: 5,  weight_max: 10 },
        { system_key: 'immunologic-disorders',             label: 'Immunologic Disorders',                                     weight_min: 1,  weight_max: 5  },
        { system_key: 'diseases-of-the-blood',             label: 'Diseases of the Blood',                                     weight_min: 5,  weight_max: 10 },
        { system_key: 'mental-disorders',                  label: 'Mental Disorders',                                          weight_min: 1,  weight_max: 5  },
        { system_key: 'diseases-of-the-nervous-system',    label: 'Diseases of the Nervous System',                           weight_min: 5,  weight_max: 10 },
        { system_key: 'cardiovascular-disorders',          label: 'Cardiovascular Disorders',                                  weight_min: 10, weight_max: 15 },
        { system_key: 'diseases-of-the-respiratory-system', label: 'Diseases of the Respiratory System',                      weight_min: 10, weight_max: 15 },
        { system_key: 'nutritional-digestive-disorders',   label: 'Nutritional and Digestive Disorders',                      weight_min: 10, weight_max: 15 },
        { system_key: 'female-reproductive-system',        label: 'Female Reproductive System',                               weight_min: 1,  weight_max: 5  },
        { system_key: 'renal-urinary-male-reproductive',   label: 'Renal, Urinary, Male Reproductive Systems',               weight_min: 5,  weight_max: 10 },
        { system_key: 'diseases-of-the-skin',              label: 'Diseases of the Skin',                                     weight_min: 1,  weight_max: 5  },
        { system_key: 'musculoskeletal-connective-tissue', label: 'Musculoskeletal and Connective Tissue Disorders',          weight_min: 1,  weight_max: 5  },
        { system_key: 'endocrine-metabolic-disorders',     label: 'Endocrine and Metabolic Disorders',                        weight_min: 8,  weight_max: 12 },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
