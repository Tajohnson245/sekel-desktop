# Docker
> Documents the Docker setup for the `@sekel/web` and `@sekel/community` Next.js apps, including the Turborepo prune strategy, multi-stage builds, and Docker Compose usage.

---

## Overview

The two deployable Next.js apps (`@sekel/web` and `@sekel/community`) are containerized using Docker with Turborepo's `prune` feature to create minimal, cache-efficient builds. Each app has its own Dockerfile and they are orchestrated together via a root-level `docker-compose.yml`. The desktop Electron app is not containerized.

## Architecture

```
sekel-monorepo/
├── apps/
│   ├── web/Dockerfile          — 4-stage build for @sekel/web (port 3000)
│   └── community/Dockerfile    — 4-stage build for @sekel/community (port 3001)
├── docker-compose.yml          — Orchestrates both services
└── .dockerignore               — Excludes node_modules, .next, .turbo, desktop app
```

Each Dockerfile uses the **monorepo root as the build context** so Docker can access the full workspace during the prune step.

## Build Stages

Each Dockerfile follows the same 4-stage pattern:

### 1. `pruner`
Runs `turbo prune <scope> --docker` to extract only the files and `package.json`s needed for that app's dependency subgraph. Outputs:
- `out/json/` — pruned `package.json` files only (used to install deps without copying source)
- `out/full/` — full pruned source tree

### 2. `installer`
Copies `out/json/` and the pruned `package-lock.json`, then runs `npm ci`. This layer only re-runs when dependencies change, not when source changes.

### 3. `builder`
Copies `node_modules` from the installer and `out/full/` source from the pruner, then runs `npx turbo build --filter=<scope>`. Accepts `TURBO_TEAM` and `TURBO_TOKEN` as build args for remote caching (see below). Next.js is configured with `output: 'standalone'` so the build produces a self-contained server bundle.

### 4. `runner`
Minimal production image. Copies only the `.next/standalone` bundle and static assets. Runs as a non-root `nextjs` user. No `node_modules` or source code present.

## Key Decisions

1. **`turbo prune --docker`** — Keeps the Docker context small and makes the installer layer cache-stable. Without pruning, any file change in the monorepo would bust the install cache.

2. **`output: 'standalone'` in Next.js config** — Required for the runner stage to work. Produces a `server.js` entry point and traces only the files needed at runtime. `outputFileTracingRoot` is set to the monorepo root so Next.js correctly traces imports from workspace packages.

3. **`ARG` not `ENV` for Turbo credentials** — `TURBO_TEAM` and `TURBO_TOKEN` are declared as `ARG` in the builder stage only. They are available during the build but never persisted in the final image layers.

4. **Build context is repo root** — The `context: .` in `docker-compose.yml` points to the monorepo root, which is required for `turbo prune` to access all workspace packages.

## Environment Variables

### Build-time (remote caching)
| Variable | Where | Purpose |
|---|---|---|
| `TURBO_TEAM` | Build arg | Turborepo remote cache team slug |
| `TURBO_TOKEN` | Build arg | Turborepo remote cache API token |

Set these in a root `.env` file (gitignored) or pass them directly via shell. Docker Compose reads them automatically via `${TURBO_TEAM}` / `${TURBO_TOKEN}`.

### Runtime (`@sekel/web`)
Loaded via `env_file: apps/web/.env` in Docker Compose. See `apps/web/.env.example` for required keys:
| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_AUDIENCE_ID` | Resend audience ID |
| `RESEND_TEMPLATE_ID` | Resend template ID |

### Runtime (`@sekel/community`)
No runtime env vars currently required.

## Usage

### Build and run both services
```bash
docker compose up --build
```

### Build a single service
```bash
docker compose build web
docker compose build community
```

### Build with Turbo remote caching
```bash
# Via shell environment
TURBO_TEAM=your-team TURBO_TOKEN=your-token docker compose build

# Or add to a root .env file and run normally
docker compose build
```

### Run without rebuilding
```bash
docker compose up
```

### Stop services
```bash
docker compose down
```

## Known Limitations / Future Work

- Neither app currently has a `public/` directory. If static assets are added, a `COPY` line for `public/` will need to be added to the runner stage of the relevant Dockerfile.
- No health checks defined in `docker-compose.yml` yet.
- Community app has no runtime environment variables documented — a `.env.example` should be added when Supabase or other secrets are wired up.
