# GitHub Actions CI/CD
> CI and release pipeline for the Sekel monorepo — all workflows, secrets, and the desktop auto-update delivery chain.

---

## Overview

Sekel uses GitHub Actions for all CI and release automation. Five workflow files live in `.github/workflows/`. The desktop app is the most complex: it builds 4 platform/arch combinations, validates the version before publishing, and uploads artifacts to Cloudflare R2 for auto-update delivery.

## Architecture

```
.github/workflows/
├── release.yml          — Desktop multi-platform build + publish (triggered by desktop/v*.*.* tag)
├── bump-version.yml     — Version bump helper (manual trigger)
├── version-check.yml    — PR gate: enforces version bump before merge
├── release-survey.yml   — Survey app release (triggered by survey/v*.*.* tag)
└── release-webapps.yml  — Web + Community app release (triggered by web/v*.*.* or community/v*.*.* tag)
```

## Key Decisions

1. **`fail-fast: false` on the desktop matrix** — all 4 platform builds run to completion even if one fails, so a macOS-only issue doesn't block the Windows artifact.

2. **FORGE_ARCH env var (not CLI arg)** — Electron Forge reads the target arch from `FORGE_ARCH` rather than a `--arch` CLI flag. This was required after the v1.8.0 CI fix (SEKEL-056); the CLI arg caused inconsistent behavior on the macOS matrix.

3. **Version validated before build** — the release workflow extracts the version from the git tag and checks it against `scripts/version.json` and all `package.json` files via `node scripts/bump.js --check`. A tag/version mismatch aborts the build before any compilation happens.

4. **Rollup native binary workaround** — the lock file is generated on Windows, which omits platform-specific rollup binaries for macOS/Linux runners. Each non-Windows build step explicitly runs `npm install --no-save rollup` before building.

5. **`better-sqlite3` is rebuilt per platform** — the native addon must be compiled against Electron's Node ABI. The Electron Forge preStart hook handles this locally; CI gets it via the Forge `publish` command which packages the app fresh per platform.

## Desktop Release Matrix

| Runner | Arch | Output |
|--------|------|--------|
| `windows-latest` | x64 | Windows installer (.exe / Squirrel) |
| `macos-latest` | arm64 | macOS Apple Silicon .dmg |
| `macos-latest` | x64 | macOS Intel .dmg |
| `ubuntu-latest` | x64 | Linux .deb / .rpm |

Trigger: push to a tag matching `desktop/v*.*.*`

## Required GitHub Secrets

| Secret | Used by |
|--------|---------|
| `VITE_SUPABASE_PROJECT_URL` | Desktop build (baked in via Vite at compile time) |
| `VITE_SUPABASE_ANON_KEY` | Desktop build (baked in via Vite at compile time) |
| `CF_R2_ACCESS_KEY_ID` | Publish step — uploads artifacts to Cloudflare R2 |
| `CF_R2_SECRET_ACCESS_KEY` | Publish step — uploads artifacts to Cloudflare R2 |
| `GITHUB_TOKEN` | Auto-provided — creates the GitHub Release and uploads release assets |

Note: `OPENAI_API_KEY` is **not** baked into the build. It is entered by the user at runtime and stored locally.

## Auto-Update Delivery

Artifacts published to Cloudflare R2 are served via `update-electron-app` in the packaged desktop app. The updater polls `https://pub-1dd00656fa304302a2db06169963ac20.r2.dev` every 1 hour. When a new release is detected, users see a native OS notification prompting a restart to install.

## Version Check (PR Gate)

`version-check.yml` runs on every PR and fails if `scripts/version.json` and the relevant `package.json` files are out of sync. This enforces the rule: every PR that ships user-facing changes must include a version bump. See `automated-versioning.md` for the full versioning system.

## Known Limitations / Future Work

- Web and Community release workflows (`release-webapps.yml`) are not yet wired to CI deployment targets — they build the apps but do not deploy to hosting.
- No E2E tests run in CI currently; Playwright tests require a display server and a packaged Electron binary, which adds significant setup complexity.
- No path filtering — all release workflows trigger on any matching tag regardless of which files changed. Turborepo's remote caching mitigates redundant work but the workflow still starts.
