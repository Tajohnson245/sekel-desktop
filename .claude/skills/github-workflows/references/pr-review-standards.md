# PR Review Standards — Full Guide

## PR Description Template

Copy-paste ready for `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What
<!-- 1–3 sentences: what does this PR change? Be specific. -->

## Why
<!-- Context: what problem does this solve, or what feature does it add?
     Link to the issue/ticket if one exists. -->

## How
<!-- Brief technical approach. Key decisions made. Alternatives considered. -->

## Testing
<!-- How was this verified?
     - Unit tests added/updated?
     - Manual testing steps?
     - E2E tests passing? -->

## Screenshots / Demo
<!-- If this changes UI, include before/after screenshots or a GIF.
     Delete this section if not applicable. -->

## Checklist
- [ ] Tests pass locally
- [ ] No console.log / debug artifacts left in
- [ ] CHANGELOG updated (if this is a release-worthy change)
- [ ] Docs updated (if API or behavior changed)
- [ ] No unrelated changes snuck in
```

---

## PR Title Format

Follow the same convention as commit messages:

```
<type>(<scope>): <short description>
```

Examples:
```
feat(auth): add Google OAuth2 login
fix(cart): resolve null pointer on empty cart checkout
chore(deps): upgrade React to 19.1.0
docs(api): document authentication endpoints
refactor(user-service): extract email validation logic
```

---

## PR Size Guidelines

| Size | Lines Changed | Status |
|------|--------------|--------|
| Ideal | < 400 lines | Review quickly, merge fast |
| Acceptable | 400–800 lines | Reasonable, take care |
| Too large | > 800 lines | ⚠️ Should be split |

**Why size matters:**
- Reviewers lose focus after ~400 lines; quality drops
- Large PRs take longer to merge, causing branch divergence
- Smaller PRs are easier to roll back if something goes wrong

### How to Split a Large PR

**By layer (horizontal split):**
- PR 1: Database schema + migrations
- PR 2: API/service layer
- PR 3: UI components

**By feature slice (vertical split):**
- PR 1: Core functionality (happy path only)
- PR 2: Edge cases and error handling
- PR 3: UI polish and loading states

**By file type:**
- PR 1: Configuration and infrastructure changes
- PR 2: Application logic changes
- PR 3: Test additions

**Strategy:** identify the smallest shippable unit and make that PR 1. Each subsequent PR builds on it.

---

## Review Etiquette

### Giving Reviews

**Comment prefixes to signal intent:**
- `nit:` — Minor style or preference. Non-blocking. Reviewer happy if addressed.
- `suggestion:` — Improvement idea. Non-blocking. Author's call.
- `question:` — Clarification needed. Non-blocking until answered.
- `blocker:` or no prefix — Must be resolved before merge.
- `praise:` — Positive feedback. Use it often.

**Examples:**
```
nit: Could rename `data` to `userData` for clarity.

blocker: This will cause a SQL injection vulnerability — use parameterized queries.

suggestion: Consider extracting this into a helper function since it's used in 3 places.

question: Why did we choose to use setTimeout here rather than requestAnimationFrame?

praise: Great use of early return to reduce nesting here!
```

**Review turnaround expectations:**
- Reviews should be done within 1 business day for normal PRs
- Critical/urgent PRs: within 4 hours (flag explicitly in the PR)
- If you can't review in time, say so — let the author find another reviewer

### Receiving Reviews

- Don't take review comments personally — they're about the code
- If you disagree, explain your reasoning calmly and discuss
- Resolve conversations when you've addressed the comment (or chosen not to and explained why)
- Don't resolve other people's conversations — let the reviewer close them

### Handling Disagreements

1. Discuss on the PR comment thread first
2. If unresolved, take it to a team channel or pair programming session
3. If still unresolved, escalate to tech lead or agreed team decision-maker
4. Document the decision in the PR for future reference

---

## Squash vs Merge vs Rebase

| Strategy | Result | When to use |
|----------|--------|-------------|
| **Squash and merge** | All commits squashed into one on main | Feature branches with messy WIP commits |
| **Merge commit** | Preserves all commits + adds merge commit | When you want to preserve full branch history |
| **Rebase and merge** | Replays commits linearly on main | Clean commit history, no merge commits |

**Recommendations by team style:**
- **Linear history preference:** Rebase and merge (no merge commits, clean `git log`)
- **Feature branch history preserved:** Merge commit (shows when features landed)
- **Simplicity:** Squash and merge (each PR = one commit on main)

Configure the default in GitHub: Settings → General → Pull Requests. Disable the options you don't want to prevent inconsistency.

---

## Draft PRs

Use draft PRs when:
- Work is in progress and not ready for review
- You want early feedback on direction before implementation is complete
- You're blocked and want to preserve the branch state visibly

**How to use:**
1. Open PR as draft from GitHub UI or: `gh pr create --draft`
2. The PR is visible but reviewers know not to do a formal review
3. When ready: "Ready for review" button promotes it to a normal PR

---

## Auto-Close Keywords

In the PR description or commit message body, these keywords auto-close the linked issue on merge:

```
Closes #42
Fixes #42
Resolves #42
```

- Works with single issues: `Closes #42`
- Multiple issues: `Closes #42, Closes #87`
- Cross-repo: `Closes owner/repo#42`
- These only auto-close on merge to the **default branch** (usually `main`)

---

## CI Requirements Before Merge

Recommended minimum checks to require on `main`:
- [ ] All tests pass
- [ ] Linting passes (no errors)
- [ ] Type checking passes (TypeScript/mypy/etc.)
- [ ] Build succeeds
- [ ] At least 1 approving review

Configure in GitHub: Settings → Branches → Branch protection rules → Require status checks to pass.
