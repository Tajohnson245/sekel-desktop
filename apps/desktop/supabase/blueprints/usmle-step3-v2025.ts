/**
 * usmle-step3-v2025.ts — Seed USMLE Step 3 blueprint into Supabase.
 *
 * Source: USMLE Step 3 Content Outline (2025), NBME.
 * https://www.usmle.org/prepare-your-exam/step-3-materials/step-3-content-outline
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam step3
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'step3',
    label:             'USMLE Step 3',
    issuer:            'USMLE',
    category:          'Medical Licensing',
    level:             '3',
    alias:             'Step 3',
    source_url:        'https://www.usmle.org/prepare-your-exam/step-3-materials/step-3-content-outline',
    blueprint_version: '2025',
    systems: [
        { system_key: 'human-development',             label: 'Human Development',                                                              weight_min: 1,  weight_max: 3  },
        { system_key: 'immune-blood-multisystem',      label: 'Immune System, Blood & Lymphoreticular, and Multisystem Processes',              weight_min: 6,  weight_max: 8  },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                              weight_min: 4,  weight_max: 6  },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                               weight_min: 8,  weight_max: 10 },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                     weight_min: 4,  weight_max: 6  },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                         weight_min: 5,  weight_max: 7  },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                          weight_min: 9,  weight_max: 11 },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                             weight_min: 8,  weight_max: 10 },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                        weight_min: 6,  weight_max: 8  },
        { system_key: 'renal-male-reproductive',       label: 'Renal/Urinary & Male Reproductive Systems',                                     weight_min: 4,  weight_max: 6  },
        { system_key: 'pregnancy-female-reproductive', label: 'Pregnancy, Childbirth & Female Reproductive System & Breast',                   weight_min: 7,  weight_max: 9  },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                               weight_min: 5,  weight_max: 7  },
        { system_key: 'biostatistics-epidemiology',    label: 'Biostatistics, Epidemiology/Population Health & Medical Literature',            weight_min: 11, weight_max: 13 },
        { system_key: 'social-sciences-ethics',        label: 'Social Sciences, Communication, Ethics & Patient Safety',                       weight_min: 7,  weight_max: 9  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
