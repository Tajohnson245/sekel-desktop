/**
 * Embedded exam blueprint data for auto-seeding.
 * Source: USMLE Step 1 Content Outline (2025), NBME.
 * System taxonomy aligns with the official 11-category outline.
 */

interface BlueprintTopic {
    topic_key: string;
    label: string;
    physician_task: string | null;
    relative_weight: number | null;
}

interface BlueprintSystem {
    system_key: string;
    label: string;
    weight_min: number | null;
    weight_max: number | null;
    topics: BlueprintTopic[];
}

export interface BlueprintFile {
    exam_key: string;
    label: string;
    source_url: string | null;
    version: string | null;
    systems: BlueprintSystem[];
}

export const STEP1_BLUEPRINT: BlueprintFile = {
    exam_key: 'step1',
    label: 'USMLE Step 1',
    source_url: 'https://www.usmle.org/prepare-your-exam/step-1-materials/step-1-content-outline',
    version: '2025',
    systems: [
        {
            system_key: 'human-development', label: 'Human Development & Aging', weight_min: 1, weight_max: 3,
            topics: [
                { topic_key: 'prenatal-development', label: 'Prenatal Development & Congenital Defects', physician_task: 'foundational-science', relative_weight: 0.35 },
                { topic_key: 'growth-development', label: 'Postnatal Growth & Development', physician_task: 'foundational-science', relative_weight: 0.35 },
                { topic_key: 'development-aging', label: 'Aging & Geriatrics', physician_task: 'health-maintenance', relative_weight: 0.30 },
            ],
        },
        {
            system_key: 'blood-lymphoreticular-immune', label: 'Blood & Lymphoreticular/Immune Systems', weight_min: 9, weight_max: 13,
            topics: [
                { topic_key: 'hematology-physiology', label: 'Hematopoiesis & Blood Cell Physiology', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'anemias', label: 'Anemias & Hemoglobinopathies', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'coagulation-disorders', label: 'Coagulation & Bleeding Disorders', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'leukemia-lymphoma', label: 'Leukemia & Lymphoma', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'immunology', label: 'Immunology & Hypersensitivity', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'heme-pharmacology', label: 'Anticoagulants & Heme Pharmacology', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'behavioral-health-nervous-special-senses', label: 'Behavioral Health & Nervous Systems/Special Senses', weight_min: 10, weight_max: 14,
            topics: [
                { topic_key: 'neuroanatomy', label: 'Neuroanatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'neurophysiology', label: 'Neurophysiology & Neurotransmitters', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'cns-pathology', label: 'CNS Pathology & Neoplasms', physician_task: 'diagnosis', relative_weight: 0.12 },
                { topic_key: 'peripheral-neuro', label: 'Peripheral Neuropathy & Demyelination', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'neuro-pharmacology', label: 'Neuropharmacology', physician_task: 'management', relative_weight: 0.10 },
                { topic_key: 'ophthalmology-ent', label: 'Ophthalmology & ENT', physician_task: 'diagnosis', relative_weight: 0.07 },
                { topic_key: 'cerebrovascular-disease', label: 'Cerebrovascular Disease', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'behavioral-science', label: 'Behavioral Science & Psychiatry', physician_task: 'diagnosis', relative_weight: 0.17 },
                { topic_key: 'substance-use', label: 'Substance Use & Addiction', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'psychopharmacology', label: 'Psychopharmacology', physician_task: 'management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'musculoskeletal-skin-subcutaneous', label: 'Musculoskeletal, Skin & Subcutaneous Tissue', weight_min: 8, weight_max: 12,
            topics: [
                { topic_key: 'msk-anatomy', label: 'MSK Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'bone-joint-pathology', label: 'Bone & Joint Pathology', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'dermatology', label: 'Dermatology & Skin Pathology', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'autoimmune-connective', label: 'Autoimmune & Connective Tissue Disease', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'msk-pharmacology', label: 'MSK & Rheumatic Pharmacology', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'soft-tissue-neoplasms', label: 'Soft Tissue Neoplasms', physician_task: 'diagnosis', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'cardiovascular', label: 'Cardiovascular System', weight_min: 7, weight_max: 11,
            topics: [
                { topic_key: 'cardiac-anatomy-embryology', label: 'Cardiac Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'cardiac-physiology', label: 'Cardiac Physiology & Hemodynamics', physician_task: 'foundational-science', relative_weight: 0.20 },
                { topic_key: 'cardiac-pathology', label: 'Cardiac Pathology', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'vascular-pathology', label: 'Vascular Pathology', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'cardiac-pharmacology', label: 'Cardiac Pharmacology', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'ecg-interpretation', label: 'ECG Interpretation & Diagnostics', physician_task: 'diagnosis', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'respiratory-renal-urinary', label: 'Respiratory & Renal/Urinary Systems', weight_min: 11, weight_max: 15,
            topics: [
                { topic_key: 'pulmonary-anatomy-embryology', label: 'Pulmonary Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'pulmonary-physiology', label: 'Pulmonary Physiology & Gas Exchange', physician_task: 'foundational-science', relative_weight: 0.10 },
                { topic_key: 'obstructive-lung-disease', label: 'Obstructive Lung Disease', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'restrictive-lung-disease', label: 'Restrictive Lung Disease', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'pulmonary-pharmacology', label: 'Pulmonary Pharmacology', physician_task: 'management', relative_weight: 0.08 },
                { topic_key: 'pulmonary-infections', label: 'Pulmonary Infections & Neoplasms', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'renal-anatomy-embryology', label: 'Renal Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'renal-physiology', label: 'Renal Physiology & Acid-Base', physician_task: 'foundational-science', relative_weight: 0.12 },
                { topic_key: 'glomerular-disease', label: 'Glomerular Disease', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'tubular-interstitial-disease', label: 'Tubular & Interstitial Disease', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'renal-pharmacology', label: 'Diuretics & Renal Pharmacology', physician_task: 'management', relative_weight: 0.08 },
                { topic_key: 'electrolyte-disorders', label: 'Electrolyte Disorders', physician_task: 'diagnosis', relative_weight: 0.02 },
            ],
        },
        {
            system_key: 'gastrointestinal', label: 'Gastrointestinal System', weight_min: 6, weight_max: 10,
            topics: [
                { topic_key: 'gi-anatomy-embryology', label: 'GI Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'gi-physiology', label: 'GI Physiology & Nutrition', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'hepatobiliary-disease', label: 'Hepatobiliary Disease', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'gi-pathology', label: 'GI Pathology & Neoplasms', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'gi-pharmacology', label: 'GI Pharmacology', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'pancreatic-disease', label: 'Pancreatic Disease', physician_task: 'diagnosis', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'reproductive-endocrine', label: 'Reproductive & Endocrine Systems', weight_min: 12, weight_max: 16,
            topics: [
                { topic_key: 'reproductive-anatomy-embryology', label: 'Reproductive Anatomy & Embryology', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'reproductive-physiology', label: 'Reproductive Physiology & Hormones', physician_task: 'foundational-science', relative_weight: 0.08 },
                { topic_key: 'obstetric-pathology', label: 'Obstetric Pathology & Complications', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'gynecologic-pathology', label: 'Gynecologic Pathology & Neoplasms', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'male-reproductive', label: 'Male Reproductive Pathology', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'reproductive-pharmacology', label: 'Reproductive Pharmacology', physician_task: 'management', relative_weight: 0.08 },
                { topic_key: 'endocrine-physiology', label: 'Endocrine Physiology & Signaling', physician_task: 'foundational-science', relative_weight: 0.12 },
                { topic_key: 'thyroid-parathyroid', label: 'Thyroid & Parathyroid Disorders', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'adrenal-disorders', label: 'Adrenal Disorders', physician_task: 'diagnosis', relative_weight: 0.08 },
                { topic_key: 'diabetes-metabolic', label: 'Diabetes & Metabolic Syndrome', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'pituitary-hypothalamic', label: 'Pituitary & Hypothalamic Disorders', physician_task: 'diagnosis', relative_weight: 0.05 },
                { topic_key: 'endocrine-pharmacology', label: 'Endocrine Pharmacology', physician_task: 'management', relative_weight: 0.03 },
            ],
        },
        {
            system_key: 'multisystem', label: 'Multisystem Processes & Disorders', weight_min: 8, weight_max: 12,
            topics: [
                { topic_key: 'biochemistry-molecular', label: 'Biochemistry & Molecular Biology', physician_task: 'foundational-science', relative_weight: 0.20 },
                { topic_key: 'cell-biology', label: 'Cell Biology & Histology', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'microbiology', label: 'Microbiology & Infectious Disease', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'general-pharmacology', label: 'General Pharmacology Principles', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'general-pathology', label: 'General Pathology & Inflammation', physician_task: 'foundational-science', relative_weight: 0.15 },
                { topic_key: 'genetics-molecular', label: 'Genetics & Molecular Mechanisms', physician_task: 'foundational-science', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'biostatistics-epidemiology', label: 'Biostatistics & Epidemiology/Population Health', weight_min: 4, weight_max: 6,
            topics: [
                { topic_key: 'biostatistics', label: 'Biostatistics & Study Design', physician_task: 'foundational-science', relative_weight: 0.30 },
                { topic_key: 'epidemiology', label: 'Epidemiology & Disease Prevention', physician_task: 'health-maintenance', relative_weight: 0.25 },
                { topic_key: 'nutrition', label: 'Nutrition & Vitamins', physician_task: 'health-maintenance', relative_weight: 0.20 },
                { topic_key: 'population-health', label: 'Population Health & Disparities', physician_task: 'health-maintenance', relative_weight: 0.15 },
                { topic_key: 'evidence-based-medicine', label: 'Evidence-Based Medicine', physician_task: 'foundational-science', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'social-sciences', label: 'Social Sciences', weight_min: 6, weight_max: 9,
            topics: [
                { topic_key: 'ethics-law', label: 'Medical Ethics, Legal, & Patient Safety', physician_task: 'health-maintenance', relative_weight: 0.35 },
                { topic_key: 'communication-systems', label: 'Communication & Interpersonal Skills', physician_task: 'health-maintenance', relative_weight: 0.25 },
                { topic_key: 'healthcare-policy', label: 'Healthcare Policy & Systems', physician_task: 'health-maintenance', relative_weight: 0.25 },
                { topic_key: 'patient-safety', label: 'Patient Safety & Quality Improvement', physician_task: 'health-maintenance', relative_weight: 0.15 },
            ],
        },
    ],
};
