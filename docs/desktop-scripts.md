# Desktop Scripts

The `apps/desktop/scripts/` folder contains two helper scripts that solve
Electron-specific problems. Both are plain Node.js (CommonJS) and run
cross-platform (Windows + macOS + Linux).

---

## electron-dev.js

**What it does:** Launches `electron-vite dev` with `ELECTRON_RUN_AS_NODE`
removed from the environment.

**Why it exists:**

VS Code is itself an Electron app. Its integrated terminal inherits the
environment variable `ELECTRON_RUN_AS_NODE=1`. When this variable is set,
Electron runs as plain Node.js instead of as a desktop app — which means
`require('electron')` returns a file path string instead of the Electron
module, and the app crashes immediately.

We originally tried `cross-env ELECTRON_RUN_AS_NODE=` to "unset" it, but
that only sets it to an empty string. Electron's native code checks whether
the variable **exists** (`HasVar()`), not whether it has a value. An empty
string still counts as "set".

The only reliable fix is `delete process.env.ELECTRON_RUN_AS_NODE`, which
actually removes the variable from the environment before spawning
`electron-vite`.

**How it works (line by line):**

```
delete process.env.ELECTRON_RUN_AS_NODE   ← removes the var entirely
execSync('electron-vite dev', ...)        ← runs the dev server + Electron
  stdio: 'inherit'                        ← streams output to your terminal
  shell: true                             ← required on Windows for .cmd bins
```

**When it runs:** Every time you run `npm run dev`, `npm run desktop`, or
`npm run start` inside `apps/desktop`.

---

## rebuild-native.js

**What it does:** Recompiles `better-sqlite3` against Electron's bundled
Node.js headers.

**Why it exists:**

`better-sqlite3` is a native C++ addon (a `.node` file compiled from C++).
Native addons are tied to a specific Node.js ABI (Application Binary
Interface) version. Your system Node.js (e.g. v22, ABI 137) has a different
ABI than the Node.js bundled inside Electron (e.g. v24, ABI 143).

When you run `npm install`, the addon gets compiled for your **system**
Node.js. But when Electron loads it at runtime, it uses its **own** Node.js,
sees the ABI mismatch, and refuses to load the module.

`electron-rebuild` solves this by recompiling the addon using Electron's
Node.js headers instead of your system's.

**How it works (line by line):**

```
electronVersion = require('.../electron/package.json').version
                                        ← reads which Electron version is installed
rebuildBin = '.../node_modules/.bin/electron-rebuild'
                                        ← finds the electron-rebuild binary
execSync(`electron-rebuild -f -w better-sqlite3 -v ${electronVersion}`)
  -f                                    ← force rebuild even if already built
  -w better-sqlite3                     ← only rebuild this one module
  -v <version>                          ← target this Electron version's headers
  cwd: monorepoRoot                     ← run from repo root (where better-sqlite3 is hoisted)
```

**When it runs:**
- Automatically after every `npm install` / `npm ci` (via the `postinstall`
  script in `apps/desktop/package.json`)
- You can also run it manually: `node apps/desktop/scripts/rebuild-native.js`

---

## npm scripts reference

| Script | What it runs | Notes |
|--------|-------------|-------|
| `postinstall` | `rebuild-native.js` | Auto-runs after `npm install` |
| `dev` | `electron-dev.js` | Launches Electron in dev mode |
| `desktop` | `electron-dev.js` | Alias for `dev` (used by Turborepo) |
| `start` | `electron-dev.js` | Alias for `dev` |
| `package` | Inline Node one-liner | Deletes `ELECTRON_RUN_AS_NODE`, then builds + packages |
| `make` | Inline Node one-liner | Deletes `ELECTRON_RUN_AS_NODE`, then builds + makes installer |

The `package` and `make` scripts use inline `node -e "..."` instead of a
separate file because they also chain `electron-vite build` before
`electron-forge`, and a one-liner is simpler than another script file for
that.

---

## Troubleshooting

**"Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')"**
→ `ELECTRON_RUN_AS_NODE` is still set. Make sure you're using
`npm run dev` (which uses `electron-dev.js`), not calling `electron-vite dev`
directly from VS Code's terminal.

**"was compiled against a different Node.js version using NODE_MODULE_VERSION X"**
→ Run `node apps/desktop/scripts/rebuild-native.js` to recompile
`better-sqlite3` for Electron's Node.js.
