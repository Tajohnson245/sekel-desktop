# Prompt: Build a GitHub Workflows Manager Skill for Claude

## Your Task

You are going to build a complete, production-quality Claude skill that turns Claude into an expert GitHub workflows manager. This skill will live at `.claude/skills/github-workflows/` and consist of a `SKILL.md` plus supporting reference files.

Before writing anything, read `/mnt/skills/examples/skill-creator/SKILL.md` to understand skill structure, best practices, and the anatomy of a well-written skill. Then follow the full specification below.

---

## Skill Identity

**Skill name**: `github-workflows`

**Trigger description** (use this verbatim in the YAML frontmatter):
> "Manages GitHub repository workflows end-to-end: branching strategy, branch naming, commit conventions, versioning, releases, pull requests, and CI/CD best practices. Use this skill whenever the user mentions branches, PRs, releases, versioning, tags, merging, GitHub Actions, or asks how to structure their repo workflow — even for simple questions like 'what should I name this branch?' or 'how do I cut a release?'"

---

## Communication Style Requirement

**This is the most important behavioral rule in the entire skill:**

Before executing ANY step, Claude must announce what it is about to do in plain, friendly language. Format:

```
🔍 Step 1 of 4 — Inspecting your repository...
   I'm going to look at your current branch structure, recent commits, and any existing tags so I know exactly where things stand before suggesting anything.
```

After completing the step, summarize what was found:
```
✅ Found: main branch (protected), 3 open feature branches, latest tag v1.2.0, no CHANGELOG.md yet.
```

Never silently run commands. Never dump raw terminal output at the user. Always translate findings into plain English. If something is unexpected or concerning, flag it with a ⚠️ before proceeding.

---

## Skill Structure to Build

```
.claude/skills/github-workflows/
├── SKILL.md                          ← main skill file (primary instructions)
└── references/
    ├── branching-strategies.md       ← GitFlow vs trunk-based vs GitHub Flow deep reference
    ├── naming-conventions.md         ← branch, commit, tag naming rules with examples
    ├── versioning-guide.md           ← SemVer, CalVer, pre-releases, build metadata
    ├── release-checklist.md          ← step-by-step release execution guide
    └── pr-review-standards.md        ← PR size, description templates, review etiquette
```

---

## SKILL.md Full Specification

### YAML Frontmatter

```yaml
---
name: github-workflows
description: [use the trigger description above verbatim]
---
```

### Section 1: Orientation

When the skill triggers, Claude must:
1. Ask the user what they want to accomplish if it's not already clear (branch, release, PR, review conventions, etc.)
2. Detect context: does the user have an existing repo open? Run `git status`, `git branch -a`, `git log --oneline -10`, `git tag --sort=-v:refname | head -10` to understand where things stand
3. Report findings in plain English (see communication style above)
4. State which workflow mode is being activated

**Workflow modes** (Claude should identify and announce which one applies):
- `branch` — creating or naming a branch
- `commit` — writing or fixing a commit message
- `pr` — opening, reviewing, or describing a pull request
- `release` — cutting a release, bumping version, writing release notes
- `versioning` — deciding what version number to use
- `audit` — reviewing existing repo structure and suggesting improvements
- `setup` — setting up conventions for a brand new or convention-less repo

---

### Section 2: Branching Strategy

Claude must first identify which branching model the repo is using (or recommend one if none exists). Read `references/branching-strategies.md` for full detail.

**Quick decision logic to include inline in SKILL.md:**

| Team Size | Deploy Frequency | Recommended Strategy |
|-----------|-----------------|----------------------|
| 1–3 devs | Anytime | GitHub Flow (main + feature branches) |
| 4–15 devs | Scheduled releases | GitFlow (main, develop, feature, release, hotfix) |
| 15+ devs | Continuous | Trunk-Based Development |

When recommending a strategy, Claude must:
1. State the recommendation and why in 2–3 sentences
2. Show the exact branch topology (a simple ASCII diagram)
3. Explain what each branch type is for
4. Ask for confirmation before proceeding

**GitFlow branch topology to include:**
```
main          ← production-ready, tagged releases only
develop       ← integration branch, all features merge here
feature/*     ← new features, branch from develop
release/*     ← release prep, branch from develop, merges to main+develop
hotfix/*      ← urgent fixes, branch from main, merges to main+develop
```

**GitHub Flow topology:**
```
main          ← always deployable
feature/*     ← all work, branch from main, PR back to main
```

---

### Section 3: Branch Naming Conventions

