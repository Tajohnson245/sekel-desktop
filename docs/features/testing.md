# Testing
> Documents the testing strategy, tooling, and step-by-step instructions for the Sekel monorepo — covering unit, component, E2E, and CI layers.

---

## Overview

The desktop app (`@sekel/desktop`) had zero test coverage before this implementation. Testing is now split across four layers that balance speed, confidence, and maintainability. Unit and component tests use Vitest and run in milliseconds with no Electron process. E2E tests use Playwright's experimental Electron support to launch the real app and test integration points. A GitHub Actions pipeline runs unit tests on every push and E2E tests on pull requests.

---

## Architecture

```
sekel-monorepo/
├── apps/desktop/
│   ├── vitest.config.ts              — Unit test config (node env, no DOM)
│   ├── playwright.config.ts          — E2E config (Electron mode, workers: 1)
│   ├── src/
│   │   └── __tests__/
│   │       ├── fsrs.test.ts          — FSRS algorithm unit tests (21 tests)
│   │       └── db.service.test.ts    — SQLite service unit tests (31 tests)
│   └── e2e/
│       ├── fixtures.ts               — Shared _electron.launch() helper
│       └── app-launch.spec.ts        — App boot smoke tests
└── packages/components/
    ├── vitest.config.ts              — Component test config (jsdom + React)
    └── src/
        ├── test-setup.ts             — jest-dom matchers + react-i18next mock
        └── __tests__/
            ├── Button.test.tsx       — (9 tests)
            ├── Modal.test.tsx        — (8 tests)
            ├── Input.test.tsx        — (8 tests)
            └── Select.test.tsx       — (7 tests)
```

**CI:** `.github/workflows/ci-desktop.yml` — `unit-tests` job (every push) and `e2e` job (PRs only).

---

## Running Tests

### Prerequisites

```bash
# From the repo root — only needed once, or after `npm run build` changes the native ABI
npm rebuild better-sqlite3
```

> **Why:** `better-sqlite3` is a native module. `electron-forge package` rebuilds it for Electron's Node ABI. Vitest runs on the system Node.js, which uses a different ABI. Run `npm rebuild better-sqlite3` whenever you switch between running the app and running tests.

---

### 1. Unit Tests — FSRS logic + SQLite service

Tests pure functions and database queries using a real in-memory SQLite database. No Electron process. Runs in ~300ms.

```bash
# From repo root
npx turbo run test:unit --filter=@sekel/desktop

# Or from the desktop app directory
cd apps/desktop
npm run test:unit

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
```

**What's covered:**
- `src/lib/fsrs.ts` — `scheduleCard`, `getSchedulingOptions`, `getRetrievability`, `createInitialCardState`, `formatInterval`
- `src/main/db/service.ts` — deck CRUD, deck stats, note/card creation, review insertion, session analytics, review history grouping, drafts, user profiles, sync metadata

---

### 2. Component Tests — React UI components

Tests `@sekel/components` in a jsdom environment using React Testing Library. No browser or Electron needed. Runs in ~1.5s.

```bash
# From repo root
npx turbo run test --filter=@sekel/components

# Or from the package directory
cd packages/components
npm run test

# Watch mode
npm run test:watch
```

**What's covered:**
- `Button` — renders, onClick, disabled, isLoading, variants, fullWidth
- `Modal` — open/close, overlay click, Escape key, footer, accessibility roles
- `Input` — text/textarea, label, error state, onChange, placeholder
- `Select` — options, placeholder, label, error, onChange, value selection

---

### 3. E2E Tests — Full Electron app (Playwright)

Launches the real Electron app via `_electron.launch()` and interacts with it as a user would. Requires a pre-built app.

#### Step 1: Build the app

```bash
# From repo root (first time, or after source changes)
npx turbo run build --filter=@sekel/desktop
```

This creates `.vite/build/main.js` — the entry point Playwright uses to launch the app.

#### Step 2: Run E2E tests

