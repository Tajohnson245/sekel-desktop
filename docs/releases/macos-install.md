# Installing Sekel on macOS

Sekel ships an unsigned `.dmg` for macOS. Apple's Gatekeeper will block it on
first launch — this is normal for apps without an Apple Developer ID. The
steps below take ~30 seconds.

## 1. Download the right build

Pick the build that matches your Mac's chip:

- **Apple Silicon** (M1, M2, M3, M4, M5 — every Mac sold since late 2020):
  `Sekel-1.0.3-arm64.dmg`
- **Intel Macs** (older MacBooks, iMacs, Mac Pros):
  `Sekel-1.0.3-x64.dmg`

Not sure which you have? Click the Apple menu → About This Mac. If "Chip"
says anything starting with **Apple**, use the arm64 build. If it says
**Intel**, use the x64 build.

Latest release: <https://github.com/Tajohnson245/sekel-desktop/releases/latest>

## 2. Install

1. Double-click the `.dmg`. A window opens with `Sekel.app` and an
   `Applications` shortcut.
2. Drag `Sekel` into `Applications`.
3. Eject the DMG (drag it to the Trash, or click the eject icon in Finder).

## 3. First launch — bypass Gatekeeper

Because the app isn't signed with an Apple Developer ID, double-clicking it
the first time shows:

> **"Sekel" cannot be opened because Apple cannot check it for malicious software.**

This is expected. Do this **once** to allow it:

1. Open `Applications` in Finder.
2. **Right-click** (or Control-click) `Sekel` → **Open**.
3. The dialog now has an **Open** button. Click it.

After that first time, Sekel launches normally from the Dock, Spotlight, or
Launchpad.

### Alternative: clear the quarantine attribute via Terminal

If the right-click trick doesn't show an Open button (newer macOS versions
sometimes hide it), open Terminal and run:

```bash
xattr -d com.apple.quarantine /Applications/Sekel.app
```

Then double-click `Sekel` normally. This permanently clears the quarantine
flag and is equivalent to telling macOS "I trust this app."

## 4. Updates

**Auto-updates are not available on macOS.** When a new version ships, you'll
need to:

1. Download the new `.dmg` from the releases page above.
2. Drag the new `Sekel.app` into `Applications`, replacing the old one.
3. Your data, decks, and settings are preserved — they live in
   `~/Library/Application Support/Sekel/`, not inside the `.app` bundle.

(Auto-updates require Apple code signing + notarization, which Sekel doesn't
have yet. Windows users get auto-updates via a separate mechanism.)

## Troubleshooting

**"App is damaged and can't be opened. Move to Trash."**
This is the same Gatekeeper warning, worded more aggressively on some
macOS versions. The Terminal `xattr` command in step 3 fixes it.

**App opens but shows a blank window**
Quit the app (Cmd+Q), then relaunch. If it persists, check
`~/Library/Application Support/Sekel/sekel.log` for errors.

**`sekel://` deep links (email confirmation, password reset) don't open the app**
Make sure you've launched Sekel at least once after installing — macOS only
registers the URL handler after the first successful launch.

**Where is my data stored?**
- Database, media, settings: `~/Library/Application Support/Sekel/`
- Logs: `~/Library/Application Support/Sekel/sekel.log`
- Crash reports: `~/Library/Application Support/Sekel/crash.log`
