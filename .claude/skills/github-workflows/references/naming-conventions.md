# Branch & Tag Naming Conventions — Sekel

This repo uses a **single work-branch pattern** — no type prefixes. The Linear ticket classifies the work, so `feature/`, `fix/`, `chore/` etc. are not used here.

---

## Work Branch Format

```
SEKEL-<NNN>-<short-description>
```

**Rules:**
- Linear ticket prefix `SEKEL-<NNN>` is mandatory — if no ticket exists, file one first
- Description is 2–5 words, kebab-case, lowercase
- Hyphens only — no underscores, no slashes, no type prefix
- Max 50 characters total
- One branch per ticket; if scope grows, split the ticket

---

## Real Examples From This Repo

```
SEKEL-121-feedback-form-triage          ✅
SEKEL-120-sentry-observability          ✅
SEKEL-119-remove-decks-empty-emoji      ✅
SEKEL-118-tour-add-study-tab            ✅
```

---

## Bad Branch Names — What to Reject

```
feature/SEKEL-121-feedback-form    ❌ No type prefix in this repo
fix/login-bug                      ❌ No type prefix; needs ticket
SEKEL_121_feedback_form            ❌ Underscores not allowed
sekel-121-feedback-form            ❌ Ticket prefix must be uppercase
SEKEL-121                          ❌ Ticket only — needs description
121-feedback-form                  ❌ Missing SEKEL- prefix
my-branch                          ❌ No ticket, no convention
wip                                ❌ Use a draft PR instead
SEKEL-121-implement-the-new-feedback-triage-system-with-sentry  ❌ Too long (>50 chars)
```

---

## Long-Lived Branches

| Branch | Purpose |
|--------|---------|
| `main` | Release target — what's in production |
| `dev` | Integration / working default — work branches cut from here, merge back via PR |

Releases flow `dev` → `release/v*` → `main` (see release branches below).

---

## Release Branches (the only exception to the no-prefix rule)

Releases are version-tied, not ticket-tied, so they keep a prefix:

```
release/v<X.Y.Z>
```

**Examples:**
```
release/v1.0.6       ✅
release/v1.0.5       ✅
release/v1.5.0-beta.1 ✅ pre-release
```

Cut from `dev`. Merged to `main` and tagged when shipped.

---

## Tag Naming

Tags always start with `v` and use SemVer:

```
v1.0.6              ← standard release
v1.3.0-alpha.1      ← alpha pre-release
v1.3.0-beta.2       ← beta
v1.3.0-rc.1         ← release candidate
```

**Always use annotated tags** so the tag has a tagger, date, and message:

```bash
git tag -a v1.0.6 -m "Release v1.0.6"
```

Don't use lightweight tags (`git tag v1.0.6`) for releases.

**Tag ordering:** alpha → beta → rc → release

```
v1.3.0-alpha.1
v1.3.0-alpha.2
v1.3.0-beta.1
v1.3.0-rc.1
v1.3.0
```

---

## What if there's no ticket?

There should always be a ticket. If you're tempted to skip:

- One-off doc fix? → file a ticket anyway, takes 30 seconds in Linear, keeps history coherent
- Tiny typo? → still goes through a SEKEL-NNN branch
- Genuinely exploratory spike that may never merge? → file a Linear ticket marked as a spike

The ticket is the canonical source of truth for *why* the branch exists. The repo trades a small bit of overhead for a clean, queryable git history.

---

## Long-Running Branches to Avoid

| Anti-pattern | Problem | Better approach |
|-------------|---------|----------------|
| `SEKEL-NNN-big-rewrite` open for months | Massive merge conflicts, staleness | Split the ticket; use feature flags + short branches |
| Personal branches (`tajoh/stuff`) | No ticket, no convention | File a ticket and rename |
| `staging` / `production` as dev branches | Blurs deploy targets with development | Use `main`/`dev`; keep deploy targets separate if you ever introduce them |
