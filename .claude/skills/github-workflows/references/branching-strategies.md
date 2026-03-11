# Branching Strategies — Deep Reference

## 1. GitHub Flow

**Origin:** GitHub's internal practice, published 2011 by Scott Chacon.

**Topology:**
```
main          ← always deployable, direct-to-production
feature/*     ← all work (features, fixes, chores), branch from main, PR back to main
```

**How it works:**
1. Branch from `main` with a descriptive name
2. Commit frequently, push to remote regularly
3. Open a PR when ready for review (or earlier as a draft)
4. Discuss and iterate; CI must pass
5. Merge to `main` → triggers immediate deploy

**Pros:**
- Extremely simple — one long-lived branch
- Continuous deployment friendly
- Low cognitive overhead for small teams
- Easy to understand for new contributors

**Cons:**
- Releases are implicit (every merge to main is a release)
- Hard to maintain multiple supported versions
- Requires strong CI/CD and feature flags for incomplete work
- Not suited for scheduled release cadences

**Best for:** SaaS products, web apps, small-to-medium teams deploying frequently.

**Common mistakes:**
- Keeping feature branches open too long (causes big, painful merges)
- Merging without a PR/review process
- Not using draft PRs for work-in-progress

---

## 2. GitFlow

**Origin:** Vincent Driessen's "A successful Git branching model," 2010.

**Topology:**
```
main          ← production-only; tagged for every release
develop       ← integration branch; all features merge here
feature/*     ← new work; branch from develop, merge back to develop
release/*     ← release prep; branch from develop, merge to main AND develop
hotfix/*      ← production patches; branch from main, merge to main AND develop
```

**How it works:**
- `develop` accumulates completed features
- When enough features are ready, cut a `release/vX.Y.Z` branch
- Only bugfixes go into `release/*` — no new features
- When stable, merge `release/*` → `main` (tag it) AND back into `develop`
- If a production bug is critical, cut `hotfix/vX.Y.Z` from `main`
- Merge hotfix → `main` (tag it) AND → `develop`

**Pros:**
- Clear history: main is always clean production state
- Supports parallel development of multiple versions
- Hotfix path is well-defined
- Scheduled release cadences are easy to manage

**Cons:**
- High complexity — many branch types to track
- Frequent merge conflicts, especially on long-lived branches
- `develop` branch can diverge significantly from `main`
- Not well-suited to continuous deployment
- Can lead to "big bang" release merges

**Best for:** Mobile apps, packaged software, libraries with scheduled releases, teams needing to maintain multiple versions.

**Common mistakes:**
- Merging features directly to `main` (bypasses integration testing on develop)
- Forgetting to merge `release/*` back to `develop`
- Not deleting merged `feature/*` branches (creates noise)
- Branching `hotfix/*` from `develop` instead of `main`

---

## 3. Trunk-Based Development (TBD)

**Origin:** Evolved from XP practices; formalized by Paul Hammant at trunkbaseddevelopment.com.

**Topology:**
```
main (trunk)  ← always green; deployed continuously or at any time
feature/*     ← short-lived (< 2 days ideally, never > 1 week); merge back fast
release/x.y   ← optional; cut from main for stabilization if needed
```

**How it works:**
- All developers commit to `main` daily (or via very short-lived feature branches)
- Feature flags hide incomplete work in production
- CI must be fast (< 10 min) and blocking — broken trunk is a P0
- Releases are tags on `main`, optionally with a stabilization branch

**Pros:**
- Continuous integration in the truest sense — no long-lived divergence
- Fastest feedback loops
- No merge conflicts from long-lived branches
- Scales well to large teams when done correctly

**Cons:**
- Requires strong CI/CD discipline
- Feature flags add complexity to the codebase
- Not beginner-friendly
- Hard to maintain multiple production versions

**Best for:** Large engineering organizations (Google, Facebook-style), teams with mature CI/CD, continuous deployment products.

**Common mistakes:**
- Keeping "short-lived" branches open for weeks (defeats the purpose)
- Not investing in feature flags, leading to hidden incomplete code shipping
- Slow or flaky CI — broken trunk stops everyone

---

## Comparison Table

| Dimension | GitHub Flow | GitFlow | Trunk-Based |
|-----------|------------|---------|-------------|
| Complexity | Low | High | Medium |
| Long-lived branches | 1 (main) | 2 (main, develop) | 1 (main) |
| Release cadence | Continuous | Scheduled | Continuous |
| Team size | 1–15 | 4–50 | 10–unlimited |
| CI/CD requirement | Moderate | Low | High |
| Multiple versions | Hard | Easy | Moderate |
| Merge conflict risk | Low | High | Very low |
| Learning curve | Easy | Steep | Moderate |

---

## Migration Guides

### GitFlow → GitHub Flow

1. Freeze new feature branches on `develop`
2. Complete in-flight release branches normally
3. After the release: merge `develop` into `main`, delete `develop`
4. Update CI to deploy from `main` on every merge
5. Establish PR review requirements on `main`
6. Train team: everything goes to `main` now, use PRs

**Caution:** This requires CI/CD to be solid before switching. Don't migrate mid-release-cycle.

### GitHub Flow → Trunk-Based Development

1. Enforce branch lifetime limits (start with 3 days max, reduce over time)
2. Introduce feature flags for in-progress work (use a library like LaunchDarkly, Unleash, or simple env vars)
3. Speed up CI until it runs in < 10 minutes
4. Set up automated rollback procedures
5. Gradually reduce branch lifetime target to < 1 day

**Caution:** Don't attempt this without fast, reliable CI. The whole model depends on it.

### GitFlow → Trunk-Based Development

Do GitFlow → GitHub Flow first (less disruptive), then GitHub Flow → Trunk. Don't skip steps.
