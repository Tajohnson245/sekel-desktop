---
name: docs-organizer
description: "Organizes and creates documentation for the Sekel monorepo. Triggers when the user asks to create a doc, write documentation, or reorganize docs. Enforces the project's docs/ folder structure and naming standards."
---

# Sekel Docs Organizer

When this skill activates, either organize existing docs or create a new doc following the Sekel documentation standard below.

---

## Docs Folder Structure

All project documentation lives in `docs/`. Do not place `.md` files in the repo root (except `CHANGELOG.md` and package-level `README.md` files, which follow ecosystem conventions).

```
docs/
├── design/       — Visual design specs, stylescapes, brand guidelines
├── features/     — Feature implementation docs (one per major feature)
└── prompts/      — Build prompts used to scaffold features or skills
```

| Doc type | Folder | Example filename |
|---|---|---|
| Design spec / stylescape | `docs/design/` | `stylescape-spec.md`, `website-spec.md` |
| Feature implementation doc | `docs/features/` | `sqlite-implementation.md`, `community-app.md` |
| Build / scaffold prompt | `docs/prompts/` | `community-app.md`, `github-workflows-skill.md` |

**Naming rules:**
- All lowercase, kebab-case (`my-feature.md`, not `MyFeature.md` or `my_feature.md`)
- No dates in filenames — git history is the date record
- One topic per file — do not combine unrelated subjects

---

## Standard Doc Template

Every new doc must open with this header block:

```markdown
# [Title]
> [One-sentence description of what this document covers and who it's for]

---
```

Then follow with sections relevant to the doc type. See section-specific templates below.

---

## Feature Doc Template (`docs/features/`)

Use for: documenting a shipped or in-progress feature implementation.

```markdown
# [Feature Name]
> [One-sentence description]

---

## Overview
[2-4 sentences on what this feature is, why it exists, and how it fits into Sekel]

## Architecture
[Key files, packages, and how they connect. Use a directory tree or bullet list.]

## Key Decisions
[Numbered list of non-obvious decisions made during implementation and why]

## Known Limitations / Future Work
[What was intentionally left out or deferred]
```

---

## Design Doc Template (`docs/design/`)

Use for: brand guidelines, stylescapes, UI specs, design tokens.

```markdown
# [Design System / Spec Name]
> [One-sentence description]
> Version X.X · [Month Year]

---

## [Section 1]
...
```

Design docs should match the SEKEL brand voice: direct, precise, no filler. Reference design tokens from `docs/design/stylescape-spec.md` rather than hard-coding hex values in prose.

---

## Prompt Doc Template (`docs/prompts/`)

Use for: prompts used to scaffold features, apps, or skills via an LLM.

```markdown
# [Feature/Skill Name] — Build Prompt
> Prompt used to scaffold [what]. Pass to Claude with the repo open.

---

## Overview
[What this prompt builds and what the end result should be]

## [Sections...]
```

---

## Behavior When Organizing Existing Docs

When asked to reorganize docs:

1. List all `.md` files in the repo (excluding `node_modules/`, `test-results/`, `.specstory/`)
2. Identify files that don't belong in their current location per the structure above
3. Show the proposed moves as a table before executing:

```
| Current path                    | New path                      |
|---------------------------------|-------------------------------|
| some-feature-prompt.md          | docs/prompts/some-feature.md  |
| stylescape/SomeSpec.md          | docs/design/some-spec.md      |
```

4. Confirm with user before moving
5. Use `git mv` (never plain `mv`) so history is preserved
6. After moving, verify the `stylescape/` or other source dirs are empty and remove them

**Never move:**
- `CHANGELOG.md` — must stay at repo root (tooling convention)
- `apps/*/README.md` — package-level READMEs stay with their workspace
- `.claude/skills/**` — Claude skill files must stay in `.claude/skills/`
- Auto-generated files (`next-env.d.ts`, `.specstory/`, `test-results/`)

---

## Behavior When Creating a New Doc

When asked to create a doc:

1. Ask: "What type of doc is this — feature, design, or prompt?" (if not already clear)
2. Ask: "What's the filename?" (suggest a kebab-case name if they give a title)
3. Select the right subfolder based on type
4. Apply the matching template above
5. Write the file to `docs/<subfolder>/<filename>.md`
6. Confirm the path before writing

Do not invent subfolders beyond `design/`, `features/`, and `prompts/` unless the user explicitly requests a new category.
