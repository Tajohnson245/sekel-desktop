# Release Checklist — Step-by-Step Execution Guide

## Pre-Release Checks (All Strategies)

Before starting any release process, verify:

- [ ] All intended features/fixes are merged to the release source branch
- [ ] CI is green on the release source branch
- [ ] No P0/critical bugs are open against this release
- [ ] Test coverage meets your project's threshold
- [ ] Security scan has been run (if applicable: `npm audit`, `pip-audit`, Dependabot)
- [ ] Changelog entries drafted (or commits are conventional enough to generate them)
- [ ] Version number agreed upon by the team

---

## GitHub Flow Release Checklist

**Starting point:** `main` branch, clean and up-to-date.

- [ ] **Verify branch:** `git branch --show-current` — must be `main`
- [ ] **Clean state:** `git status` — must show nothing to commit
- [ ] **Pull latest:** `git pull origin main`
- [ ] **Check commits since last tag:**
  ```bash
  git log $(git describe --tags --abbrev=0)..HEAD --oneline
  ```
- [ ] **Determine version bump** (MAJOR/MINOR/PATCH) based on commit types
- [ ] **Update version file(s):** `package.json`, `pyproject.toml`, `VERSION`, etc.
- [ ] **Update CHANGELOG.md** — prepend new section at top
- [ ] **Commit version bump:**
  ```bash
  git add package.json CHANGELOG.md
  git commit -m "chore(release): bump version to vX.Y.Z"
  ```
- [ ] **Create annotated tag:**
  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  ```
- [ ] **Push branch and tag:**
  ```bash
  git push origin main && git push origin vX.Y.Z
  ```
- [ ] **Create GitHub Release** (see post-release section)

---

## GitFlow Release Checklist

**Starting point:** Feature work complete on `develop`.

### Cut the Release Branch
- [ ] **Switch to develop:** `git checkout develop && git pull origin develop`
- [ ] **Cut release branch:** `git checkout -b release/vX.Y.Z`
- [ ] **Update version files:** `package.json`, etc.
- [ ] **Update CHANGELOG.md**
- [ ] **Commit:**
  ```bash
  git commit -am "chore(release): bump version to vX.Y.Z"
  ```
- [ ] Push release branch: `git push origin release/vX.Y.Z`

### Stabilize (bug fixes only on release branch)
- [ ] Only bug fixes are committed to `release/vX.Y.Z` — no new features
- [ ] CI must be green throughout

### Merge to Main
- [ ] **Switch to main:** `git checkout main && git pull origin main`
- [ ] **Merge release branch:**
  ```bash
  git merge --no-ff release/vX.Y.Z
  ```
- [ ] **Tag on main:**
  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  ```
- [ ] **Push main and tag:**
  ```bash
  git push origin main && git push origin vX.Y.Z
  ```

### Merge Back to Develop
- [ ] **Switch to develop:** `git checkout develop`
- [ ] **Merge release branch:**
  ```bash
  git merge --no-ff release/vX.Y.Z
  ```
- [ ] **Push develop:** `git push origin develop`
- [ ] **Delete release branch:**
  ```bash
  git branch -d release/vX.Y.Z
  git push origin --delete release/vX.Y.Z
  ```

---

## Hotfix Checklist

**Use when:** Critical production bug that cannot wait for the next release cycle.

A hotfix still gets a Linear ticket and follows the standard `SEKEL-<NNN>-<description>` naming — the only thing that changes is which branch you cut from and merge back to.

- [ ] **File a Linear ticket** (e.g. `SEKEL-145`) — even for hotfixes, the ticket is the system of record
- [ ] **Branch from main (NOT dev):**
  ```bash
  git checkout main && git pull origin main
  git checkout -b SEKEL-NNN-short-description
  ```
- [ ] **Implement fix** — minimal change only, no unrelated work
- [ ] **Update version** (PATCH bump only): `X.Y.Z → X.Y.(Z+1)`
- [ ] **Update CHANGELOG.md** — add a `### Security` or `### Fixed` entry
- [ ] **Commit:**
  ```bash
  git commit -am "fix: <description of critical fix>"
  git commit -am "chore(release): bump version to vX.Y.Z"
  ```
- [ ] **Merge to main:**
  ```bash
  git checkout main
  git merge --no-ff SEKEL-NNN-short-description
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  git push origin main && git push origin vX.Y.Z
  ```
- [ ] **Merge to dev:**
  ```bash
  git checkout dev
  git merge --no-ff SEKEL-NNN-short-description
  git push origin dev
  ```
- [ ] **Delete branch:**
  ```bash
  git branch -d SEKEL-NNN-short-description
  git push origin --delete SEKEL-NNN-short-description
  ```

---

## Post-Release Checklist

After the tag is pushed:

- [ ] **Create GitHub Release:**
  ```bash
  gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(cat CHANGELOG_excerpt.md)"
  ```
  Or use the GitHub UI: Releases → Draft a new release → pick the tag.
- [ ] **Attach artifacts** if applicable (compiled binaries, dist archives)
- [ ] **Close the milestone** in GitHub Issues (if used)
- [ ] **Notify team** (Slack, email, Discord — wherever your team communicates)
- [ ] **Update deployment documentation** if the release changes infrastructure/config
- [ ] **Verify deployment** — confirm the release is running in production

---

## Rollback Procedure

If a bad release reaches production:

1. **Identify the last good tag:**
   ```bash
   git tag --sort=-v:refname | head -10
   ```
2. **Deploy the previous version** (revert your CD pipeline to point at the last good tag)
3. **Do NOT use `git revert` on main for a release** — it creates confusing history
4. **Create a hotfix branch** from the last good tag if a fix is needed (file a Linear ticket first):
   ```bash
   git checkout -b SEKEL-NNN-revert-bad-feature vX.Y.(Z-1)
   ```
5. **Fix forward** with a new patch release (`vX.Y.(Z+1)`) rather than unpublishing
6. **Never delete a published tag** — consumers may depend on it; mark the GitHub Release as a pre-release instead
