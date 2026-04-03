# Automated Versioning
> Centralized version management for the Sekel monorepo — bump, validate, and release any app with a single command or one click from the GitHub UI.

---

## Overview

Each app in the Sekel monorepo versions independently. A central `scripts/version.json` file is the single source of truth for all app versions. The `scripts/bump.js` script keeps every `package.json` in sync with that file, and CI workflows validate consistency on every PR and block releases if versions don't match.

This system was inspired by [hcengineering/platform](https://github.com/hcengineering/platform) (Huly), which uses a similar pattern of a central version file + bump script + CI validation.

## Architecture

```
scripts/
├── version.json          — single source of truth for per-app versions
└── bump.js               — CLI to bump, validate, and inspect versions

.github/workflows/
├── bump-version.yml      — one-click release trigger (workflow_dispatch)
├── version-check.yml     — PR validation (runs on package.json / version.json changes)
├── release.yml           — desktop release (validates version before building)
├── release-survey.yml    — survey release (validates version before building)
└── release-webapps.yml   — web + community release (validates version before building)
```

### App-to-Package Mapping

Each app is versioned together with its owned packages. When you bump an app, all of these update together:

| App | Packages versioned together |
|-----|----------------------------|
| `desktop` | `apps/desktop`, `packages/components`, `packages/db` |
| `web` | `apps/web`, `packages/web-components` |
| `community` | `apps/community`, `packages/community-components` |
| `survey` | `apps/survey`, `packages/survey-components` |

Cross-references (e.g., `@sekel/db` in `apps/web/package.json`) are also updated automatically, preserving any range prefix (`^`, `~`, etc.).

## Usage

### Check current versions

```bash
npm run version:status
```

Shows each app's version from `version.json` and whether every related `package.json` matches.

### Bump a version locally

```bash
npm run bump -- desktop 1.5.0
```

This updates:
1. `scripts/version.json` — sets `desktop` to `1.5.0`
2. `apps/desktop/package.json` — sets `version` to `1.5.0`
3. `packages/components/package.json` — sets `version` to `1.5.0`
4. `packages/db/package.json` — sets `version` to `1.5.0`
5. Any other package that depends on `@sekel/desktop`, `@sekel/components`, or `@sekel/db` — updates the dependency version

### Validate versions

```bash
npm run version:check
```

Exits with code 0 if all `package.json` versions match `version.json`, or code 1 with details on mismatches. This is what CI runs on every PR.

### One-click release (GitHub UI)

1. Go to **Actions** > **Bump Version**
2. Click **Run workflow**
3. Select the app (`desktop`, `web`, `community`, `survey`)
4. Enter the new version (e.g., `1.5.0`)
5. Click **Run workflow**

CI will:
1. Run `bump.js` to update all files
2. Validate with `--check`
3. Commit: `chore(desktop): bump version to 1.5.0`
4. Create annotated tag: `desktop/v1.5.0`
5. Push commit and tag — which triggers the existing release workflow for that app

### Manual release (CLI)

```bash
# 1. Bump
npm run bump -- desktop 1.5.0

# 2. Commit
git add -A
git commit -m "chore(desktop): bump version to 1.5.0"

# 3. Tag and push
git tag -a desktop/v1.5.0 -m "Release desktop v1.5.0"
git push origin main
git push origin desktop/v1.5.0
```

## CI Workflows

### `version-check.yml` — PR Validation

Triggers on pull requests that modify `scripts/version.json` or any `package.json`. Runs `bump.js --check` to ensure versions are consistent. Blocks merge if there's a mismatch.

### `bump-version.yml` — One-Click Release

Manual trigger (`workflow_dispatch`) with two inputs: app and version. Bumps, commits, tags, and pushes — kicking off the release pipeline automatically.

### Release Workflows — Version Gate

Each release workflow (`release.yml`, `release-survey.yml`, `release-webapps.yml`) validates that the git tag version matches `version.json` before building. If someone pushes a tag without bumping `version.json` first, the release fails fast with a clear error.

## Key Decisions

1. **JSON over plain text for version file** — unlike Huly's single `version.txt`, we use `version.json` because the monorepo has multiple independently-versioned apps. JSON maps app names to versions cleanly.

2. **Per-app package grouping** — shared packages version with their parent app rather than independently. This keeps the version matrix small and avoids confusing mismatches between an app and its UI kit.

3. **Validation at two gates** — versions are checked both on PR (catch mistakes early) and at release time (block bad tags). Belt and suspenders.

4. **No build step required for validation** — `bump.js` is plain Node.js with zero dependencies. CI doesn't need `npm ci` to run the check.

## Known Limitations / Future Work

- **No automatic version inference** — you must decide the version number yourself. A future enhancement could analyze commit history (conventional commits) to suggest major/minor/patch.
- **No changelog generation** — version bumps don't auto-generate a CHANGELOG. GitHub's release notes (`generate_release_notes: true`) partially fill this gap for tagged releases.
- **Package grouping is hardcoded** — the app-to-package mapping lives in `bump.js`. If a new package is added, the `APP_PACKAGES` map must be updated manually.
