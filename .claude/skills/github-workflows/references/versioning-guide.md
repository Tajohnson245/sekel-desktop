# Versioning Guide — Full Reference

## Semantic Versioning (SemVer)

**Spec:** https://semver.org — `MAJOR.MINOR.PATCH[-prerelease][+build]`

### Core Rules

| Position | Increment when... | Example |
|----------|------------------|---------|
| MAJOR | Incompatible API changes (breaking) | `1.2.3 → 2.0.0` |
| MINOR | New backwards-compatible functionality | `1.2.3 → 1.3.0` |
| PATCH | Backwards-compatible bug fixes only | `1.2.3 → 1.2.4` |

When MAJOR bumps, reset MINOR and PATCH to 0.
When MINOR bumps, reset PATCH to 0.

### What counts as "breaking"?

- Removing a public API method or field
- Changing the signature of a public function
- Changing the behavior of an existing API in a non-additive way
- Changing the format of data that consumers depend on
- Dropping support for a runtime/language version that consumers may use

### What does NOT count as breaking?

- Adding new optional parameters to a function
- Adding new public methods or fields
- Bug fixes that make existing behavior match documented behavior
- Performance improvements with no observable behavior change
- Internal refactoring not visible to consumers

---

## The 0.x.x Phase

During initial development (before `1.0.0`), anything may change at any time:
- `0.1.0` → `0.2.0` may include breaking changes (treat MINOR like MAJOR)
- `0.1.0` → `0.1.1` should still be only bug fixes
- Use `1.0.0` intentionally when the public API is stable

**Don't stay in 0.x.x forever.** It signals instability and discourages adoption. Cut `1.0.0` when the API is stable enough that you'd be embarrassed to break it.

---

## Pre-Release Identifiers

Format: `MAJOR.MINOR.PATCH-<identifier>.<number>`

| Stage | Meaning | Example |
|-------|---------|---------|
| `alpha` | Early, unstable, may be incomplete | `1.3.0-alpha.1` |
| `beta` | Feature complete, known bugs may exist | `1.3.0-beta.1` |
| `rc` | Release candidate, should be stable | `1.3.0-rc.1` |

**Ordering:** alpha < beta < rc < release
```
1.3.0-alpha.1 < 1.3.0-alpha.2 < 1.3.0-beta.1 < 1.3.0-rc.1 < 1.3.0
```

**Incrementing pre-release numbers:**
- Start at `.1` (not `.0`)
- Increment when you cut a new pre-release of the same stage: `alpha.1`, `alpha.2`, ...
- Reset when moving to next stage: `beta.1` (not `beta.3`)

---

## Build Metadata

Format: `MAJOR.MINOR.PATCH+<metadata>`

Build metadata is appended with `+` and is ignored for version precedence:
- `1.2.3+build.42` — build number
- `1.2.3+sha.a1b2c3d` — git commit SHA
- `1.2.3+20240315` — build date

`1.2.3+build.1` and `1.2.3+build.2` are considered the same version for comparison purposes. Use sparingly — consumers shouldn't need to care about build metadata.

---

## Calendar Versioning (CalVer)

**Spec:** https://calver.org — version based on release date.

**Common formats:**
- `YYYY.MM.DD` — e.g., `2024.03.15`
- `YYYY.MM.MINOR` — e.g., `2024.03.1` (first release in March 2024)
- `YY.MM` — e.g., `24.03`

**When CalVer makes sense:**
- Projects that release on a fixed schedule (Ubuntu, Python, pip)
- Projects where the "age" of the release is meaningful to users
- Internal tooling where API stability is not a concern

**When to stick with SemVer:**
- Libraries and packages consumed by other developers
- Anything with a public API
- When breaking changes need to be communicated clearly

---

## Node.js Versioning

**Location:** `package.json` → `"version"` field

**npm commands:**
```bash
npm version patch   # 1.2.3 → 1.2.4 (also commits and tags)
npm version minor   # 1.2.3 → 1.3.0
npm version major   # 1.2.3 → 2.0.0
npm version 1.3.0-beta.1  # set specific pre-release version
```

`npm version` automatically creates a git commit (`chore: 1.3.0`) and tag (`v1.3.0`) unless you pass `--no-git-tag-version`.

For monorepos: update each package's `package.json` individually, or use a tool like `changesets` or `lerna`.

---

## Python Versioning

**Location:** `pyproject.toml` → `[project]` section:
```toml
[project]
name = "my-package"
version = "1.2.3"
```

Or in `setup.py`:
```python
setup(name="my-package", version="1.2.3")
```

Or as a `__version__` variable in your package's `__init__.py`:
```python
__version__ = "1.2.3"
```

**Python pre-release convention (PEP 440):**
```
1.3.0a1   ← alpha 1
1.3.0b2   ← beta 2
1.3.0rc1  ← release candidate 1
1.3.0     ← final release
```
Note: PEP 440 uses `a`/`b`/`rc` without a dot separator — different from SemVer's `-alpha.1`.

---

## GitHub Release vs Git Tag

| | Git Tag | GitHub Release |
|-|---------|---------------|
| What it is | A named pointer to a commit | A GitHub-hosted artifact page |
| Created by | `git tag` | GitHub UI or API |
| Contains | Name + optional annotation | Title, body (notes), attached binaries |
| Visible on | `git tag` output, clone/fetch | github.com/owner/repo/releases |
| Required? | Yes — always create a tag | No — but highly recommended for public projects |

**Best practice:** Create an annotated git tag first, then create a GitHub Release from it. The GitHub Release adds release notes and can attach compiled artifacts (binaries, archives).

```bash
# Create the tag
git tag -a v1.3.0 -m "Release v1.3.0"
git push origin v1.3.0

# Then create GitHub Release via CLI
gh release create v1.3.0 --title "v1.3.0" --notes-file CHANGELOG_excerpt.md
```

---

## Generating Release Notes from Conventional Commits

Given conventional commits, categorize for the changelog:

| Commit type | Changelog section |
|-------------|------------------|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Changed (performance) |
| `refactor` | Changed |
| `docs` | (usually omit from user-facing notes) |
| `chore` | (usually omit from user-facing notes) |
| `feat!` or `BREAKING CHANGE:` | ⚠️ Breaking Changes |
| `security` / `fix` (security) | Security |

Tools that automate this: `conventional-changelog`, `semantic-release`, `release-please`.
