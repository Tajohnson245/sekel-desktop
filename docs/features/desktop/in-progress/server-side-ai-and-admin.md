# Server-side AI and Admin
> Moves the app's OpenAI calls and the admin dashboard onto Supabase edge functions so the OpenAI key and the Supabase service-role key no longer ship inside the installer. Includes the key-rotation runbook to follow once the release is out.

---

**Status:** `In Progress`
**Target Version:** TBD
**Branch:** `SEKEL-154-server-side-ai-and-admin` (stacked on `SEKEL-146-supabase-security-hardening`; merge 146 first)
**Created:** 2026-11-10
**Last Updated:** 2026-11-10
**Shipped:** —

---

## Overview

Up to v2.0.0, `electron.vite.config.ts` inlined `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_EMAIL` into the main-process bundle, so anyone with an installer could read them. With the service-role key, anyone could read or change every user's data.

This branch removes all three from the build:
- **AI calls** (card generation, classification, document and image parsing) go to the `ai-proxy` edge function. It holds the OpenAI key, signs requests as the logged-in user and meters a daily allowance per user.
- **The admin dashboard** gets its data from the `admin` edge function. It runs with the service role on the server and only answers users with `app_metadata.role = 'admin'`.

Shipped clients (≤ v2.0.0) keep working with their built-in keys until the keys are rotated (see the runbook below).

## Architecture

```
apps/desktop/
├── src/main/ai/openaiClient.ts         OpenAI SDK → ai-proxy; custom fetch adds the user's access token
├── src/ipc/ai.ts, classify.ts,         use createProxiedOpenAI(); classify stops a batch early on
│   document_parsing.ts                   "signed out" / "daily limit reached"
├── src/lib/adminApi.ts                 supabase.functions.invoke('admin', …) + isAdminUser()
├── src/components/Admin/AdminDashboard.tsx, src/hooks/useIsAdmin.ts
├── electron.vite.config.ts             define: only VITE_SUPABASE_PROJECT_URL / VITE_SUPABASE_ANON_KEY
└── supabase/
    ├── functions/ai-proxy/index.ts     JWT-verified; validate → meter → forward to OpenAI → record tokens
    ├── functions/_shared/aiPolicy.ts   request rules + limits (pure TS; tested by vitest)
    ├── functions/admin/index.ts        JWT-verified + admin role; overview | users | userDetail | feedback
    └── migrations/
        ├── 20261110130000_ai_usage_daily.sql        ai_usage_daily + ai_usage_try_consume / ai_usage_record
        └── 20261110130100_admin_stats_functions.sql admin_user_stats / admin_review_activity /
                                                     admin_user_review_days / admin_deck_card_counts
```

- **Removed:** `src/ipc/admin.ts`, the `admin:*` and `obs:isAdmin` IPC channels, and the `OPENAI_API_KEY` / `OPENAI_MODEL` / `ADMIN_EMAIL` / `SUPABASE_SERVICE_ROLE_KEY` build env in `release.yml`.
- **Added:** `release.yml` `deploy-server` now also deploys `ai-proxy` and `admin`.

### ai-proxy limits (function secrets, all optional)

| Secret | Default | Meaning |
|---|---|---|
| `AI_DAILY_REQUEST_LIMIT` | 4000 | requests per user per UTC day |
| `AI_DAILY_TOKEN_LIMIT` | 8,000,000 | prompt + completion tokens per user per UTC day |
| `AI_MAX_OUTPUT_TOKENS` | 16,384 | cap on `max_tokens`; also the default when the app sends none |
| `AI_ALLOWED_MODELS` | `gpt-4.1-mini,gpt-4o-mini,gpt-4o` | models the app may request |

To change one: `npx --yes supabase@2.122.1 secrets set AI_DAILY_REQUEST_LIMIT=6000 --project-ref uawkoueqectmkiyjcrtb`.

The proxy refuses streaming, tools, audio, remote image URLs, `n > 1` and any unknown parameter.

## Before the release

