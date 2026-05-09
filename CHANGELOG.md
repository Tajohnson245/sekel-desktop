# Changelog

All notable changes to the Sekel desktop app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning note.** Entries `[1.0.0]` through `[1.3.0]` below reflect an earlier monorepo-wide versioning scheme (`v<X.Y.Z>` tags). The desktop app is now versioned independently under `desktop/v<X.Y.Z>` — see GitHub Releases for the auto-generated notes covering `desktop/v1.0.0` through `desktop/v1.0.6`. Going forward, every release branch must prepend a section here under the new version before triggering Bump Version.

> **Authoring note.** The `## [X.Y.Z]` section becomes the **end-user release notes** — the desktop auto-update modal mirrors the matching section from this file to R2 and renders it as markdown. Write entries for the user, not for engineers: lead with the user-visible behaviour, skip ticket numbers and file paths, and save the engineering-jargon version for the GitHub Release page (which still uses GitHub's auto-generated PR list).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

### Security

## [1.0.9] - 2026-05-09

### Changed
- **Cleaner update notifications.** When a new version is ready, the "Update available" prompt now shows a properly formatted summary of what's new — with sections, lists, and clickable links — instead of a wall of PR titles. Links open in your default browser.

## [1.0.8] - 2026-05-09

### Added
- **NAPLEX content blueprint** — NABP's North American Pharmacist Licensure Examination (May 2025 outline) seeded as a new exam. 5 domains with explicit weights (25/25/40/5/5), 54 leaf topics covering every sub-subdomain. The 3-level outline (`domain.subdomain_letter.sub_subdomain_number`) folds into the existing 2-level system→topic schema by encoding the subdomain letter into `topic_key` (e.g. `A.1`, `B.2`) — no migration required. Seeded into both Supabase and local SQLite; existing users pick it up on their next launch via the per-exam_key seed gate. (SEKEL-124)
- **Auto-seed blueprints in release CI** — `release.yml`'s `deploy-server` job now runs `npx tsx scripts/seed-blueprints-supabase.ts` against prod after migrations succeed. Idempotent upsert; eliminates the dev/prod blueprint drift that had silently accumulated since SEKEL-106 (only the developer's local Supabase project ever got the seeds, prod stayed empty). Reuses existing `VITE_SUPABASE_PROJECT_URL` and `SUPABASE_SERVICE_ROLE_KEY` GitHub secrets — no new secrets required. (SEKEL-124)
- **Sekel logo in app header** — replaced the `<h1>SEKEL</h1>` wordmark with the actual app icon at 36px (30px under 760px viewports). (SEKEL-123)

### Changed
- **Exam picker uses a grid layout** — switched from a vertical column to an auto-fill grid (`minmax(220px, 1fr)`) so the 13 exam options fit in 2–3 columns instead of a long scroll. Same component is used by the deck-selection step, which inherits the same improvement. (SEKEL-123)

### Fixed
- **Modals fit under the navbar at any zoom level** — `.modal-overlay` is now anchored at `top: var(--header-height)` with `overflow: hidden` and `box-sizing: border-box`; `.modal` uses `max-height: 100%` against the overlay's content box instead of a `100vh` calc. The previous calc could let the modal escape behind the navbar when the user zoomed in via Ctrl+. New `--header-height` CSS variable on `:root` is the single source of truth for both the header and the modal offset. (SEKEL-123)
- **Blueprint seeder accepts the actual env-var name used in this repo** — `_seed.ts` falls back to `VITE_SUPABASE_PROJECT_URL` when `SUPABASE_URL` isn't set. Aligns the seeder with the convention used by every other Supabase consumer (electron-vite config, the desktop client, GitHub workflow secrets). (SEKEL-124)
- **Restored `scripts/seed-blueprints-supabase.ts`** — runner script was deleted in the 2026-04-21 cleanup commit (which removed `apps/community/`, `apps/survey/`, and `.circleci/`), but every blueprint file's docstring and the `create_blueprint_tables` migration still referenced it. Restored verbatim from the original commit (`0ae6f2b`). (SEKEL-124)

## [1.0.7] - 2026-05-08

