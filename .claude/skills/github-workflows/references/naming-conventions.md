# Branch & Tag Naming Conventions — Full Reference

## Branch Name Format

```
<type>/<ticket-or-scope>/<short-description>
```

- All lowercase
- Hyphens only (no underscores, no spaces, no dots)
- Max 50 characters total
- Ticket number comes before the description when applicable

---

## Branch Types

| Prefix | Purpose | Branch from | Merges to |
|--------|---------|-------------|-----------|
| `feature/` | New functionality | develop (GitFlow) or main | develop or main |
| `fix/` | Bug fixes | develop or main | develop or main |
| `hotfix/` | Urgent production fixes (GitFlow) | main | main AND develop |
| `release/` | Release preparation (GitFlow) | develop | main AND develop |
| `chore/` | Maintenance, deps, tooling | develop or main | develop or main |
| `docs/` | Documentation only | develop or main | develop or main |
| `refactor/` | Code restructuring, no behavior change | develop or main | develop or main |
| `test/` | Adding or fixing tests | develop or main | develop or main |
| `experiment/` | Exploratory/spike work, may be discarded | develop or main | may never merge |

---

## Good Branch Names — 20+ Real-World Examples

### Feature branches
```
feature/PROJ-123/user-auth                  ✅ Jira ticket + clear scope
feature/ABC-456/dark-mode-toggle            ✅ Linear ticket + feature name
feature/#42/export-to-csv                   ✅ GitHub issue + action
feature/onboarding/welcome-email            ✅ scope + description (no ticket)
feature/payments/stripe-webhook-handler     ✅ scope + specific component
feature/SEKEL-009/resend-waitlist-api       ✅ project convention example
```

### Fix branches
```
fix/PROJ-789/login-redirect-loop            ✅ ticket + specific bug
fix/#101/null-pointer-in-cart               ✅ GitHub issue + location
fix/dashboard/chart-overflow-on-mobile      ✅ scope + symptom
fix/email-validation-regex                  ✅ simple, no ticket needed
```

### Hotfix branches (GitFlow)
```
hotfix/v1.2.4/fix-payment-crash             ✅ version + specific fix
hotfix/v2.0.1/xss-in-user-profile          ✅ version + security context
```

### Release branches (GitFlow)
```
release/v2.0.0                              ✅ clean version tag
release/v1.5.0-beta.1                       ✅ pre-release
```

### Chore/docs/refactor branches
```
chore/upgrade-react-19                      ✅ specific change
chore/PROJ-200/remove-legacy-auth           ✅ ticket + scope
docs/api-authentication-guide              ✅ specific doc topic
refactor/user-service/extract-validators   ✅ scope + action
test/cart-checkout-e2e                      ✅ what is being tested
experiment/llm-summary-feature              ✅ clearly exploratory
```

---

## Bad Branch Names — What to Reject

```
fix/bug                    ❌ Too generic — what bug?
feature/stuff              ❌ Meaningless
update/changes             ❌ Says nothing
my-branch                  ❌ No type, no context
PROJ-123                   ❌ Ticket only — no description
Feature/AddLogin           ❌ Wrong case, no hyphens
fix_null_pointer           ❌ Underscores not allowed
feature/implement-the-new-user-authentication-system-with-google-oauth  ❌ Too long (>50 chars)
wip                        ❌ Use a draft PR instead
temp                       ❌ Name it properly or don't push it
```

---

## Ticket Number Patterns

| System | Pattern | Branch Example |
|--------|---------|---------------|
| Jira | `PROJ-123` | `feature/PROJ-123/user-auth` |
| Linear | `ABC-456` (team prefix) | `fix/ENG-789/retry-on-timeout` |
| GitHub Issues | `#42` or `gh-42` | `feature/#42/export-to-csv` |
| No ticketing system | Use scope instead | `feature/payments/add-refund-flow` |

---

## Environment Branch Conventions

For teams using environment-named branches:

```
staging        ← mirrors what's deployed to staging; auto-deploys
sandbox        ← experimental environment, may be unstable
production     ← avoid; use main instead (main implies deployable)
```

These should be treated as deployment targets, not development branches. Never develop directly on `staging` or `sandbox`.

---

## Tag Naming Conventions

Tags always start with `v`:

```
v1.2.3              ← standard SemVer release
v1.2.3-alpha.1      ← alpha pre-release (first alpha of 1.2.3)
v1.2.3-beta.2       ← second beta of 1.2.3
v1.2.3-rc.1         ← release candidate
v2.0.0              ← major version bump
v0.1.0              ← initial development release
```

**Always use annotated tags for releases:**
```bash
git tag -a v1.2.3 -m "Release v1.2.3"
```
Lightweight tags (`git tag v1.2.3`) lack a tagger, date, and message — don't use them for releases.

**Tag ordering matters:** alpha → beta → rc → release
```
v1.3.0-alpha.1
v1.3.0-alpha.2
v1.3.0-beta.1
v1.3.0-beta.2
v1.3.0-rc.1
v1.3.0
```

---

## Long-Running Branches to Avoid

| Anti-pattern | Problem | Better approach |
|-------------|---------|----------------|
| `dev` | Ambiguous — is it develop or a dev's personal branch? | Use `develop` (GitFlow) or eliminate entirely |
| `staging` as development branch | Blurs deploy target with development | Keep staging as a deploy mirror only |
| `feature/big-rewrite` open for months | Massive merge conflicts, staleness | Use feature flags + trunk-based short branches |
| Personal branches (`john/stuff`) | No type, no context, messy namespace | Enforce naming conventions team-wide |
