# Architecture — @sekel/survey

## Data Flow

```
User fills survey (browser)
  │
  └─► SurveyShell (client component, packages/feedback-components)
        │  holds ProfileData, StudyToolData[], WishlistData in useState
        │  validates on Next click (required fields only)
        │
        └─► onSubmit(payload) → POST /api/submit
              │
              ├─ Zod validation (server-side)
              ├─ INSERT respondents → get UUID
              └─ parallel INSERT study_tools + survey_responses
                    │
                    └─► Supabase Postgres (via service-role client)
```

```
Admin visits /dashboard (browser)
  │
  └─► dashboard/layout.tsx (server component)
        │  createServerClient() → db.auth.getSession()
        │  if no session → redirect /dashboard/login
        │
        └─► dashboard/page.tsx (server component)
              │  7 parallel Supabase queries
              │  aggregation in JS
              └─► Client chart components (Recharts, "use client")
```

---

## Supabase RLS Policy Explanation

All three tables use Row Level Security with two policies each:

| Policy | Operation | Rule |
|---|---|---|
| "Anyone can submit" | INSERT | `WITH CHECK (true)` — any request may insert |
| "Admin read" | SELECT | `USING (auth.role() = 'authenticated')` — only authenticated sessions may read |

This means:
- The **survey form** uses the **anon key** and can only INSERT (no SELECT, no UPDATE, no DELETE)
- The **dashboard** uses the **service role key** which bypasses RLS entirely — all reads succeed
- No public read access to any response data

---

## API Route Contracts

### `POST /api/submit`

**Request body** (JSON):
```ts
{
  profile: {
    name?: string
    email?: string
    school: string          // required
    year: string            // required
    specialty?: string
    exam_upcoming?: string
    exam_date?: string
  }
  tools: Array<{
    tool_name: string
    tool_name_other?: string
    usage_frequency?: string
    satisfaction?: number   // 1–5
    pros?: string
    cons?: string
  }>
  wishlist: {
    biggest_frustration?: string
    magic_wand?: string
    ideal_session?: string
    would_pay_for?: string
  }
}
```

**Responses**:
- `201 { ok: true }` — success
- `400 { error: "Validation failed", issues: [...] }` — Zod validation error
- `400 { error: "Invalid JSON" }` — unparseable body
- `500 { error: "Failed to save response" }` — DB insert failure (respondent row)

### `POST /api/auth/signout`

No body. Calls `db.auth.signOut()` and redirects to `/dashboard/login`.

---

## Component Hierarchy

```
apps/feedback/
└── src/app/
    ├── layout.tsx           (server) — dark header, global CSS
    ├── page.tsx             (server) — landing page
    ├── survey/page.tsx      (client) — mounts SurveyShell, passes onSubmit
    ├── thank-you/page.tsx   (server) — confirmation
    ├── api/submit/route.ts  (server) — POST handler
    ├── api/auth/signout/route.ts (server) — sign-out handler
    └── dashboard/
        ├── layout.tsx       (server) — session check + redirect
        ├── page.tsx         (server) — data fetching, renders charts
        └── login/page.tsx   (client) — login form

packages/feedback-components/
└── src/
    ├── types.ts             — shared TS interfaces (no deps)
    ├── ui/
    │   ├── Button
    │   ├── Input
    │   ├── Select
    │   ├── Textarea
    │   ├── ProgressBar
    │   └── Card
    ├── survey/
    │   ├── SurveyShell      (client) — state machine, stepper UI
    │   ├── StepProfile      (client) — step 1 form
    │   ├── StepTools        (client) — step 2 checkbox grid + per-tool details
    │   ├── StepWishlist     (client) — step 3 open-ended questions
    │   └── StepReview       (client) — step 4 read-only summary
    └── dashboard/
        ├── StatCard
        ├── ToolBreakdownChart  (client, Recharts)
        ├── SatisfactionChart   (client, Recharts)
        ├── YearDistributionChart (client, Recharts)
        ├── ExamDistributionChart (client, Recharts)
        └── ResponseTable       (client) — paginated with expandable rows
```

---

## Package Dependency Chain

```
@sekel/survey (app)
  ├── @sekel/survey-components   — UI kit (no external deps beyond react/recharts/lucide)
  ├── @sekel/db                    — Supabase client factory + auth utils
  ├── @sekel/web-components        — (available but not imported yet)
  └── @supabase/supabase-js        — used directly only in server.ts for service-role client
```

`@sekel/db` is imported in two places:
1. `src/lib/supabase/client.ts` — calls `createSupabaseClient(url, anonKey)` for browser client
2. `src/app/dashboard/login/page.tsx` — imports `signIn` for the login form
