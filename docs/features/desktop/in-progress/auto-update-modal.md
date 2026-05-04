# Auto Update Modal
> Auto-created by post-task hook. Update with intent and description.

---

**Status:** `In Progress`
**Target Version:** `desktop/vX.X.X` | TBD
**Branch:** `SEKEL-117-auto-update-modal`
**Created:** 2026-05-04
**Last Updated:** 2026-05-04
**Shipped:** —

---

## Overview

Replaces Electron's stock auto-update notification with an in-app React modal that shows what changed in the new version. The native dialog (`update-electron-app`'s `notifyUser: true`) is not customizable — no title, body, or release notes can be edited. The custom modal renders bullet-point release notes fetched from the corresponding GitHub Release body, with a scrollable list that adapts to short or long changelogs.

## Architecture

- **Main process** ([apps/desktop/src/main.ts](../../../../apps/desktop/src/main.ts))
  - `update-electron-app` runs with `notifyUser: false`.
  - `autoUpdater.on('update-downloaded', …)` fires after Squirrel finishes downloading the new version, then calls `fetchGitHubReleaseNotes(version)` against `Tajohnson245/sekel` (the repo `publisher-github` targets in [forge.config.js](../../../../apps/desktop/forge.config.js)).
  - Forwards `{ version, notes }` to the renderer via `webContents.send('update:downloaded', …)`.
  - `ipcMain.handle('update:install')` calls `autoUpdater.quitAndInstall()`.
- **Preload bridge** ([apps/desktop/src/preload.ts](../../../../apps/desktop/src/preload.ts), [apps/desktop/src/types/electron.d.ts](../../../../apps/desktop/src/types/electron.d.ts))
  - `electronAPI.update.onDownloaded(cb)` and `electronAPI.update.install()`.
- **Renderer modal** ([apps/desktop/src/components/Update/UpdateAvailableModal.tsx](../../../../apps/desktop/src/components/Update/UpdateAvailableModal.tsx))
  - Built on the shared `Modal` primitive from `@sekel/components`.
  - Mounted globally in [AppLayout.tsx](../../../../apps/desktop/src/router/AppLayout.tsx) peer to `<OnboardingTour />`.
  - Bullet list uses `max-height: 50vh; overflow-y: auto` (see [Update.css](../../../../apps/desktop/src/components/Update/Update.css)) so the modal stays compact for short changelogs and scrolls for long ones.
- **CI release notes** ([.github/workflows/release.yml](../../../../.github/workflows/release.yml))
  - New `publish-notes` job runs after the matrix completes.
  - Calls `gh release edit --draft=false --generate-notes` to compose the release body from PR titles in the range and publish the draft.

## Key Decisions

1. **Custom React modal over native dialog** — `update-electron-app`'s built-in dialog has no API for changelog content or button labels. Brand-aligned UX requires direct `autoUpdater` event subscription.
2. **Fetch notes from GitHub Release at runtime, not from Squirrel** — Squirrel.Windows's `RELEASES` manifest does not carry release notes (the second arg to `update-downloaded` is always empty). GitHub API call has a 5s timeout and returns `null` on any failure; modal still renders with a "View on GitHub" fallback.
3. **`gh --generate-notes` over an AI summarizer** — initially planned to use Claude Haiku 4.5 to produce 3–7 user-friendly bullets, but the Anthropic API requires separate billing (Max plan does not extend to API access). GitHub's auto-summary uses PR titles and reads decently because commits already follow Conventional Commits. The `publish-notes` job is the single seam for swapping in an AI summarizer later without changing the modal.
4. **Separate `publish-notes` job** (depends on `release` matrix) — flipping the release from draft to published must happen exactly once, after every matrix combo has uploaded its artifact. A gated step inside the matrix would race; a dependent job is deterministic.

## Known Limitations / Future Work

- macOS / Linux auto-update remains gated by `app.isPackaged` only; Squirrel.Windows is the only platform with a feed wired up. The modal listener will fire on those platforms once the underlying updater is wired in, but no notes-fetch fallback is needed because `update-electron-app` already gates per-platform.
- "View past release notes" history is not in-app — users see only the next-version notes when an update arrives.
- No i18n on the modal copy.
- Considered using Claude Haiku 4.5 to refine `gh --generate-notes` output into shorter user-facing bullets; deferred until API billing is set up.

---

## Changelog

<!-- append-only; maintained by post-task hook — do not edit manually -->

| Date | Description |
|------|-------------|
| 2026-05-04 | Doc created. .claude/settings.local.json,.github/workflows/release.yml,apps/desktop/src/main.ts,apps/desktop/src/preload.ts,apps/desktop/src/router/AppLayout.tsx,apps/desktop/src/types/electron.d.ts,apps/desktop/src/components/Update/,scripts/test-release-notes.sh |
| 2026-05-04 | .claude/settings.local.json,.github/workflows/release.yml,apps/desktop/src/main.ts,apps/desktop/src/preload.ts,apps/desktop/src/router/AppLayout.tsx,apps/desktop/src/types/electron.d.ts,apps/desktop/src/components/Update/ |
