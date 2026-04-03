/**
 * usmle-step2ck-v2025.ts — Seed USMLE Step 2 CK blueprint into Supabase.
 *
 * Source: USMLE Step 2 CK Content Outline (2025), NBME.
 * https://www.usmle.org/prepare-your-exam/step-2-ck-materials/step-2-ck-content-outline
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam step2ck
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'step2ck',
    label:             'USMLE Step 2 CK',
    issuer:            'USMLE',
    category:          'Medical Licensing',
    level:             '2',
    alias:             'Step 2 CK',
    source_url:        'https://www.usmle.org/prepare-your-exam/step-2-ck-materials/step-2-ck-content-outline',
    blueprint_version: '2025',
    systems: [
        { system_key: 'human-development',          label: 'Human Development',                                                        weight_min: 2,  weight_max: 4  },
        { system_key: 'immune-system',              label: 'Immune System',                                                            weight_min: 3,  weight_max: 5  },
        { system_key: 'blood-lymphoreticular',      label: 'Blood & Lymphoreticular System',                                          weight_min: 3,  weight_max: 6  },
        { system_key: 'behavioral-health',          label: 'Behavioral Health',                                                        weight_min: 5,  weight_max: 10 },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                      weight_min: 5,  weight_max: 10 },
        { system_key: 'musculoskeletal-skin',       label: 'Musculoskeletal System, Skin & Subcutaneous Tissue',                      weight_min: 6,  weight_max: 12 },
        { system_key: 'cardiovascular',             label: 'Cardiovascular System',                                                    weight_min: 6,  weight_max: 12 },
        { system_key: 'respiratory',                label: 'Respiratory System',                                                       weight_min: 5,  weight_max: 10 },
        { system_key: 'gastrointestinal',           label: 'Gastrointestinal System',                                                  weight_min: 5,  weight_max: 10 },
        { system_key: 'renal-reproductive',         label: 'Renal & Urinary System & Reproductive Systems',                           weight_min: 7,  weight_max: 13 },
        { system_key: 'pregnancy-childbirth',       label: 'Pregnancy, Childbirth & the Puerperium',                                  weight_min: 3,  weight_max: 7  },
        { system_key: 'endocrine',                  label: 'Endocrine System',                                                         weight_min: 3,  weight_max: 7  },
        { system_key: 'multisystem',                label: 'Multisystem Processes & Disorders',                                        weight_min: 4,  weight_max: 8  },
        { system_key: 'biostatistics-epidemiology', label: 'Biostatistics & Epidemiology/Population Health',                          weight_min: 3,  weight_max: 5  },
        { system_key: 'social-sciences-ethics',     label: 'Social Sciences, Legal/Ethical Issues & Systems-based Practice',          weight_min: 10, weight_max: 15 },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
