# Medicine Subject Exam Blueprint

---

**Status:** `Shipped`
**Target Version:** TBD
**Branch:** `SEKEL-107-medicine-subject-exam-blueprint`
**Created:** 2026-04-03
**Last Updated:** 2026-04-03
**Shipped:** 2026-04-03

---

## Overview

Adds the NBME Medicine Subject Exam (IM Shelf) as a seeded blueprint in Supabase. This is the first Subject Exam blueprint in the system, alongside the existing USMLE Step 1, 2 CK, and 3 entries. It enables Sekel to classify Internal Medicine clerkship cards against the official NBME content outline and display system-level weight distributions to users.

## Architecture

```
apps/desktop/supabase/blueprints/
└── nbme-im-shelf-v2025.ts   ← new file; calls upsertBlueprint() from _seed.ts
```

The file follows the established naming convention `{issuer}-{exam_key}-v{version}.ts`. The runner (`scripts/seed-blueprints-supabase.ts`) discovers it automatically — no changes to shared infrastructure were required.

- **exam_key:** `im-shelf`
- **Issuer:** NBME
- **Category:** Clinical Science
- **Level:** 3rd Year Clerkship
- **Systems seeded:** 17

## Key Decisions

1. **Branched from SEKEL-106, not dev** — The blueprint infrastructure (seed files, runner, DB migration) was not yet merged to `dev` at the time this branch was cut. Branching from SEKEL-106 ensured the new blueprint file had its dependencies available.

2. **Systems only; no physician task / site of care / patient age rows** — The `_seed.ts` utility and `BlueprintSeedData` type only support the `systems` dimension. The other three dimensions have schema-ready tables in Supabase but are not yet wired into the seeding layer. This matches the same pattern as Step 1, 2 CK, and Step 3.

## Known Limitations / Future Work

- Physician Task, Site of Care, and Patient Age data are defined in the NBME outline but not yet seeded — the `_seed.ts` utility needs to be extended to support those dimensions.
- Other NBME Subject Exams (Surgery, Psychiatry, Pediatrics, OB/GYN, Family Medicine, Neurology) are not yet seeded.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-04-03 | Added `nbme-im-shelf-v2025.ts` — seeds Medicine Subject Exam (IM Shelf) with 17 systems into Supabase via the centralized blueprint migration system. |
| 2026-04-03 | apps/desktop/supabase/blueprints/nbme-im-shelf-v2025.ts |
| 2026-04-03 | apps/desktop/supabase/blueprints/nbme-im-shelf-v2025.ts |
| 2026-04-03 | apps/desktop/supabase/blueprints/nbme-surgery-shelf-v2025.ts |
| 2026-04-03 | apps/desktop/supabase/blueprints/nbme-pediatrics-shelf-v2025.ts,apps/desktop/supabase/blueprints/nbme-surgery-shelf-v2025.ts |
| 2026-04-03 | apps/desktop/supabase/blueprints/nbme-obgyn-shelf-v2025.ts,apps/desktop/supabase/blueprints/nbme-pediatrics-shelf-v2025.ts,apps/desktop/supabase/blueprints/nbme-surgery-shelf-v2025.ts |
