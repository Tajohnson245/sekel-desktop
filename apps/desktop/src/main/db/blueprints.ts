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

export const STEP2CK_BLUEPRINT: BlueprintFile = {
    exam_key: 'step2ck',
    label: 'USMLE Step 2 CK',
    source_url: 'https://www.usmle.org/prepare-your-exam/step-2-ck-materials/step-2-ck-content-outline',
    version: '2025',
    systems: [
        {
            system_key: 'human-development', label: 'Human Development', weight_min: 2, weight_max: 4,
            topics: [
                { topic_key: 'pediatric-well-care', label: 'Pediatric Well-Care & Immunizations', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'adolescent-health', label: 'Adolescent Health & Development', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'adult-preventive-care', label: 'Adult Preventive Care & Screening', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'geriatric-care', label: 'Geriatric Care & Elder Health', physician_task: 'management', relative_weight: 0.25 },
            ],
        },
        {
            system_key: 'immune-system', label: 'Immune System', weight_min: 3, weight_max: 5,
            topics: [
                { topic_key: 'hypersensitivity', label: 'Hypersensitivity Reactions & Allergy Management', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'transplant-rejection', label: 'Transplant Rejection & Immunosuppression', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'immunodeficiency', label: 'Immunodeficiency Clinical Presentations', physician_task: 'diagnosis', relative_weight: 0.25 },
                { topic_key: 'hiv-aids-management', label: 'HIV/AIDS Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.25 },
            ],
        },
        {
            system_key: 'blood-lymphoreticular', label: 'Blood & Lymphoreticular System', weight_min: 3, weight_max: 6,
            topics: [
                { topic_key: 'anemia-workup', label: 'Anemia Workup & Management', physician_task: 'mixed-management', relative_weight: 0.30 },
                { topic_key: 'coagulation-clinical', label: 'Coagulation Disorders & Anticoagulation', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'hematologic-malignancy', label: 'Leukemia, Lymphoma & Myeloma Presentation', physician_task: 'diagnosis', relative_weight: 0.25 },
                { topic_key: 'transfusion-medicine', label: 'Transfusion Medicine & Blood Products', physician_task: 'management', relative_weight: 0.20 },
            ],
        },
        {
            system_key: 'behavioral-health', label: 'Behavioral Health', weight_min: 5, weight_max: 10,
            topics: [
                { topic_key: 'mood-disorders', label: 'Mood Disorders Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'psychotic-disorders', label: 'Psychotic Disorders Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'anxiety-disorders', label: 'Anxiety & Related Disorders', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'substance-use-disorders', label: 'Substance Use Disorders & Withdrawal', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'eating-disorders', label: 'Eating Disorders & Management', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'somatic-disorders', label: 'Somatic Symptom & Related Disorders', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'psychopharmacology-clinical', label: 'Clinical Psychopharmacology', physician_task: 'management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses', weight_min: 5, weight_max: 10,
            topics: [
                { topic_key: 'stroke-management', label: 'Stroke Diagnosis & Acute Management', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'seizure-management', label: 'Seizure Disorders & Management', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'headache-evaluation', label: 'Headache Evaluation & Treatment', physician_task: 'mixed-management', relative_weight: 0.10 },
                { topic_key: 'dementia-cognitive', label: 'Dementia & Cognitive Disorders', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'peripheral-neuropathy-clinical', label: 'Peripheral Neuropathy & Neuromuscular Disease', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'eye-disorders', label: 'Eye Disorders & Ophthalmologic Emergencies', physician_task: 'mixed-management', relative_weight: 0.10 },
                { topic_key: 'ear-disorders', label: 'Ear Disorders & Hearing Loss', physician_task: 'mixed-management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'musculoskeletal-skin', label: 'Musculoskeletal System, Skin & Subcutaneous Tissue', weight_min: 6, weight_max: 12,
            topics: [
                { topic_key: 'fracture-management', label: 'Fracture Evaluation & Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'arthritis-clinical', label: 'Arthritis Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'dermatologic-diagnosis', label: 'Dermatologic Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'wound-care', label: 'Wound Care & Soft Tissue Infections', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'orthopedic-emergencies', label: 'Orthopedic Emergencies', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'rheumatologic-disorders', label: 'Rheumatologic & Autoimmune Disorders', physician_task: 'mixed-management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'cardiovascular', label: 'Cardiovascular System', weight_min: 6, weight_max: 12,
            topics: [
                { topic_key: 'acs-management', label: 'Acute Coronary Syndrome Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'heart-failure-management', label: 'Heart Failure Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'dysrhythmia-management', label: 'Dysrhythmia Recognition & Treatment', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'hypertension-management', label: 'Hypertension Evaluation & Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'peripheral-vascular', label: 'Peripheral Vascular Disease', physician_task: 'mixed-management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'respiratory', label: 'Respiratory System', weight_min: 5, weight_max: 10,
            topics: [
                { topic_key: 'pneumonia-management', label: 'Pneumonia Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'obstructive-management', label: 'Asthma & COPD Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'pulmonary-embolism', label: 'Pulmonary Embolism Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'respiratory-failure', label: 'Respiratory Failure & Mechanical Ventilation', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'pleural-disorders', label: 'Pleural Disorders & Thoracic Conditions', physician_task: 'mixed-management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'gastrointestinal', label: 'Gastrointestinal System', weight_min: 5, weight_max: 10,
            topics: [
                { topic_key: 'gi-bleeding', label: 'GI Bleeding Evaluation & Management', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'ibd-management', label: 'IBD Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'liver-cirrhosis', label: 'Liver Disease & Cirrhosis Management', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'pancreatitis-clinical', label: 'Pancreatitis Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'bowel-obstruction', label: 'Bowel Obstruction & Surgical Abdomen', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'colorectal-cancer-screening', label: 'Colorectal Cancer Screening & GI Malignancies', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'renal-reproductive', label: 'Renal & Urinary System & Reproductive Systems', weight_min: 7, weight_max: 13,
            topics: [
                { topic_key: 'aki-management', label: 'Acute Kidney Injury Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.20 },
                { topic_key: 'ckd-management', label: 'Chronic Kidney Disease Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'uti-pyelonephritis', label: 'UTI & Pyelonephritis Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'sti-management', label: 'STI Diagnosis & Management', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'female-reproductive-clinical', label: 'Female Reproductive Disorders', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'male-reproductive-clinical', label: 'Male Reproductive Disorders & Urology', physician_task: 'mixed-management', relative_weight: 0.10 },
                { topic_key: 'urologic-conditions', label: 'Urologic Conditions & Nephrolithiasis', physician_task: 'mixed-management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'pregnancy-childbirth', label: 'Pregnancy, Childbirth & the Puerperium', weight_min: 3, weight_max: 7,
            topics: [
                { topic_key: 'prenatal-care', label: 'Prenatal Care & Antenatal Screening', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'obstetric-complications', label: 'Obstetric Complications', physician_task: 'diagnosis', relative_weight: 0.25 },
                { topic_key: 'labor-delivery', label: 'Labor & Delivery Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'postpartum-care', label: 'Postpartum Complications & Care', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'newborn-care', label: 'Newborn Assessment & Care', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'endocrine', label: 'Endocrine System', weight_min: 3, weight_max: 7,
            topics: [
                { topic_key: 'diabetes-clinical', label: 'Diabetes Management & Complications', physician_task: 'management', relative_weight: 0.30 },
                { topic_key: 'thyroid-clinical', label: 'Thyroid Disorder Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'adrenal-clinical', label: 'Adrenal Disorder Diagnosis & Treatment', physician_task: 'mixed-management', relative_weight: 0.15 },
                { topic_key: 'pituitary-clinical', label: 'Pituitary Disorder Diagnosis & Treatment', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'metabolic-syndrome-clinical', label: 'Metabolic Syndrome & Obesity Management', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'multisystem', label: 'Multisystem Processes & Disorders', weight_min: 4, weight_max: 8,
            topics: [
                { topic_key: 'sepsis-management', label: 'Sepsis & Infectious Emergency Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'shock-management', label: 'Shock Types & Resuscitation', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'autoimmune-clinical', label: 'Autoimmune Disorder Clinical Presentations', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'nutrition-clinical', label: 'Nutrition Disorders & Enteral/Parenteral Nutrition', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'fluid-electrolytes-clinical', label: 'Fluid & Electrolyte Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'trauma-clinical', label: 'Trauma Evaluation & Emergency Management', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'biostatistics-epidemiology', label: 'Biostatistics & Epidemiology/Population Health', weight_min: 3, weight_max: 5,
            topics: [
                { topic_key: 'study-design-interpretation', label: 'Study Design Interpretation & Bias', physician_task: 'diagnosis', relative_weight: 0.30 },
                { topic_key: 'screening-statistics', label: 'Screening Test Statistics & Clinical Utility', physician_task: 'diagnosis', relative_weight: 0.30 },
                { topic_key: 'clinical-decision-making', label: 'Clinical Decision Making & Diagnostic Reasoning', physician_task: 'mixed-management', relative_weight: 0.25 },
                { topic_key: 'evidence-based-practice', label: 'Evidence-Based Medicine & Guidelines', physician_task: 'mixed-management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'social-sciences-ethics', label: 'Social Sciences, Legal/Ethical Issues & Systems-based Practice', weight_min: 10, weight_max: 15,
            topics: [
                { topic_key: 'informed-consent', label: 'Informed Consent & Decision-Making Capacity', physician_task: 'professionalism', relative_weight: 0.15 },
                { topic_key: 'confidentiality-privacy', label: 'Confidentiality, Privacy & Disclosure', physician_task: 'professionalism', relative_weight: 0.15 },
                { topic_key: 'end-of-life-care', label: 'End-of-Life Care & Advance Directives', physician_task: 'professionalism', relative_weight: 0.15 },
                { topic_key: 'patient-autonomy', label: 'Patient Autonomy & Shared Decision Making', physician_task: 'professionalism', relative_weight: 0.10 },
                { topic_key: 'healthcare-systems-clinical', label: 'Healthcare Systems & Resource Allocation', physician_task: 'systems-practice', relative_weight: 0.15 },
                { topic_key: 'patient-safety-clinical', label: 'Patient Safety & Medical Errors', physician_task: 'systems-practice', relative_weight: 0.15 },
                { topic_key: 'quality-improvement', label: 'Quality Improvement & Evidence-Based Practice', physician_task: 'systems-practice', relative_weight: 0.15 },
            ],
        },
    ],
};

export const STEP3_BLUEPRINT: BlueprintFile = {
    exam_key: 'step3',
    label: 'USMLE Step 3',
    source_url: 'https://www.usmle.org/prepare-your-exam/step-3-materials/step-3-content-outline',
    version: '2025',
    systems: [
        {
            system_key: 'human-development', label: 'Human Development', weight_min: 1, weight_max: 3,
            topics: [
                { topic_key: 'lifespan-preventive-care', label: 'Lifespan Well-Patient Care & Preventive Medicine', physician_task: 'management', relative_weight: 0.30 },
                { topic_key: 'pediatric-adolescent-care', label: 'Pediatric & Adolescent Well-Care', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'age-related-findings', label: 'Age-Related Findings & Normal Development', physician_task: 'diagnosis', relative_weight: 0.25 },
                { topic_key: 'geriatric-management', label: 'Geriatric Assessment & Management', physician_task: 'management', relative_weight: 0.20 },
            ],
        },
        {
            system_key: 'immune-blood-multisystem', label: 'Immune System, Blood & Lymphoreticular, and Multisystem Processes', weight_min: 6, weight_max: 8,
            topics: [
                { topic_key: 'sepsis-shock-management', label: 'Sepsis & Shock Recognition and Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'anemia-coagulation-management', label: 'Anemia & Coagulation Disorder Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'immunodeficiency-management', label: 'Immunodeficiency & HIV Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'hematologic-malignancy-workup', label: 'Leukemia, Lymphoma & Myeloma Workup', physician_task: 'diagnosis', relative_weight: 0.15 },
                { topic_key: 'autoimmune-management', label: 'Autoimmune & Inflammatory Disease Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'multisystem-recognition', label: 'Multisystem Disorder Recognition & Management', physician_task: 'diagnosis', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'behavioral-health', label: 'Behavioral Health', weight_min: 4, weight_max: 6,
            topics: [
                { topic_key: 'mood-disorder-management', label: 'Mood Disorder Diagnosis & Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'psychiatric-emergencies', label: 'Psychiatric Emergency Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'psychotic-disorder-management', label: 'Psychotic Disorder Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'substance-use-treatment', label: 'Substance Use Disorder Treatment & Withdrawal', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'capacity-legal', label: 'Capacity Assessment & Involuntary Admission', physician_task: 'professionalism', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses', weight_min: 8, weight_max: 10,
            topics: [
                { topic_key: 'stroke-acute-management', label: 'Stroke Acute Management & Secondary Prevention', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'seizure-management', label: 'Seizure Disorder Evaluation & Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'altered-mental-status', label: 'Altered Mental Status & Encephalopathy Workup', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'headache-management', label: 'Headache Classification & Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'neuromuscular-disease', label: 'Neuromuscular Disease & Peripheral Neuropathy', physician_task: 'diagnosis', relative_weight: 0.10 },
                { topic_key: 'eye-ear-emergencies', label: 'Ophthalmic & Otologic Emergencies', physician_task: 'management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'skin-subcutaneous', label: 'Skin & Subcutaneous Tissue', weight_min: 4, weight_max: 6,
            topics: [
                { topic_key: 'dermatologic-diagnosis-management', label: 'Dermatologic Diagnosis & Management', physician_task: 'management', relative_weight: 0.35 },
                { topic_key: 'wound-care-infections', label: 'Wound Care & Soft Tissue Infections', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'skin-cancer-recognition', label: 'Skin Cancer Recognition & Screening', physician_task: 'diagnosis', relative_weight: 0.25 },
                { topic_key: 'emergency-dermatology', label: 'Emergency Dermatology & Systemic Skin Manifestations', physician_task: 'diagnosis', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'musculoskeletal', label: 'Musculoskeletal System', weight_min: 5, weight_max: 7,
            topics: [
                { topic_key: 'fracture-dislocation-management', label: 'Fracture & Dislocation Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'arthritis-management', label: 'Arthritis & Rheumatologic Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'back-pain-evaluation', label: 'Back Pain & Spinal Disorder Evaluation', physician_task: 'diagnosis', relative_weight: 0.20 },
                { topic_key: 'orthopedic-emergencies', label: 'Orthopedic & Compartment Emergencies', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'sports-medicine', label: 'Sports Medicine & Soft Tissue Injuries', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'cardiovascular', label: 'Cardiovascular System', weight_min: 9, weight_max: 11,
            topics: [
                { topic_key: 'acs-management', label: 'Acute Coronary Syndrome Recognition & Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'heart-failure-management', label: 'Heart Failure Diagnosis & Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'dysrhythmia-treatment', label: 'Dysrhythmia Recognition & Treatment', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'hypertensive-emergencies', label: 'Hypertension & Hypertensive Emergencies', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'peripheral-vascular-disease', label: 'Peripheral Vascular Disease Management', physician_task: 'management', relative_weight: 0.10 },
                { topic_key: 'cardiac-risk-management', label: 'Cardiac Risk Stratification & Prevention', physician_task: 'prognosis', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'respiratory', label: 'Respiratory System', weight_min: 8, weight_max: 10,
            topics: [
                { topic_key: 'pneumonia-management', label: 'Pneumonia Diagnosis & Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'asthma-copd-management', label: 'Asthma & COPD Exacerbation Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'pulmonary-embolism', label: 'Pulmonary Embolism Diagnosis & Treatment', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'respiratory-failure', label: 'Respiratory Failure & Mechanical Ventilation', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'sleep-apnea-restrictive', label: 'Sleep Apnea & Restrictive Lung Conditions', physician_task: 'management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'gastrointestinal', label: 'Gastrointestinal System', weight_min: 6, weight_max: 8,
            topics: [
                { topic_key: 'gi-bleeding-management', label: 'GI Bleeding Evaluation & Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'liver-cirrhosis-management', label: 'Liver Disease & Cirrhosis Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'ibd-management', label: 'IBD Diagnosis & Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'acute-abdomen', label: 'Acute Abdomen & Surgical GI Emergencies', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'bowel-obstruction', label: 'Bowel Obstruction & Ileus Management', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'colorectal-cancer-screening', label: 'Colorectal Cancer Screening & GI Malignancies', physician_task: 'management', relative_weight: 0.15 },
            ],
        },
        {
            system_key: 'renal-male-reproductive', label: 'Renal/Urinary & Male Reproductive Systems', weight_min: 4, weight_max: 6,
            topics: [
                { topic_key: 'aki-ckd-management', label: 'AKI & CKD Diagnosis and Management', physician_task: 'management', relative_weight: 0.30 },
                { topic_key: 'electrolyte-management', label: 'Electrolyte Disorder Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'uti-urologic', label: 'UTI & Urologic Conditions Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'male-reproductive-disorders', label: 'Male Reproductive Disorders', physician_task: 'diagnosis', relative_weight: 0.20 },
            ],
        },
        {
            system_key: 'pregnancy-female-reproductive', label: 'Pregnancy, Childbirth & Female Reproductive System & Breast', weight_min: 7, weight_max: 9,
            topics: [
                { topic_key: 'prenatal-care', label: 'Prenatal Care & Antenatal Surveillance', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'obstetric-emergencies', label: 'Obstetric Complications & Emergencies', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'labor-delivery-management', label: 'Labor & Delivery Management', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'postpartum-care', label: 'Postpartum Complications & Care', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'gynecologic-emergencies', label: 'Gynecologic Emergencies & Disorders', physician_task: 'management', relative_weight: 0.15 },
                { topic_key: 'breast-disease', label: 'Breast Disease & Cancer Screening', physician_task: 'management', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'endocrine', label: 'Endocrine System', weight_min: 5, weight_max: 7,
            topics: [
                { topic_key: 'diabetes-management', label: 'Diabetes Management & Acute Complications', physician_task: 'management', relative_weight: 0.35 },
                { topic_key: 'thyroid-management', label: 'Thyroid Disorder Diagnosis & Management', physician_task: 'management', relative_weight: 0.25 },
                { topic_key: 'adrenal-emergencies', label: 'Adrenal Disorders & Emergencies', physician_task: 'management', relative_weight: 0.20 },
                { topic_key: 'metabolic-syndrome', label: 'Metabolic Syndrome & Obesity Management', physician_task: 'management', relative_weight: 0.20 },
            ],
        },
        {
            system_key: 'biostatistics-epidemiology', label: 'Biostatistics, Epidemiology/Population Health & Medical Literature', weight_min: 11, weight_max: 13,
            topics: [
                { topic_key: 'clinical-decision-making', label: 'Clinical Decision Making & Diagnostic Reasoning', physician_task: 'evidence-based', relative_weight: 0.25 },
                { topic_key: 'medical-literature-interpretation', label: 'Medical Literature Interpretation & Critical Appraisal', physician_task: 'evidence-based', relative_weight: 0.20 },
                { topic_key: 'study-design-interpretation', label: 'Study Design & Bias Recognition', physician_task: 'evidence-based', relative_weight: 0.20 },
                { topic_key: 'screening-test-application', label: 'Screening Test Statistics & Clinical Application', physician_task: 'evidence-based', relative_weight: 0.15 },
                { topic_key: 'evidence-based-medicine', label: 'Evidence-Based Medicine & Clinical Guidelines', physician_task: 'evidence-based', relative_weight: 0.10 },
                { topic_key: 'population-health-disparities', label: 'Population Health, Disparities & Preventive Medicine', physician_task: 'evidence-based', relative_weight: 0.10 },
            ],
        },
        {
            system_key: 'social-sciences-ethics', label: 'Social Sciences, Communication, Ethics & Patient Safety', weight_min: 7, weight_max: 9,
            topics: [
                { topic_key: 'informed-consent', label: 'Informed Consent & Decision-Making Capacity', physician_task: 'professionalism', relative_weight: 0.20 },
                { topic_key: 'patient-safety-errors', label: 'Patient Safety & Medical Error Prevention', physician_task: 'systems-practice', relative_weight: 0.20 },
                { topic_key: 'confidentiality-disclosure', label: 'Confidentiality, Privacy & Mandatory Reporting', physician_task: 'professionalism', relative_weight: 0.15 },
                { topic_key: 'end-of-life-advance-directives', label: 'End-of-Life Care & Advance Directives', physician_task: 'professionalism', relative_weight: 0.15 },
                { topic_key: 'quality-improvement', label: 'Quality Improvement & Healthcare Systems', physician_task: 'systems-practice', relative_weight: 0.15 },
                { topic_key: 'communication-skills', label: 'Communication Skills & Patient-Physician Relationship', physician_task: 'professionalism', relative_weight: 0.15 },
            ],
        },
    ],
};

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

// ── NBME Subject Exams ────────────────────────────────────────────────────────
// Topics not yet defined for shelf exams — topics array is empty on all entries.

export const IM_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'im-shelf',
    label: 'Medicine Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/medicine',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                        weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                            weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                  weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                     weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                               weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                                                  weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                              weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                     weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'biostatistics-epidemiology',    label: 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature', weight_min: 1, weight_max: 5, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Medical Ethics and Jurisprudence',                           weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const SURGERY_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'surgery-shelf',
    label: 'Surgery Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/surgery',
    version: '2025',
    systems: [
        { system_key: 'immune-system',                 label: 'Immune System',                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                        weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                            weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                  weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                     weight_min: 8,  weight_max: 12, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                               weight_min: 20, weight_max: 25, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                  weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                              weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                       weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                     weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Medical Ethics and Jurisprudence', weight_min: 1, weight_max: 5, topics: [] },
    ],
};

export const PEDIATRICS_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'pediatrics-shelf',
    label: 'Pediatrics Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/pediatrics',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                          weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                        weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                            weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                  weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                     weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                               weight_min: 8,  weight_max: 12, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'newborn-congenital',            label: 'Disorders of the Newborn & Congenital Disorders',                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'female-reproductive',           label: 'Female Reproductive System',                                                            weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                              weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                     weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Consent and Physician-Patient Relationship',                 weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const OBGYN_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'obgyn-shelf',
    label: 'Obstetrics & Gynecology Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/obstetrics-and-gynecology',
    version: '2025',
    systems: [
        { system_key: 'general-principles',        label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'pregnancy-childbirth',      label: 'Pregnancy, Childbirth, & the Puerperium',                                               weight_min: 40, weight_max: 45, topics: [] },
        { system_key: 'female-reproductive-breast', label: 'Female Reproductive System & Breast',                                                  weight_min: 40, weight_max: 45, topics: [] },
        { system_key: 'endocrine',                 label: 'Endocrine System',                                                                       weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'multisystem',               label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'social-sciences',           label: 'Social Sciences, Including Communication, Medical Ethics and Jurisprudence',             weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const PSYCHIATRY_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'psychiatry-shelf',
    label: 'Psychiatry Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/psychiatry',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 65, weight_max: 70, topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'multisystem',                   label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Communication and Medical Ethics and Jurisprudence',          weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const FAMILY_MEDICINE_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'family-medicine-shelf',
    label: 'Family Medicine Modular Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/family-medicine-modular',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient',                                    weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                                                             weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                                                           weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                                                         weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                                                               weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                                                   weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                                                     weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                                                        weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                                                                  weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                                                   weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'pregnancy-childbirth',          label: 'Pregnancy, Childbirth, & the Puerperium',                                                                                 weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                                                                                     weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                                                                 weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                                                          weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                                                        weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'biostatistics-epidemiology',    label: 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature',                               weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Communication, Medical Ethics and Jurisprudence, and Systems-Based Practice and Patient Safety', weight_min: 5, weight_max: 10, topics: [] },
    ],
};

export const AMBULATORY_CARE_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'ambulatory-care-shelf',
    label: 'Ambulatory Care Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/ambulatory-care',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient',                   weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'immune-system',                 label: 'Immune System',                                                                                            weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                                                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                                        weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                                         weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                                                                              weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                                  weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                                                                    weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                                                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                                                                                 weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                                                                  weight_min: 3,  weight_max: 8,  topics: [] },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                                                                    weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                                                                                weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                                                                         weight_min: 8,  weight_max: 12, topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                                                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'biostatistics-epidemiology',    label: 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature',              weight_min: 3,  weight_max: 8,  topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Medical Ethics, Jurisprudence, and Systems-Based Practice and Patient Safety', weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const CLINICAL_NEUROLOGY_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'clinical-neurology-shelf',
    label: 'Clinical Neurology Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/clinical-science/clinical-neurology',
    version: '2025',
    systems: [
        { system_key: 'general-principles',            label: 'General Principles, Including Normal Age-Related Findings and Care of the Well Patient', weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                                                      weight_min: 3,  weight_max: 7,  topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                                                       weight_min: 60, weight_max: 65, topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                                                weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'multisystem',                   label: 'Other Systems, Including Multisystem Processes & Disorders',                             weight_min: 15, weight_max: 20, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Death and Dying and Palliative Care',                        weight_min: 1,  weight_max: 5,  topics: [] },
    ],
};

export const EMERGENCY_MEDICINE_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'emergency-medicine-shelf',
    label: 'Emergency Medicine Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/advanced-clinical/emergency-medicine',
    version: '2025',
    systems: [
        { system_key: 'immune-system',                 label: 'Immune System',                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'blood-lymphoreticular',         label: 'Blood & Lymphoreticular System',                        weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'behavioral-health',             label: 'Behavioral Health',                                      weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'nervous-system-special-senses', label: 'Nervous System & Special Senses',                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'skin-subcutaneous',             label: 'Skin & Subcutaneous Tissue',                            weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'musculoskeletal',               label: 'Musculoskeletal System',                                weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'cardiovascular',                label: 'Cardiovascular System',                                  weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'respiratory',                   label: 'Respiratory System',                                     weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'gastrointestinal',              label: 'Gastrointestinal System',                               weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'renal-urinary',                 label: 'Renal & Urinary System',                                weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'pregnancy-childbirth',          label: 'Pregnancy, Childbirth, & the Puerperium',              weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'female-reproductive-breast',    label: 'Female Reproductive System & Breast',                  weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'male-reproductive',             label: 'Male Reproductive System',                              weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine',                     label: 'Endocrine System',                                       weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'multisystem',                   label: 'Multisystem Processes & Disorders',                     weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'social-sciences',               label: 'Social Sciences, Including Medical Ethics and Jurisprudence', weight_min: 1, weight_max: 5, topics: [] },
    ],
};

export const INTERNAL_MEDICINE_ADVANCED_SHELF_BLUEPRINT: BlueprintFile = {
    exam_key: 'internal-medicine-advanced-shelf',
    label: 'Internal Medicine Subject Exam',
    source_url: 'https://www.nbme.org/subject-exams/advanced-clinical/internal-medicine',
    version: '2025',
    systems: [
        { system_key: 'general-principles',                label: 'General Principles',                                        weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'immunologic-disorders',             label: 'Immunologic Disorders',                                     weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'diseases-of-the-blood',             label: 'Diseases of the Blood',                                     weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'mental-disorders',                  label: 'Mental Disorders',                                          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'diseases-of-the-nervous-system',    label: 'Diseases of the Nervous System',                           weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'cardiovascular-disorders',          label: 'Cardiovascular Disorders',                                  weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'diseases-of-the-respiratory-system', label: 'Diseases of the Respiratory System',                      weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'nutritional-digestive-disorders',   label: 'Nutritional and Digestive Disorders',                      weight_min: 10, weight_max: 15, topics: [] },
        { system_key: 'female-reproductive-system',        label: 'Female Reproductive System',                               weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'renal-urinary-male-reproductive',   label: 'Renal, Urinary, Male Reproductive Systems',               weight_min: 5,  weight_max: 10, topics: [] },
        { system_key: 'diseases-of-the-skin',              label: 'Diseases of the Skin',                                     weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'musculoskeletal-connective-tissue', label: 'Musculoskeletal and Connective Tissue Disorders',          weight_min: 1,  weight_max: 5,  topics: [] },
        { system_key: 'endocrine-metabolic-disorders',     label: 'Endocrine and Metabolic Disorders',                        weight_min: 8,  weight_max: 12, topics: [] },
    ],
};

// ── NAPLEX (NABP) ─────────────────────────────────────────────────────────────
// Source: NAPLEX Content Outline (May 2025), NABP.
// https://nabp.pharmacy/wp-content/uploads/NAPLEX-Content-Outline.pdf
//
// Hierarchy mapping (Option B): the 3-level outline (domain / subdomain letter /
// sub-subdomain number) is folded into the existing 2-level system → topic
// schema by encoding the subdomain letter into topic_key (e.g. 'A.1', 'B.2').
// Subdomain entries with no sub-subdomain children are stored with a single-
// letter topic_key (e.g. 'D', 'E', 'F'). Domain weights are explicit single
// percents (25/25/40/5/5), so weight_min == weight_max. Topic relative_weight
// is equal-split within each domain — NABP does not publish per-subdomain
// weights in the public outline.

export const NAPLEX_BLUEPRINT: BlueprintFile = {
    exam_key: 'naplex',
    label: 'NAPLEX',
    source_url: 'https://nabp.pharmacy/wp-content/uploads/NAPLEX-Content-Outline.pdf',
    version: '2025-05',
    systems: [
        {
            system_key: '1', label: 'Foundational Knowledge for Pharmacy Practice', weight_min: 25, weight_max: 25,
            topics: [
                { topic_key: 'A.1', label: 'Pharmacology',                                                                          physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'A.2', label: 'Pharmacokinetics, pharmacodynamics, or pharmacogenomics',                              physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'A.3', label: 'Pharmaceutics',                                                                         physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'B.1', label: 'Nonsterile preparations',                                                               physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'B.2', label: 'Sterile preparations',                                                                  physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.1', label: 'Patient parameters or laboratory measures',                                             physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.2', label: 'Quantities of drugs to be dispensed or administered',                                   physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.3', label: 'Rates of administration',                                                               physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.4', label: 'Dose conversions',                                                                      physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.5', label: 'Drug concentrations, ratio strengths, osmolarity, or osmolality',                       physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.6', label: 'Quantities of drugs or ingredients to be compounded',                                   physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.7', label: 'Nutritional needs and the content of nutrient sources',                                 physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.8', label: 'Biostatistical, epidemiological, or pharmacoeconomic measures',                         physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.9', label: 'Pharmacokinetic parameters',                                                            physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'D',   label: 'Drug development processes (eg, clinical trial phases, emergency use authorizations)', physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'E',   label: 'Research design principles and biostatistics (eg, blinding, randomization, biases, statistical tests and outcomes, ethics)', physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'F',   label: 'Retrieval, assessment, and interpretation of primary, secondary, and tertiary resources',                                    physician_task: null, relative_weight: 0.0592 },
            ],
        },
        {
            system_key: '2', label: 'Medication Use Process (Prescribing, Transcribing and Documenting, Dispensing, Administering, and Monitoring)', weight_min: 25, weight_max: 25,
            topics: [
                { topic_key: 'A.1', label: 'Drug names and therapeutic classes',                                                                                                       physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'A.2', label: 'Indications, usage, and dosing regimens',                                                                                                  physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'A.3', label: 'Available dosage forms',                                                                                                                   physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'A.4', label: 'Prescription regulations (eg, boxed warnings, risk evaluation and mitigation strategies)',                                                 physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'A.5', label: 'Safety and effectiveness (eg, laboratory parameters, vital signs)',                                                                        physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'B',   label: 'Therapeutic substitutions (eg, formulary restrictions, therapeutic alternatives, shortages, biosimilars)',                                 physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'C.1', label: 'Indications and scheduling',                                                                                                               physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'C.2', label: 'Contraindications and precautions',                                                                                                        physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'C.3', label: 'Storage and handling',                                                                                                                     physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'C.4', label: 'Administration (eg, techniques, preparation, routes)',                                                                                     physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'C.5', label: 'Adverse reactions',                                                                                                                        physician_task: null, relative_weight: 0.0833 },
                { topic_key: 'D',   label: 'Medication handling, storage, stability, and disposal (eg, hazardous and nonhazardous drugs, controlled substances, parenteral medications, sharps handling, temperature control)', physician_task: null, relative_weight: 0.0837 },
            ],
        },
        {
            system_key: '3', label: 'Person-Centered Assessment and Treatment Planning', weight_min: 40, weight_max: 40,
            topics: [
                { topic_key: 'A',   label: 'Medication history, allergy history, and reconciliation',                                                                  physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'B',   label: 'Health histories, screenings, and assessments',                                                                            physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.1', label: 'Signs, symptoms, and findings of medical conditions, etiology of diseases, or pathophysiology',                            physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.2', label: 'Appropriateness of therapy (eg, medications, immunizations, non-drug therapy, dosing, contraindications, warnings, evidence-based decision making)', physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.3', label: 'Interactions (eg, drug-drug, drug-condition, drug-food, drug-allergy, drug-laboratory)',                                   physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.4', label: 'Errors and omissions (eg, dosing, duplication, additional therapy needed, unnecessary therapy)',                           physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.5', label: 'Adverse drug reactions',                                                                                                   physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.6', label: 'Toxicologic exposures and overdoses',                                                                                      physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'C.7', label: 'Adherence',                                                                                                                physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'D.1', label: 'Therapeutic goals, clinical endpoints, and follow-up',                                                                     physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'D.2', label: 'Safety',                                                                                                                   physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'D.3', label: 'Effectiveness',                                                                                                            physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'E.1', label: 'Lifestyle modifications and health maintenance',                                                                           physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'E.2', label: 'Medication use, storage, and disposal',                                                                                    physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'E.3', label: 'Disease state management',                                                                                                 physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'F',   label: 'Over-the-counter medications and dietary supplements',                                                                     physician_task: null, relative_weight: 0.0588 },
                { topic_key: 'G',   label: 'Devices to administer medications and self-monitoring tests',                                                              physician_task: null, relative_weight: 0.0592 },
            ],
        },
        {
            system_key: '4', label: 'Professional Practice', weight_min: 5, weight_max: 5,
            topics: [
                { topic_key: 'A', label: 'Adverse drug event reporting and medication error reporting (eg, MedWatch, VAERS)',                                                                                  physician_task: null, relative_weight: 0.25 },
                { topic_key: 'B', label: 'Public health initiatives and risk-prevention programs (eg, tobacco and nicotine cessation, antimicrobial stewardship, health screenings, opioid stewardship)',     physician_task: null, relative_weight: 0.25 },
                { topic_key: 'C', label: 'Social determinants and drivers of health',                                                                                                                          physician_task: null, relative_weight: 0.25 },
                { topic_key: 'D', label: 'Ethical considerations (eg, informed consent, ethical principles, professional conduct and responsibility, patient confidentiality)',                                physician_task: null, relative_weight: 0.25 },
            ],
        },
        {
            system_key: '5', label: 'Pharmacy Management and Leadership', weight_min: 5, weight_max: 5,
            topics: [
                { topic_key: 'A', label: 'Pharmacy operations (eg, operational planning, risk management, regulations and regulatory bodies, technology applications and informatics, error-prevention strategies, medication safety)', physician_task: null, relative_weight: 0.25 },
                { topic_key: 'B', label: 'Inventory and supply management (eg, drug recalls, drug shortages)',                                                                                                physician_task: null, relative_weight: 0.25 },
                { topic_key: 'C', label: 'Quality improvement activities (eg, medication use evaluation, root-cause analysis, continuous quality improvement)',                                               physician_task: null, relative_weight: 0.25 },
                { topic_key: 'D', label: 'Mentorship and preceptorship (eg, providing and receiving feedback, delegation of work activities, preceptor roles)',                                               physician_task: null, relative_weight: 0.25 },
            ],
        },
    ],
};