Read `references/naming-conventions.md` for full examples. Inline rules to enforce:

**Format**: `<type>/<ticket-or-scope>/<short-description>`

**Types:**
- `feature/` — new functionality
- `fix/` — bug fixes
- `hotfix/` — urgent production fixes (GitFlow only)
- `release/` — release preparation (GitFlow only)
- `chore/` — maintenance, dependency updates, tooling
- `docs/` — documentation only
- `refactor/` — code restructuring, no behavior change
- `test/` — adding or fixing tests
- `experiment/` — exploratory/spike work, may be discarded

**Rules to enforce:**
- All lowercase
- Hyphens only, no underscores, no spaces
- Max 50 characters total
- Ticket number before description when applicable: `feature/PROJ-123/user-auth`
- No generic names: reject `fix/bug`, `feature/stuff`, `update/changes`

**Claude behavior when in `branch` mode:**
1. Ask: what type of work is this? (feature, fix, etc.)
2. Ask: do you have a ticket/issue number?
3. Ask: describe what this branch will do in a few words
4. Generate 2–3 valid name options
5. Explain the choice and ask user to confirm or pick one
6. Output the exact `git checkout -b <branch-name>` command to run

---

### Section 4: Commit Message Conventions

Enforce **Conventional Commits** (https://www.conventionalcommits.org).

**Format:**
```
<type>(<scope>): <short description>

[optional body]

[optional footer: BREAKING CHANGE: ..., Closes #123]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

**Rules:**
- Subject line max 72 characters
- Imperative mood: "add feature" not "added feature"
- No period at end of subject
- Body wraps at 72 characters
- Footer references issues: `Closes #42`, `Refs #100`
- Breaking changes flagged with `!` after type or in footer: `feat!:` or `BREAKING CHANGE:`

**Claude behavior when in `commit` mode:**
1. Ask what changed (or read staged diff if available via `git diff --staged`)
2. Identify the correct type
3. Draft the commit message
4. Show it formatted in a code block
5. Ask if the user wants to adjust anything
6. Output the exact `git commit -m "..."` command

---

### Section 5: Versioning

Read `references/versioning-guide.md` for full detail. Inline the core decision logic:

**Use Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH[-prerelease][+build]`**

| Change Type | Version Bump | Example |
|-------------|-------------|---------|
| Breaking API change | MAJOR | 1.2.3 → 2.0.0 |
| New backwards-compatible feature | MINOR | 1.2.3 → 1.3.0 |
| Backwards-compatible bug fix | PATCH | 1.2.3 → 1.2.4 |
| Pre-release alpha | PATCH + suffix | 1.3.0-alpha.1 |
| Pre-release beta | PATCH + suffix | 1.3.0-beta.2 |
| Release candidate | PATCH + suffix | 1.3.0-rc.1 |

**Special rules:**
- `0.x.x` = initial development, anything may change, MINOR bumps may be breaking
- `1.0.0` = first stable public API
- Never reuse a version number
- Always tag releases: `git tag -a v1.3.0 -m "Release v1.3.0"`
- Annotated tags only — never lightweight tags for releases

**Claude behavior when in `versioning` mode:**
1. Run `git tag --sort=-v:refname | head -5` to show recent versions
2. Ask what changed since last release (or read commits via `git log <last-tag>..HEAD --oneline`)
3. Identify the highest-impact change type
4. State: "Based on [X], this should be a [MAJOR/MINOR/PATCH] bump. New version: vX.Y.Z"
5. Confirm with user before proceeding

---

### Section 6: Release Workflow

Read `references/release-checklist.md` for the full checklist. Inline the step sequence:

**Claude behavior when in `release` mode — announce each step before running it:**

```
Step 1 of 8 — Verifying you're on the right branch
Step 2 of 8 — Checking for uncommitted changes
Step 3 of 8 — Pulling latest changes
Step 4 of 8 — Determining version number
Step 5 of 8 — Updating version files (package.json, pyproject.toml, etc.)
Step 6 of 8 — Generating/updating CHANGELOG
Step 7 of 8 — Committing version bump
Step 8 of 8 — Creating annotated git tag
```

**Detailed step behavior:**

**Step 1 — Branch verification:**
- GitFlow: must be on `release/*` or `hotfix/*`
- GitHub Flow / Trunk: must be on `main` or a dedicated release branch
- If wrong branch: warn, suggest correct branch, pause

**Step 2 — Clean working directory:**
- Run `git status`
- If dirty: show what's uncommitted, ask user to stash or commit first
- Never release from a dirty state

**Step 3 — Pull latest:**
- Run `git pull origin <current-branch>`
- Report if up to date or how many commits pulled

**Step 4 — Version determination:**
- Run `git log <last-tag>..HEAD --oneline`
- Analyze commit types, recommend version bump
- Confirm with user

**Step 5 — Update version files:**
- Detect which files need updating:
  - Node.js: `package.json` → `"version"` field
  - Python: `pyproject.toml` → `[project] version` or `setup.py`
  - Generic: `VERSION` file if present
- Show the exact edit, confirm before writing

**Step 6 — CHANGELOG:**
- If no CHANGELOG.md: create one using Keep a Changelog format (https://keepachangelog.com)
- Categorize commits into: Added, Changed, Fixed, Deprecated, Removed, Security
- Prepend new section at top
- Show the draft, ask for edits

**Step 7 — Commit:**
- `git add <version files> CHANGELOG.md`
- `git commit -m "chore(release): bump version to vX.Y.Z"`

**Step 8 — Tag:**
- `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
- Remind user to push: `git push origin <branch> && git push origin vX.Y.Z`

---

### Section 7: Pull Request Standards

Read `references/pr-review-standards.md` for full detail. Inline core rules:

**PR size guidelines:**
- Ideal: under 400 lines changed
- Acceptable: 400–800 lines
- Needs splitting: 800+ lines (Claude should suggest split strategy)

**PR title format** (same as commit subject): `<type>(<scope>): <description>`

**Required PR description sections:**
```markdown
## What
[1–3 sentence summary of what this changes]

## Why
[Context: what problem does this solve or feature does it add]

## How
[Brief technical approach — key decisions made]

## Testing
[How was this tested? Unit tests? Manual steps?]

## Screenshots / Demo
[If UI changes]

## Checklist
- [ ] Tests pass
- [ ] No console.log / debug artifacts
- [ ] CHANGELOG updated (if release-worthy)
- [ ] Docs updated (if API changed)
```

**Claude behavior when in `pr` mode:**
1. Ask: what does this PR do?
2. Ask: what's the ticket/issue number?
3. Read recent commits on the branch: `git log main..HEAD --oneline`
4. Draft the full PR description using the template
5. Suggest a PR title
6. Warn if the PR looks too large
7. Offer to generate a split strategy if > 800 lines

---

### Section 8: Audit Mode

When in `audit` mode, Claude runs a full repo health check and produces a structured report.

**Announce before each check:**
```
🔍 Checking branch hygiene...
🔍 Checking commit message consistency...
🔍 Checking version tag history...
🔍 Checking for CHANGELOG...
🔍 Checking for stale branches...
```

**Checks to run:**

| Check | Command | What to look for |
|-------|---------|-----------------|
| Branch list | `git branch -a` | Stale branches (>30 days no commit), naming violations |
| Commit history | `git log --oneline -20` | Non-conventional commits, merge commit noise |
| Tags | `git tag --sort=-v:refname` | Missing tags, gaps in versioning, lightweight vs annotated |
| Stale branches | `git for-each-ref --sort=-committerdate refs/heads --format='%(refname:short) %(committerdate:relative)'` | Branches with no activity in 30+ days |
| Divergence | `git log main..HEAD --oneline` (per branch) | Long-lived branches out of sync |

**Output format:** a scored report card:
```
## BYTEFLOW Repo Health Report

### Branching          ✅ Good       (3/3 branches follow naming conventions)
### Commit Hygiene     ⚠️  Needs Work  (14/20 recent commits use conventional format)
### Version Tags       ✅ Good       (6 annotated tags, clean SemVer progression)
### CHANGELOG          ❌ Missing    (no CHANGELOG.md found)
### Stale Branches     ⚠️  2 stale    (feature/old-auth: 47 days, fix/typo: 62 days)

### Recommendations
1. Add CHANGELOG.md using Keep a Changelog format
2. Delete or revive: feature/old-auth, fix/typo
3. Standardize commit messages — 6 commits need rewriting before next release
```

---

### Section 9: Setup Mode

For repos with no established conventions, Claude walks through a full setup:

1. **Announce:** "I'm going to help you set up Git conventions for this repo from scratch. I'll ask a few questions, then configure everything."
2. Ask 5 questions:
   - Team size?
   - How often do you deploy/release?
   - Do you use a ticketing system (Jira, Linear, GitHub Issues)?
   - What language/ecosystem? (Node, Python, Go, etc.)
   - Do you use GitHub Actions for CI?
3. Based on answers, recommend and configure:
   - Branching strategy (with diagram)
   - Branch naming rules
   - Commit convention (always Conventional Commits)
   - Version scheme (SemVer unless strong reason otherwise)
4. Generate output files:
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `CHANGELOG.md` (empty scaffold)
   - `.commitlintrc.json` (if Node.js project)
5. Show each file before creating it, ask for confirmation

---

## Reference Files to Build

### `references/branching-strategies.md`

Full deep-dive on:
- GitFlow: origin, full diagram, pros/cons, when to use, common mistakes
- GitHub Flow: simplified model, pros/cons, best for continuous deployment
- Trunk-Based Development: feature flags, short-lived branches, pros/cons, requires strong CI
- Comparison table across 8 dimensions (complexity, CI/CD fit, release cadence, team size, etc.)
- Migration guides: how to move from GitFlow → GitHub Flow, or GitHub Flow → Trunk

### `references/naming-conventions.md`

Full reference with:
- 20+ real-world branch name examples (good and bad, annotated)
- Ticket number patterns for Jira (PROJ-123), Linear (ABC-456), GitHub Issues (#42)
- Hotfix naming: `hotfix/v1.2.4/fix-payment-crash`
- Release naming: `release/v2.0.0`
- Long-running branches to avoid and why
- Tag naming: `v1.2.3`, `v1.2.3-beta.1`, `v1.2.3-rc.2`
- Environment branch names: `staging`, `sandbox` conventions

### `references/versioning-guide.md`

Full reference with:
- SemVer spec breakdown with examples for every case
- CalVer explanation (YYYY.MM.DD or YYYY.MM.MINOR) — when it makes sense
- Pre-release identifiers: alpha, beta, rc — ordering and incrementing
- Build metadata: `+build.1`, `+sha.a1b2c3`
- `0.x.x` phase guidance
- Python-specific versioning (`__version__`, `pyproject.toml`)
- Node.js-specific (`package.json`, `npm version` commands)
- GitHub Release vs git tag — difference and when to use each
- Changelog-driven release notes from conventional commits

### `references/release-checklist.md`

Exhaustive checklist format:
- Pre-release checks (tests green, coverage threshold met, security scan)
- GitFlow release checklist (full merge sequence with exact commands)
- GitHub Flow release checklist
- Hotfix-specific checklist
- Post-release checklist (push tags, create GitHub Release, notify team, close milestone)
- Rollback procedure

### `references/pr-review-standards.md`

Full guide:
- PR description template (copy-pasteable)
- Review etiquette (blocking vs non-blocking comments, nitpick prefix)
- Review turnaround expectations
- How to handle review disagreements
- Squash vs merge vs rebase — when to use each, configured per repo
- Draft PRs — when and how to use
- PR size: how to split a large PR (by layer, by feature slice, by file type)
- Auto-close keywords: `Closes #42`, `Fixes #42`, `Resolves #42`

---

## Output Requirements

When complete, the skill folder should contain:
```
.claude/skills/github-workflows/
├── SKILL.md                     (300–450 lines)
└── references/
    ├── branching-strategies.md  (150–250 lines)
    ├── naming-conventions.md    (100–180 lines)
    ├── versioning-guide.md      (150–220 lines)
    ├── release-checklist.md     (100–150 lines)
    └── pr-review-standards.md  (120–180 lines)
```

After creating all files, confirm each was written by listing them with line counts:
```
✅ SKILL.md                    — 387 lines
✅ references/branching-strategies.md — 201 lines
✅ references/naming-conventions.md   — 143 lines
✅ references/versioning-guide.md     — 178 lines
✅ references/release-checklist.md    — 122 lines
✅ references/pr-review-standards.md  — 155 lines
```

Then tell the user: "Your GitHub Workflows skill is ready. Drop the `github-workflows/` folder into `.claude/skills/` and Claude will automatically use it whenever you ask about branches, releases, versioning, PRs, or repo structure."

---

## Quality Bars

- Every section that runs a git command must announce it first in plain English
- Every recommendation must be justified with 1–2 sentences of reasoning
- The skill must work for users who have never heard of GitFlow AND users who already know it well (detect sophistication from their language and adjust)
- No git command should be run destructively without explicit user confirmation
- The skill must handle repos with no prior conventions gracefully (don't assume anything exists)
- All generated files (.commitlintrc.json, PR template, etc.) must be complete and immediately usable — no placeholders
