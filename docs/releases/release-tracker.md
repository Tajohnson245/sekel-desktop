# Release Tracker

Authoritative log of all per-app releases in the Sekel monorepo.
Update this file as part of every release (Step 3 of the release checklist).

---

## Tag Format Reference

| App | Tag Format | Release CI Workflow |
|-----|-----------|-------------------|
| desktop | `desktop/vX.X.X` | `.github/workflows/release.yml` |
| survey | `survey/vX.X.X` | `.github/workflows/release-survey.yml` |
| web | `web/vX.X.X` | _(workflow not yet created)_ |
| community | `community/vX.X.X` | _(workflow not yet created)_ |

> **Legacy note:** Global tags `v1.0.0–v1.4.0` predate per-app tagging and map to the desktop app. New desktop releases use `desktop/vX.X.X`.

---

## Desktop (`apps/desktop`)

Current stable: **v1.0.4** (tag `desktop/v1.0.4`)
Next release tag: `desktop/v1.0.5`

> Note: the desktop app was reset to v1.0.0 in commit `c350529` ("version 1 release") after the monorepo cleanup. Tags `v1.1.0`–`v1.8.0` below predate that reset and are kept as historical context.

| Version | Date | Tag | Key Changes |
|---------|------|-----|-------------|
| v1.0.4 | 2026-05-04 | `desktop/v1.0.4` | Custom in-app update modal with auto-generated release notes — replaces the stock Electron auto-update dialog; new `publish-notes` CI job publishes each release with `gh --generate-notes` (SEKEL-117) |
| v1.0.3 | _(2026-04+)_ | `desktop/v1.0.3` | macOS .dmg installer + install docs |
| v1.0.2 | _(2026-04+)_ | `desktop/v1.0.2` | Auto-updater 404 fix — RELEASES baseUrl missing /win32/x64 path |
| v1.0.1 | _(2026-04+)_ | `desktop/v1.0.1` | Bump to 1.0.1, drop "Anki but better" tagline |
| v1.0.0 | _(2026-04+)_ | `desktop/v1.0.0` | Version 1 release — fresh start after monorepo cleanup |
| v1.8.0 | 2026-03-23 | `desktop/v1.8.0`, `v1.8.0` | macOS Intel (x64) dual-arch CI build support, FORGE_ARCH env var for arch targeting (SEKEL-056) — pre-reset legacy lineage |
| v1.7.0 | 2026-03-23 | `v1.7.0` | Study session interactions (spacebar/click-to-flip), custom background image upload, card note image edit fix, session analytics scrollable (SEKEL-051–054) |
| v1.6.0 | 2026-03-23 | _(no tag — released by merge to main)_ | User feedback form in profile page (modal with area checkboxes, description, screenshot upload, desired fix), Supabase feedback table + storage bucket, study session layout improvements (SEKEL-049–050) |
| v1.5.3 | 2026-03-22 | `desktop/v1.5.3` | Fix images not rendering — DOMPurify was stripping sekel-media:// URLs |
| v1.5.2 | 2026-03-22 | `desktop/v1.5.2` | Rebrand to BYTEFLOW LLC, app icon for Windows/macOS installers, CircleCI .icns generation |
| v1.5.1 | 2026-03-22 | `desktop/v1.5.1` | Lazy-init OpenAI client to prevent startup crash when API key is absent, CI-embedded API key via env var |
| v1.5.0 | 2026-03-22 | `desktop/v1.5.0` | Toast notifications, DOMPurify sanitization, missing i18n translations (es/de/fr/zh), dynamic deck stats, desktop notifications, CircleCI artifact builds, Squirrel installer fix |
| v1.4.0 | 2026-03-13 | `v1.4.0` | Added community app, SQLite local-first architecture, Anki import file handling (.apkg), DB migrations for decks/notes/cards/reviews/media |
| v1.3.0 | 2026-03-11 | `v1.3.0` | Stylescape CSS added to shared components, desktop UI alignment |
| v1.2.0 | 2026-03-10 | `v1.2.0` | Mobile-responsive marketing site, Resend email integration |
| v1.1.0 | 2026-03-10 | `v1.1.0` | GitHub workflows skill, codebase cleanup |
| v1.0.0 | 2026-02-27 | `v1.0.0` | Initial release — Electron desktop app with Supabase auth |

---

## Survey (`apps/survey`)

Current stable: **unreleased** (package.json: `0.1.0`)
Next release tag: `survey/v1.0.0`

| Version | Date | Tag | Key Changes |
|---------|------|-----|-------------|
| _(unreleased)_ | — | — | Initial scaffold: 4-step public survey, admin dashboard with Supabase auth, `@sekel/survey-components` package, Docker support, CI/CD |

---

## Web (`apps/web`)

Current stable: **unreleased** (package.json: `1.4.0`)
Next release tag: `web/v1.0.0`

| Version | Date | Tag | Key Changes |
|---------|------|-----|-------------|
| _(unreleased)_ | — | — | Marketing site, previously versioned under global desktop tags |

---

## Community (`apps/community`)

Current stable: **unreleased** (package.json: `0.1.0`)
Next release tag: `community/v1.0.0`

| Version | Date | Tag | Key Changes |
|---------|------|-----|-------------|
| _(unreleased)_ | — | — | Community deck hub app (SEKEL-013) |

---

## How to Update This File

When cutting a release, add a new row to the relevant app table:

```markdown
| v1.5.0 | 2026-MM-DD | `desktop/v1.5.0` | Brief summary of key changes |
```

Update "Current stable" and "Next release tag" at the top of the section.
