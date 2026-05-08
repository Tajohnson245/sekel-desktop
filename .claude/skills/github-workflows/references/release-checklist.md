# Release Checklist — Sekel Desktop

This is the canonical release checklist for `@sekel/desktop`. The high-level flow lives in `CLAUDE.md` — this file is the deep-dive reference for executing each step.

---

## Pre-Release Checks

Before cutting a release branch, verify:

- [ ] All intended SEKEL branches are merged to `dev`
- [ ] CI is green on `dev`
- [ ] No P0 / critical bugs are open against this release
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all pass on `dev`
- [ ] `npm audit` shows no critical/high severity vulnerabilities (or they are reviewed and acknowledged)
- [ ] You have decided the version number (MAJOR/MINOR/PATCH per SemVer)
- [ ] You have access to: `gh` CLI logged in, the prod Supabase dashboard, the Discord channel for verification
- [ ] No outstanding tightening migrations on `dev` that would break older clients (use expand-then-contract for NOT NULL / CHECK additions)

---

## Release Flow

**Starting point:** `dev` is clean and up to date locally.

### 1. Cut the release branch from `dev`

```bash
git checkout dev && git pull origin dev
git checkout -b release/v<X.Y.Z>
git push -u origin release/v<X.Y.Z>
```

### 2. Update `CHANGELOG.md`

On the release branch, prepend a new section above `[Unreleased]` with the version, today's date, and Keep-a-Changelog category headings (Added / Changed / Fixed / Removed / Security). Move any pending entries from `[Unreleased]` into the new section. Commit:

```bash
git commit -am "docs(changelog): release v<X.Y.Z>"
git push origin release/v<X.Y.Z>
```

### 3. Trigger Bump Version against the release branch

```bash
gh workflow run bump-version.yml \
  --ref release/v<X.Y.Z> \
  -f app=desktop \
  -f version=<X.Y.Z>
```

This commits the version bump on the release branch, creates the annotated `desktop/v<X.Y.Z>` tag, and pushes both. The tag push fires `release.yml`.

### 4. Wait for `release.yml`

`release.yml` runs in two stages:

1. **`deploy-server`** — links to the prod Supabase project, applies pending migrations via `db push`, redeploys the `feedback-discord` edge function. Required GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_DB_PASSWORD`. If either is missing, the workflow fails and the matrix build never runs.
2. **`release` (matrix)** — builds installers for win-x64 / macOS-arm64 / macOS-x64 / linux-x64, signs Windows artifacts via Azure Trusted Signing, uploads to GitHub Release + Cloudflare R2, then `publish-notes` composes notes via the GitHub `generate-notes` API and flips the draft to published.

Total time: ~15–25 minutes. Monitor in Actions.

### 5. Merge release branch into `main`

```bash
git checkout main && git pull origin main
git merge --no-ff release/v<X.Y.Z>
git push origin main
```

`--no-ff` preserves the release branch in history.

### 6. Back-merge release branch into `dev`

Captures any fixes made on the release branch (e.g. CHANGELOG edits, last-minute patches) so `dev` stays current.

```bash
git checkout dev && git pull origin dev
git merge --no-ff release/v<X.Y.Z>
git push origin dev
```

### 7. Delete the release branch

```bash
git branch -d release/v<X.Y.Z>
git push origin --delete release/v<X.Y.Z>
```

### 8. Verify in production

- [ ] Auto-updater on an installed copy of the previous release picks up `desktop/v<X.Y.Z>` and downloads it
- [ ] New version launches; about/version pane reads `<X.Y.Z>`
- [ ] Sentry's environment dropdown now shows `production` for events from this build
- [ ] Submit a feedback form; embed appears in the configured Discord channel
- [ ] Smoke-test auth, study session, key new features for this release

---

## Hotfix Checklist

Use when a critical production bug cannot wait for the next dev-cycle release.

A hotfix still gets a Linear ticket and follows the standard `SEKEL-<NNN>-<description>` naming. The only thing that changes is which branch you cut from and merge back to.

- [ ] **File a Linear ticket** (e.g. `SEKEL-145`) — required even for hotfixes
- [ ] **Branch from `main`** (not `dev`):
  ```bash
  git checkout main && git pull origin main
  git checkout -b SEKEL-NNN-short-description
  ```
- [ ] **Implement fix** — minimal change only, no unrelated work
- [ ] **Update `CHANGELOG.md`** with a `### Security` or `### Fixed` entry under a new `[X.Y.(Z+1)] - YYYY-MM-DD` heading
- [ ] **Trigger Bump Version against this branch:**
  ```bash
  gh workflow run bump-version.yml --ref SEKEL-NNN-short-description \
    -f app=desktop -f version=<X.Y.(Z+1)>
  ```
- [ ] **Wait for `release.yml`** to ship installers (same flow as a regular release)
- [ ] **Merge to `main`:**
  ```bash
  git checkout main
  git merge --no-ff SEKEL-NNN-short-description
  git push origin main
  ```
- [ ] **Merge to `dev`** so the fix isn't lost on the next release branch:
  ```bash
  git checkout dev
  git merge --no-ff SEKEL-NNN-short-description
  git push origin dev
  ```
- [ ] **Delete the branch:**
  ```bash
  git branch -d SEKEL-NNN-short-description
  git push origin --delete SEKEL-NNN-short-description
  ```

---

## Rollback Procedure

If a bad release reaches production:

1. **Identify the last good tag:**
   ```bash
   git tag --list 'desktop/v*' --sort=-v:refname | head -10
   ```
2. **Roll back the auto-updater pointer** — clients pull installers from Cloudflare R2 at `<platform>/<arch>/<filename>`. Re-uploading the previous release's artifacts to the same path (or pointing the auto-update modal to a previous tag) is the fastest rollback.
3. **Do NOT `git revert` on `main`** — it confuses the release history. Fix forward instead.
4. **Cut a hotfix branch from the last good tag** if a fix is needed:
   ```bash
   git checkout -b SEKEL-NNN-revert-bad-feature desktop/v<X.Y.(Z-1)>
   ```
5. **Fix forward** with a new patch release (`X.Y.(Z+1)`) rather than unpublishing.
6. **Never delete a published tag** — clients may still reference it. Mark the GitHub Release as a pre-release in the dashboard if you need to discourage updaters from picking it up.

---

## Versioning Rules (SemVer)

| Change Type | Bump | Example |
|-------------|------|---------|
| Breaking change to a public API or user-visible behavior | MAJOR | 1.5.3 → 2.0.0 |
| New backwards-compatible feature | MINOR | 1.5.3 → 1.6.0 |
| Backwards-compatible bug fix | PATCH | 1.5.3 → 1.5.4 |
| Pre-release alpha | PATCH + suffix | 1.6.0-alpha.1 |
| Pre-release beta | PATCH + suffix | 1.6.0-beta.2 |
| Release candidate | PATCH + suffix | 1.6.0-rc.1 |

Tag ordering: alpha → beta → rc → release. Always use annotated tags.

---

## Tag Naming — Why Two Tags Per Release

Each desktop release produces two tags pointing at the same commit:

- `desktop/v<X.Y.Z>` — created by `bump-version.yml`. This is the **trigger tag**: pushing it fires `release.yml`.
- `v<X.Y.Z>` — created by `release.yml`'s `Ensure GitHub Release exists` step. This is the **GitHub Release tag**: it's what `gh release` operates on, and it's what the auto-update modal looks up at `https://pub-...r2.dev/notes/v<X.Y.Z>.md`.

Don't change either name. The auto-update flow breaks if either convention slips.