```bash
cd apps/desktop
npm run test:e2e

# With Playwright's interactive UI (shows browser/Electron window)
npm run test:e2e:ui
```

**On Windows:** No virtual display needed — Electron runs natively.

**On Linux/macOS CI:** Electron requires a display server. The CI pipeline wraps the command with `xvfb-run --auto-servernum --`. See [CI section](#ci-pipeline) below.

**What's covered:**
- `app-launch.spec.ts` — app boots without crash, window is visible, dimensions are valid

> **Tip:** You only need to rebuild if source files change. Re-running `npm run test:e2e` repeatedly after a single build is fast — the app binary is already on disk.

---

### 4. All Tests at Once

```bash
# From repo root — runs unit + component tests in parallel via Turborepo
npx turbo run test:unit --filter=@sekel/desktop
npx turbo run test --filter=@sekel/components

# Or run everything sequentially
cd apps/desktop && npm run test
cd ../../packages/components && npm run test
```

---

## CI Pipeline

Defined in `.github/workflows/ci-desktop.yml`.

| Job | Trigger | Runs on | What it does |
|---|---|---|---|
| `lint` | push + PR to `main`/`dev` | ubuntu-latest | ESLint + TypeScript type check |
| `unit-tests` | push + PR to `main`/`dev` | ubuntu-latest | Vitest unit + component tests; rebuilds `better-sqlite3` for Node |
| `e2e` | PR to `main`/`dev` only | ubuntu-latest | Builds app, runs Playwright with `xvfb-run` |
| `build` | push + PR to `main`/`dev` | Windows, macOS, Linux | `electron-forge package` on all three platforms |

On E2E failure, the CI uploads:
- `playwright-report/` — HTML report with screenshots and traces
- `test-videos/` — Video recordings of failed tests

---

## Key Decisions

1. **Real in-memory SQLite for service tests, not mocks** — `db.service.test.ts` creates a `new Database(':memory:')` and runs the real MIGRATIONS array on it. This means the tests exercise actual SQL and catch schema drift immediately. Mocking `getDb()` would only test TypeScript, not queries.

2. **`vi.mock` for `getDb` and `syncPush`** — The service module calls `getDb()` on every operation, which normally requires an initialized Electron app. Mocking the `./index` module to return the test database bypasses the `electron` import and lets the service run in plain Node.js.

3. **`workers: 1` for Playwright Electron** — Playwright defaults to parallel workers. Multiple Electron windows on a single Linux display server (Xvfb) fail unpredictably. `workers: 1` is mandatory.

4. **`retries: 2` (not 8)** — The previous config had `retries: 8`, which hid flaky tests rather than surfacing them. Two retries is enough to handle legitimate timing issues.

5. **`better-sqlite3` ABI split** — The native module is compiled for Electron's ABI by `electron-forge package` and for system Node by `npm rebuild`. The CI `unit-tests` job explicitly runs `npm rebuild better-sqlite3` before tests. Local developers must do the same after running `npm run build`.

6. **`globals: true` in components vitest config** — `@testing-library/jest-dom` calls `expect.extend()` at module load time and requires `expect` to be globally available. Without `globals: true`, the setup file fails.

7. **`test:unit` as a separate cacheable Turbo task** — Unlike `test` (which is `cache: false` for non-deterministic E2E), `test:unit` is `cache: true` with source file inputs. Turbo will skip re-running unit tests if nothing in `src/` changed.

---

## Known Limitations / Future Work

- No E2E tests beyond app launch — `navigation.spec.ts`, `import-deck.spec.ts`, and `study-flow.spec.ts` are planned next.
- No tests for IPC handlers (`src/ipc/`) — these need a running Electron main process and belong in E2E.
- `packages/community-components` and `packages/web-components` have no tests yet.
- Chart components (`LapseStatsChart`, `RetentionTrendChart`, etc.) only have smoke tests — deeper chart output testing requires a canvas mock or visual regression tool.
- The `better-sqlite3` ABI split is a manual step locally. A `pretest` npm script or `postbuild` hook to auto-rebuild could remove the manual step.