### Added
- **Sentry observability** — Sentry Electron SDK initialised in main, preload, and renderer processes, tagged with `environment` (production/development) and `release` (app version). User context set on auth so events can be traced to a submitter without joining tables. (SEKEL-120)
- **Feedback form triage** — feedback form now captures a feedback `type` (bug / feature_request / question / other), a short `summary` (≤120 chars), and the app version automatically. OS is detected from `process.platform` rather than typed by the user. Submission failures are captured to Sentry with `feature: feedback` tag. (SEKEL-121)
- **Feedback → Discord pipeline** — every feedback INSERT fires a Supabase Edge Function (`feedback-discord`) that posts a color-coded embed to a Discord channel. Embed includes summary, type, areas, OS, app version, full description, desired fix, screenshot (inline), submitter email (looked up via service role), and a sequential `Feedback-NNN` ticket ID. Auth is via shared `x-webhook-secret` header. (SEKEL-122)
- **Sequential feedback IDs** — `ticket_number bigserial` column on `public.feedback` produces human-friendly `Feedback-001`-style IDs surfaced in Discord and reusable for any future triage workflow. (SEKEL-122)
- **Server-side release deploy in CI** — `release.yml` now runs a `deploy-server` job before the matrix build that applies pending prod migrations and redeploys edge functions. The matrix build is gated via `needs:` so a release never ships a client without the matching schema. Required GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_DB_PASSWORD`. (SEKEL-122)
- **Repo conventions captured in `CLAUDE.md`** — full development & release flow, branch naming, server-vs-client drift caveat, and Feedback-NNN convention recorded so they survive across sessions. (SEKEL-122)
- **Env-specific Supabase npm scripts** — `link:dev|prod`, `db:push:dev|prod`, `secrets:list|set:dev|prod`, `functions:deploy:dev|prod` — no more passing `--project-ref` by hand for routine deploys. (SEKEL-122)

### Changed
- **GitHub Workflows skill** rewritten to enforce the actual repo branch convention `SEKEL-<NNN>-<description>` instead of the generic `feature/`, `fix/`, etc. type prefixes. `release-checklist.md` rewritten as Sekel-specific (cut from dev, Bump Version on the release branch, back-merge to dev, delete). (SEKEL-122)
- **Feedback form copy** reworded for clarity; SEKEL casing standardised. (SEKEL-121)

### Fixed
- **`db:push:dev|prod` npm scripts** now use `link + db push --linked` instead of passing `--project-ref` to `db push` (the CLI rejects that flag on this subcommand). (SEKEL-122)

## [1.3.0] - 2026-03-11

### Added
- Stylescape design token CSS layer (`packages/components/src/components.css`) with full INK surface palette, teal/amber/rose/violet accent system, Outfit/DM Mono/DM Serif Display typography, spacing scale, and backward-compat aliases
- Per-component CSS files for all shared UI components: Button, Input, Select, Modal, Loader, Icons
- Per-component CSS files for all shared chart components: RetentionTrendChart, RatingDistributionChart, LapseStatsChart, ReviewHeatmap
- `style` and `./style` export added to `@sekel/components` package.json for explicit CSS consumers

### Changed
- Desktop app `index.css` `:root` block fully replaced with Stylescape tokens; backward-compat aliases keep unmigrated component files working
- Desktop logo switches from blue→cyan gradient to DM Serif Display in plain fog color
- Nav hover/active state changes from hardcoded blue to `var(--teal-soft)` / `var(--teal)`
- Rating buttons rewritten to ROSE/AMBER/TEAL/VIOLET `data-rating` attribute system — removes hardcoded hex colors and `--rating-color` inline style pattern
- `Auth.css` danger states migrated from `color-mix()` / hardcoded red to `var(--rose)` / `var(--rose-soft)`
- `Dashboard.css` heatmap cells migrated from `var(--primary)` to `var(--teal)` opacity steps; orphan vars (`--card`, `--foreground`, `--muted-foreground`) replaced with Stylescape equivalents
- `StudySession.css` analytics chart background and lapse rate display updated to Stylescape tokens
- Desktop `index.html` CSP updated to allow Google Fonts; preconnect and font link tags added
- `RatingButtons.tsx` updated to emit `data-rating` attribute instead of inline `--rating-color` custom property

## [1.2.0] - 2026-03-11

### Added
- Marketing site mobile responsiveness across all sections

## [1.1.0] - 2026-02-28

### Added
- Resend waitlist API integration
- `/privacy` and `/terms` legal pages
- Footer links updated

### Fixed
- Vercel build: lazy Resend init, turbo `passThroughEnv`, zod v4 email validation
- Navbar display in light mode

## [1.0.0] - 2026-02-01

### Added
- Initial monorepo setup with Turborepo and npm workspaces
- `@sekel/desktop` — Electron + Vite + React app with FSRS-based flashcard study sessions
- `@sekel/web` — Next.js marketing site
- `@sekel/db` — Shared Supabase client package
- Supabase authentication (login, signup, protected routes)
- Deck management (create, edit, delete decks and cards)
- AI card generation via OpenAI SDK
- Image occlusion editor
- Study session with spaced repetition (ts-fsrs)
- Session analytics: retention trend, rating distribution, lapse stats, review heatmap
- Rich text card editor (Quill)
- Draft tray for unsaved cards
- Theme provider (dark/light mode)

[Unreleased]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Tajohnson245/sekel-desktop/releases/tag/v1.0.0
