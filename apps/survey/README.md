# @sekel/survey — Beta Feedback Hub

Pre-launch user research app for SEKEL. A public 4-step survey for medical students (3–5 min, no auth) and a private admin dashboard with aggregate charts.

---

## Overview

SEKEL is an AI-powered spaced repetition flashcard app targeting medical students preparing for USMLE, NBME shelf exams, and NCLEX. This app collects user research data before the beta launch by asking students:

1. Who they are (demographics / academic profile)
2. What study tools they currently use, and how satisfied they are
3. Pain points and feature wishlists
4. (Review screen, then submit)

Responses are stored in Supabase and viewable in a private admin dashboard at `/dashboard`.

---

## Architecture

```
Browser
  │
  ├── /              Landing page (CTA → start survey)
  ├── /survey        Multi-step survey form (client component)
  │     └── POST /api/submit  →  Supabase (respondents + study_tools + survey_responses)
  ├── /thank-you     Confirmation page
  └── /dashboard     Auth-gated admin dashboard
        ├── /login   Email/password login (Supabase Auth)
        └── /        Stats, charts, response table

Supabase (Postgres)
  ├── respondents        — one row per submission
  ├── study_tools        — one row per tool per respondent
  └── survey_responses   — one row per wishlist answer per respondent

packages/feedback-components   — UI kit, survey steps, dashboard charts
apps/feedback                  — Next.js app routes + API
```

---

## Getting Started

### 1. Clone and install

```bash
git clone <repo>
cd sekel
npm install
```

### 2. Configure environment

```bash
cp apps/feedback/.env.local.example apps/feedback/.env.local
```

Fill in your Supabase project URL, anon key, and service role key from your [Supabase project settings](https://supabase.com/dashboard).

### 3. Run Supabase migrations

In your Supabase SQL editor (or via Supabase CLI), run the migration files in order:

```
apps/feedback/supabase/migrations/001_create_respondents.sql
apps/feedback/supabase/migrations/002_create_study_tools.sql
apps/feedback/supabase/migrations/003_create_survey_responses.sql
apps/feedback/supabase/migrations/004_rls_policies.sql
```

### 4. Seed admin user

Create an admin user directly in Supabase Auth:

- Go to **Authentication → Users** in the Supabase dashboard
- Click **"Invite user"** and enter your email
- Or via CLI: `supabase auth user create --email admin@sekel.app --password <password>`

### 5. Start the dev server

```bash
turbo run dev --filter=@sekel/survey
# or from the monorepo root:
npm run dev -- --filter=@sekel/survey
```

App runs on **http://localhost:3002**.

---

## Database Schema

### `respondents`

One row per survey submission.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | TEXT | Optional |
| email | TEXT | Optional |
| school | TEXT | Required |
| specialty | TEXT | Optional |
| year | TEXT | Required (MS1–MS4, DO-1–DO-4, IMG, PGY-1, PGY-2, Other) |
| exam_upcoming | TEXT | Optional |
| exam_date | DATE | Optional |
| created_at | TIMESTAMPTZ | Auto |

### `study_tools`

One row per tool per respondent.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| respondent_id | UUID | FK → respondents.id |
| tool_name | TEXT | e.g. "Anki", "UWorld" |
| usage_frequency | TEXT | Daily · Few times a week · Weekly · Rarely |
| satisfaction | INTEGER | 1–5 |
| pros | TEXT | Free text |
| cons | TEXT | Free text |

### `survey_responses`

One row per wishlist answer per respondent.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| respondent_id | UUID | FK → respondents.id |
| question_key | TEXT | e.g. "magic_wand", "biggest_frustration" |
| question_text | TEXT | Human-readable question |
| answer | TEXT | Free text |

---

## Survey Flow

1. **Step 1 — About You**: school (required), year (required), name/email/specialty/exam (optional)
2. **Step 2 — Your Tools**: checkbox grid of tools; per-tool frequency, satisfaction, pros/cons
3. **Step 3 — Your Wishlist**: 4 open-ended questions (biggest frustration, magic wand, ideal session, would pay for)
4. **Step 4 — Review**: read-only summary with edit buttons; Submit button calls `POST /api/submit`

On submit:
- Client sends JSON payload to `/api/submit`
- Server validates with Zod, inserts respondent row, then parallel-inserts study_tools and survey_responses
- Redirects to `/thank-you`

---

## Dashboard

Access at `/dashboard`. Requires sign-in with a Supabase Auth account (admin only, no public sign-up).

**Stats**: Total responses, responses this week, most common tool, average satisfaction

**Charts** (Recharts):
- Tool popularity (horizontal bar)
- Satisfaction by tool (horizontal bar)
- Year distribution (donut)
- Upcoming exam distribution (horizontal bar)

**Response table**: Paginated list of respondents with expandable detail rows showing wishlist answers.

---

## Deployment

### Vercel (recommended)

1. Push branch to GitHub
2. Import `apps/feedback` as a Vercel project (or use monorepo root with project root set to `apps/feedback`)
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy

The `output: "standalone"` in `next.config.ts` supports Docker / self-hosted deployments as well.

---

## Contributing

### Adding a new survey question

1. Add it to `WISHLIST_QUESTIONS` in `packages/feedback-components/src/survey/StepWishlist.tsx`
2. Add the corresponding key to `WishlistData` in `packages/feedback-components/src/types.ts`
3. Add the question text to `WISHLIST_QUESTION_TEXTS` in `apps/feedback/src/app/api/submit/route.ts`

### Adding a new dashboard chart

1. Create `NewChart.tsx` (+ optional `.css`) in `packages/feedback-components/src/dashboard/`
2. Export it from `packages/feedback-components/src/index.ts`
3. Fetch the data in `apps/feedback/src/app/dashboard/page.tsx` and pass it as props