1. `OPENAI_API_KEY` is set as a function secret on prod and dev. Check with `npm run secrets:list:prod` (lists names only).
2. Your admin account has `raw_app_meta_data.role = 'admin'` on prod.
3. Merge order: 146 first, then this branch.
   - Merging SEKEL-141 alongside it conflicts in `src/main.ts` on the `obs:isAdmin` handler. Resolve by deleting that handler.

Tested on dev (2026-11-10), with a temporary test user that was deleted afterwards:
- **Auth and validation:** requests without a token get 401; streaming and unknown models get 400.
- **Real requests:** text and image requests through the SDK work, and their tokens are recorded in `ai_usage_daily`.
- **Daily limit:** returns 429 with `x-should-retry: false`.
- **Admin access:** a non-admin gets 403; the admin overview, users, user detail and feedback all return 200.
- **Privileges:** anon and authenticated can't read the table or execute the functions.

## After the release: rotate the leaked keys

Do this once most users have auto-updated. Old versions keep using the built-in keys until then, and rotating cuts them off.

1. **OpenAI:** at platform.openai.com → API keys, revoke the old key that shipped in ≤ v2.0.0. Keep the `sekel-server` key that the edge functions use.
2. **GitHub secrets:** delete `OPENAI_API_KEY`, `OPENAI_MODEL` and `ADMIN_EMAIL`, which the build no longer uses.
3. **Supabase service-role key:** the legacy `service_role` key can only be turned off together with the legacy `anon` key ("Disable legacy API keys"). That means:
   1. Set the GitHub secret `VITE_SUPABASE_ANON_KEY` to the new `sb_publishable_…` key and ship a release.
   2. Switch the edge functions from `SUPABASE_SERVICE_ROLE_KEY` to the new secret key (`SUPABASE_SECRET_KEYS`). This is a code change; test it on dev first.
   3. Set the GitHub secret `SUPABASE_SERVICE_ROLE_KEY` (used by blueprint seeding in `deploy-server`) to the new `sb_secret_…` key.
   4. Once the publishable-key release is widely installed, disable the legacy API keys in Dashboard → Settings → API Keys.
4. After step 3, the old `service_role` key in old installers stops working.

## Key Decisions

1. **OpenAI-compatible proxy, not one function per AI task.** The prompts stay in the desktop code and the SDK is pointed at the proxy with a custom `fetch`. The cost limits are enforced server-side by a strict request allowlist plus per-user daily metering.
2. **User token from the existing session push.** The renderer already pushes its Supabase session to main on sign-in and on every refresh (for cloud backup). The proxy client reads it fresh for each request and retries a 401 once if a newer token has arrived.
3. **`x-should-retry: false` on proxy refusals.** Without it the OpenAI SDK would retry daily-limit 429s and signed-out 401s up to `maxRetries` times. OpenAI's own rate-limit 429s are passed through unchanged, so the SDK still backs off and retries those.
4. **Fail closed.** If the usage counter can't be reached, the proxy returns 503 rather than forwarding the request unmetered.
5. **Admin role in `app_metadata`, not an email in the build.** Users can't change `app_metadata`. The renderer check only decides what UI to show; the function re-checks on every call.
6. **Counting in SQL.** The admin queries moved to SQL functions. This avoids four requests per user, which would time out on edge functions, and the 1000-row PostgREST cap that silently truncated the old 30-day charts.
7. **Fixed model names in code.** `OPENAI_MODEL` is no longer a build variable. Which models are allowed is now controlled by the server's `AI_ALLOWED_MODELS`.

## Known Limitations / Future Work

- **Classification is one request per card** and carries the whole blueprint each time. A large Anki import can use up the 4000-request daily allowance. The batch then stops early, and the remaining cards are classified when the user re-runs Classify in Profile → Study, which skips already-classified cards. Batching several cards per request would cut cost and request count a lot.
- **Usage day:** usage resets at midnight UTC, not local time.
- **Edge functions still use the legacy `SUPABASE_SERVICE_ROLE_KEY` env var.** See rotation step 3.2.
- **Dev project migration history has drifted:** five remote-only versions and `20260512120000` never applied. This branch's two migrations were applied to dev directly with `db query`; they are idempotent, so a later `db push` is safe. Prod history matches the repo.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-11-10 | Created; edge functions verified end-to-end on dev |
