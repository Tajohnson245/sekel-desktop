# Feedback Discord Webhook

---

**Status:** `In Progress`
**Target Version:** `desktop/v1.0.7` | TBD
**Branch:** `SEKEL-122-feedback-discord-webhook`
**Created:** 2026-05-08
**Last Updated:** 2026-05-08
**Shipped:** —

---

## Overview

Routes every feedback submission from `public.feedback` into a Discord channel via a Supabase Edge Function. Each submission is rendered as a color-coded embed showing every field the form captures plus the submitter's email, so the team can triage without opening Supabase. Active in dev and production.

## Architecture

```
User submits feedback (FeedbackSection.tsx)
        │
        ▼
INSERT into public.feedback  ──►  ticket_number bigserial assigns Feedback-NNN
        │
        ▼
Supabase Database Webhook (configured per project in dashboard)
        │  POST + x-webhook-secret header
        ▼
Edge Function: feedback-discord
  - verifies x-webhook-secret matches WEBHOOK_SECRET env
  - looks up submitter email via SERVICE_ROLE
  - builds embed (color by type, all form fields, screenshot inline)
  - POSTs to DISCORD_FEEDBACK_BOT_WEBHOOK_URL
        │
        ▼
Discord channel
```

Key files:

- `apps/desktop/supabase/migrations/20260508120000_add_feedback_ticket_number.sql` — adds `ticket_number bigserial`
- `apps/desktop/supabase/functions/feedback-discord/index.ts` — edge function
- `packages/db/src/types.ts` — `Feedback.ticket_number` added; excluded from `FeedbackInsert`
- `apps/desktop/package.json` — env-specific npm scripts (`db:push:dev|prod`, `secrets:set:dev|prod`, `functions:deploy:dev|prod`, `secrets:list:dev|prod`)
- `CLAUDE.md` — Feedback-NNN convention recorded

## Key Decisions

1. **Edge Function in the middle, not direct DB-webhook → Discord** — Discord requires a specific `{ embeds: [...] }` payload shape; raw Supabase row data won't render. The function also keeps the Discord URL in a secret rather than dashboard config and lets us look up the submitter email.
2. **Shared-secret header (`x-webhook-secret`) instead of JWT verification** — The function is internal-only (called by the project's own DB webhook). JWT verification is disabled (`--no-verify-jwt`) and replaced with a shared secret matched in code, which keeps deploy simpler than rotating service-role JWTs.
3. **`ticket_number bigserial` for human-friendly IDs** — Sequential `Feedback-NNN` is friendlier to skim than a UUID. The sequence is the source of truth; the app does no client-side counting.
4. **Show email by service-role lookup, not denormalized into `feedback`** — Keeps the table clean and avoids stale-email bugs if the user changes their address.
5. **Deployed to dev *and* prod from day one** — End-to-end can be verified in dev before any real user submits in prod, but prod is wired so we don't forget at release time.

## Known Limitations / Future Work

- Discord rate limit (30 messages/min per webhook) is far above expected feedback volume; not addressed.
- No retry on Discord 5xx — a non-2xx is logged and the function returns 500 so Supabase's webhook retries. Worth verifying retry policy is enabled in the dashboard.
- Edge Function failures don't currently page Sentry — feedback rows still land in `public.feedback`, so visibility loss is recoverable. If we start losing notifications silently, consider wiring Sentry to the function.
- The Discord channel is world-readable to the webhook URL holder. URL is stored as a Supabase secret, not in code or config.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-05-08 | Doc created. Migration, edge function, env-specific npm scripts, CLAUDE.md Feedback-NNN convention. |
| 2026-05-08 | apps/desktop/package.json |
| 2026-05-08 | Task completed |
| 2026-05-08 | Task completed |
| 2026-05-08 | CLAUDE.md |
| 2026-05-08 | Task completed |
