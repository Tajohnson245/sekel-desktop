# Update Modal Notes Format — Follow-up

---

**Status:** `Open — not yet ticketed`
**Origin:** Observed during v1.0.9 rollout (SEKEL-125)
**Created:** 2026-05-09

---

## The bug

When a user on v1.0.7 or v1.0.8 was prompted to install v1.0.9, the modal showed:

```
### Changed
**Cleaner update notifications.** When a new version is ready, the "Update available" prompt now shows…
```

— with the literal `###` and `**` markers visible, formatted as flat bullets.

## Why it happened

The `update-downloaded` modal that prompts a user to install a new version is rendered by the **currently installed** version of the app, not by the new version being downloaded. Concretely:

- v1.0.9 ships `react-markdown` in `UpdateAvailableModal.tsx` to render markdown properly.
- v1.0.7 and v1.0.8 (the versions currently in users' hands) ship the old `parseBullets()` implementation that splits notes on `\n` and treats each line as a `<li>`.
- The new CHANGELOG-based notes (with `### Changed` headings and `**bold**` lead-ins) were uploaded to R2 by v1.0.9's release CI and then rendered by v1.0.7/v1.0.8's old modal — which can't parse markdown.

There is no version of the auto-updater UX where the new renderer applies to its own release. The first release where a user benefits from a renderer change is the *next* release after the one introducing it. v1.0.9 → v1.0.10 will look correct.

## Why it matters

Two distinct problems surface from this:

1. **Bad first impression for the very release that's supposed to fix this.** Users on v1.0.7/v1.0.8 will see uglier notes than they did before, because the new format assumes a markdown renderer they don't have.
2. **Latent risk for any future modal change.** Anyone changing modal rendering in the future hits the same trap unless they remember the lag.

## Options for proper fix

Pick one — implementation cost ascends top-to-bottom:

### A. Format CHANGELOG to degrade gracefully *(recommended for next release)*

Write user-facing CHANGELOG entries as a flat bullet list with bold lead-ins, no `###` subheadings:

```md
## [1.0.10] - YYYY-MM-DD

- **Cleaner update notifications.** When a new version is ready…
- **Sekel logo replaces the wordmark.** The header now shows…
```

The old `parseBullets`-based modal sees:
- Bullet 1: `**Cleaner update notifications.** When a new version is ready…`
- Bullet 2: `**Sekel logo replaces the wordmark.** The header now shows…`

Stray `**` markers but readable structure. New modal renders the bold properly.

Cost: a CHANGELOG authoring guideline. Update the convention note in `CHANGELOG.md` accordingly.

### B. Two-path R2 notes

CI uploads two files per release:
- `notes/v<X.Y.Z>.md` — old format (plain bullets, no markdown markers) — unchanged path that legacy clients fetch
- `notes/v<X.Y.Z>.rich.md` — full markdown for clients that know to fetch it

New client (v1.0.10+) fetches `.rich.md`, falls back to `.md`. Old clients see the plain version, oblivious.

Cost: small CI step + a renderer-side fetch fallback in v1.0.10.

### C. Server-side markdown→HTML rendering

CI converts the CHANGELOG section to sanitized HTML, uploads HTML alongside (or instead of) markdown. Modal becomes a `dangerouslySetInnerHTML` consumer.

Cost: bigger renderer change, sanitization concerns, opinionated HTML output that may clash with theming.

### D. Wait it out

Accept one cycle of bad notes (v1.0.7/v1.0.8 → v1.0.9). By the time v1.0.10 ships, anyone on v1.0.9 will see the new modal correctly. Cost: zero, but users on older versions get an ugly upgrade prompt for v1.0.10 too.

## Recommendation

Pair **Option A** (CHANGELOG format guideline) with the v1.0.10 release. It's the smallest delta and removes the lag for all future modal-renderer changes — the format is forward- and backward-compatible. If finer formatting becomes valuable later, layer Option B on top.

## Follow-up actions

- [ ] Open SEKEL-XXX ticket: "CHANGELOG format guideline for old-modal compatibility"
- [ ] Update `CHANGELOG.md`'s authoring-note paragraph to recommend the flat-bullets-with-bold-lead-in pattern
- [ ] Reference this doc from CLAUDE.md so future contributors know about the lag
