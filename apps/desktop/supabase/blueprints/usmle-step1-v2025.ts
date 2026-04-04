/**
 * usmle-step1-v2025.ts — Seed USMLE Step 1 blueprint into Supabase.
 *
 * Source: USMLE Step 1 Content Outline (2025), NBME.
 * https://www.usmle.org/prepare-your-exam/step-1-materials/step-1-content-outline
 *
 * Run via:
 *   npx tsx scripts/seed-blueprints-supabase.ts --exam step1
 */

import { upsertBlueprint } from './_seed';

upsertBlueprint({
    exam_key:          'step1',
    label:             'USMLE Step 1',
    issuer:            'USMLE',
    category:          'Medical Licensing',
    level:             '1',
    alias:             'Step 1',
    source_url:        'https://www.usmle.org/prepare-your-exam/step-1-materials/step-1-content-outline',
    blueprint_version: '2025',
    systems: [
        { system_key: 'human-development',                    label: 'Human Development & Aging',                              weight_min: 1,  weight_max: 3  },
        { system_key: 'blood-lymphoreticular-immune',         label: 'Blood & Lymphoreticular/Immune Systems',                weight_min: 9,  weight_max: 13 },
        { system_key: 'behavioral-health-nervous-special-senses', label: 'Behavioral Health & Nervous Systems/Special Senses', weight_min: 10, weight_max: 14 },
        { system_key: 'musculoskeletal-skin-subcutaneous',    label: 'Musculoskeletal, Skin & Subcutaneous Tissue',           weight_min: 8,  weight_max: 12 },
        { system_key: 'cardiovascular',                       label: 'Cardiovascular System',                                 weight_min: 7,  weight_max: 11 },
        { system_key: 'respiratory-renal-urinary',            label: 'Respiratory & Renal/Urinary Systems',                  weight_min: 11, weight_max: 15 },
        { system_key: 'gastrointestinal',                     label: 'Gastrointestinal System',                               weight_min: 6,  weight_max: 10 },
        { system_key: 'reproductive-endocrine',               label: 'Reproductive & Endocrine Systems',                      weight_min: 12, weight_max: 16 },
        { system_key: 'multisystem',                          label: 'Multisystem Processes & Disorders',                     weight_min: 8,  weight_max: 12 },
        { system_key: 'biostatistics-epidemiology',           label: 'Biostatistics & Epidemiology/Population Health',        weight_min: 4,  weight_max: 6  },
        { system_key: 'social-sciences',                      label: 'Social Sciences',                                       weight_min: 6,  weight_max: 9  },
    ],
}).catch((err) => {
    console.error(err.message);
    process.exit(1);
});
