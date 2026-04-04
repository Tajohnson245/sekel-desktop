-- Blueprint tables for Supabase.
-- All tables use CREATE TABLE IF NOT EXISTS so this migration is safe to re-run.
-- Seed data lives in supabase/blueprints/ and is applied separately via
-- npx tsx scripts/seed-blueprints-supabase.ts

-- ── blueprint_exams ───────────────────────────────────────────────────────────
-- Registry of supported board exams. One row per exam.
create table if not exists public.blueprint_exams (
    id               uuid        primary key default gen_random_uuid(),
    exam_key         text        not null unique,
    name             text        not null,
    issuer           text,
    category         text,
    level            text,
    alias            text,
    source_url       text,
    blueprint_version text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- ── blueprint_systems ─────────────────────────────────────────────────────────
-- Organ / content systems per exam with official USMLE weight ranges (%).
create table if not exists public.blueprint_systems (
    id         uuid    primary key default gen_random_uuid(),
    exam_id    uuid    not null references public.blueprint_exams(id) on delete cascade,
    system_key text    not null,
    label      text    not null,
    weight_min numeric,
    weight_max numeric,
    unique (exam_id, system_key)
);

create index if not exists blueprint_systems_exam_id_idx on public.blueprint_systems(exam_id);

-- ── blueprint_physician_tasks ─────────────────────────────────────────────────
-- Exam-level physician task dimensions (Diagnosis, Management, etc.) with
-- official USMLE weight ranges. Schema ready; rows added when data is sourced.
create table if not exists public.blueprint_physician_tasks (
    id         uuid    primary key default gen_random_uuid(),
    exam_id    uuid    not null references public.blueprint_exams(id) on delete cascade,
    task_key   text    not null,
    label      text    not null,
    weight_min numeric,
    weight_max numeric,
    unique (exam_id, task_key)
);

create index if not exists blueprint_physician_tasks_exam_id_idx on public.blueprint_physician_tasks(exam_id);

-- ── blueprint_site_of_care ────────────────────────────────────────────────────
-- Site-of-care dimensions per exam (Ambulatory, Emergency, Inpatient, etc.).
-- Applies to Step 3; schema ready for other exams when data is sourced.
create table if not exists public.blueprint_site_of_care (
    id         uuid    primary key default gen_random_uuid(),
    exam_id    uuid    not null references public.blueprint_exams(id) on delete cascade,
    site_key   text    not null,
    label      text    not null,
    weight_min numeric,
    weight_max numeric,
    unique (exam_id, site_key)
);

create index if not exists blueprint_site_of_care_exam_id_idx on public.blueprint_site_of_care(exam_id);

-- ── blueprint_patient_age ─────────────────────────────────────────────────────
-- Patient age group dimensions per exam with weight ranges where applicable.
create table if not exists public.blueprint_patient_age (
    id         uuid    primary key default gen_random_uuid(),
    exam_id    uuid    not null references public.blueprint_exams(id) on delete cascade,
    age_key    text    not null,
    label      text    not null,
    weight_min numeric,
    weight_max numeric,
    unique (exam_id, age_key)
);

create index if not exists blueprint_patient_age_exam_id_idx on public.blueprint_patient_age(exam_id);

-- ── card_classifications ──────────────────────────────────────────────────────
-- One row per card per exam. Populated at runtime by the classification service.
-- system_id is nullable — a card may be classified to exam only, not yet to system.
create table if not exists public.card_classifications (
    id               uuid        primary key default gen_random_uuid(),
    card_id          uuid        not null references public.cards(id) on delete cascade,
    exam_id          uuid        not null references public.blueprint_exams(id) on delete cascade,
    system_id        uuid        references public.blueprint_systems(id) on delete set null,
    confidence_score numeric,
    model_version    text,
    classified_at    timestamptz not null default now(),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (card_id, exam_id)
);

create index if not exists card_classifications_card_id_idx  on public.card_classifications(card_id);
create index if not exists card_classifications_exam_id_idx  on public.card_classifications(exam_id);
create index if not exists card_classifications_system_id_idx on public.card_classifications(system_id);
