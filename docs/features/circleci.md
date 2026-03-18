# CircleCI
> Documents the CircleCI pipeline setup for the Sekel monorepo — what pipelines exist, how they're triggered, and why certain configuration decisions were made.

---

## Overview

Sekel uses CircleCI as its CI provider with a pipeline-per-app, trigger-split approach. Each of the four apps (`desktop`, `web`, `survey`, `community`) has two dedicated pipelines: one for push events and one for PR events. Config files live in `.circleci/` at the repo root and are pointed to by CircleCI pipelines configured in the UI.

CircleCI was chosen over GitHub Actions to take advantage of its more granular pipeline control, separate config files per app, and better support for Windows and macOS build executors.

---

## Architecture

```
.circleci/
├── ci-desktop-pr.yml    — desktop: lint, unit tests, 3-platform build (PR trigger)
├── ci-desktop-push.yml  — desktop: lint, unit tests, 3-platform build (push to main/dev)
├── ci-web-pr.yml        — web: lint, typecheck, build (PR trigger)
├── ci-web-push.yml      — web: lint, typecheck, build (push to main/dev, branch filter)
├── ci-survey-pr.yml     — survey: lint, typecheck, build (PR trigger)
├── ci-survey-push.yml   — survey: lint, typecheck, build (push to main/dev, branch filter)
├── ci-community-pr.yml  — community: lint, typecheck, build (PR trigger)
└── ci-community-push.yml — community: lint, typecheck, build (push to main/dev, branch filter)
```

Each config file corresponds to a named pipeline in the CircleCI UI. Pipelines are configured with GitHub App triggers pointing to their respective config file paths.

---

## Trigger Strategy

CircleCI's GitHub trigger does not support path filtering, so the push/PR split is handled by creating two separate pipelines per app rather than one pipeline with conditional logic.

| Pipeline suffix | CircleCI trigger | Branch filter |
|---|---|---|
| `-push` | All pushes | `main` and `dev` only (enforced in workflow `filters`) |
| `-pr` | Pushes to open non-draft PRs | None — PR trigger scopes it |

Branch filtering for push pipelines is done inside the YAML workflow block, not in the CircleCI UI, because the UI trigger does not support per-branch filtering.

---

## Per-App Breakdown

### desktop (`ci-desktop-*.yml`)

The most complex pipeline. Jobs fan out after `lint-typecheck`:

```
lint-typecheck
├── unit-tests        (Linux)
├── build-linux       (Linux, cimg/node:22.13)
├── build-windows     (windows-server-2022-gui, windows.medium)
└── build-macos       (macOS M1, macos.m1.medium.gen1)
```

Uses three executor types:
- **Linux**: `cimg/node:22.13` Docker image
- **Windows**: `circleci/windows@5.0` orb, `windows-server-2022-gui:current`, `windows.medium` resource class
- **macOS**: `macos` executor, Xcode 15.4.0, `macos.m1.medium.gen1` resource class

### web, survey, community (`ci-{app}-*.yml`)

Simpler pipeline — lint, typecheck, build in sequence on a single Linux executor (`cimg/node:20.18`).

---

## Key Decisions

1. **One config file per app, not a single `config.yml`** — CircleCI supports multiple pipeline configs per repo. Splitting by app keeps each config focused, avoids conditional logic, and means a web change doesn't queue a desktop build.

2. **Node 22 for desktop, Node 20 for web/survey/community** — Vite 7 (used by the desktop app) is ESM-only and `@electron-forge/plugin-vite` uses `require()` to load it. Node 22.12+ supports `require()` of synchronous ES modules natively. Node 20 does not, causing `ERR_REQUIRE_ESM` failures. Web/survey/community use Next.js which is compatible with Node 20.

3. **Rollup native binary install in unit-tests and build jobs** — `vitest` and `electron-forge` both pull in `rolldown`, which ships platform-specific native bindings as optional dependencies. npm's optional dependency resolution has a known bug ([npm#4828](https://github.com/npm/cli/issues/4828)) where the correct platform binding isn't installed in CI. Adding `npm install --no-save rollup` inside `apps/desktop` before running tests or building resolves this.

4. **`resource_class: windows.medium` required explicitly** — CircleCI rejects Windows machine executors without an explicit `resource_class`. The default resource class is not valid for Windows images; `windows.medium` (4 vCPUs, 15 GB RAM) must be specified.

5. **`better-sqlite3` rebuild in unit-tests** — `better-sqlite3` is a native Node addon compiled for Electron's Node version. The unit-test job runs under system Node (not Electron), so the addon must be rebuilt with `npm rebuild better-sqlite3` before tests run.

---

## Known Limitations / Future Work

- **macOS runners are expensive** — `macos.m1.medium.gen1` consumes significant CircleCI credits. If cost becomes a concern, `build-macos` can be removed from the PR pipeline and only run on pushes to `main`.
- **No path filtering** — All pipelines run on any push to `main`/`dev` regardless of which files changed. Turborepo's remote caching mitigates this (unchanged packages are skipped), but the pipeline still starts.
- **Windows Node installation** — The Windows build job installs Node via the `circleci/node` orb. If orb versioning causes issues, pin the orb version explicitly in the config.
- **`VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_ANON_KEY`** — These must be set as CircleCI environment variables for the desktop build jobs to succeed. They are not currently set as secrets in the pipeline config.
