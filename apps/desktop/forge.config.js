const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Monorepo root — better-sqlite3 is hoisted here by npm workspaces.
// @electron/rebuild must target this directory, not apps/desktop/node_modules.
const MONOREPO_ROOT = path.join(__dirname, '..', '..');

function rebuildSqlite(arch) {
  const { execSync } = require('child_process');
  // Use Node's module resolution rather than a hard-coded path -- on CI runners
  // npm workspaces hoist electron to MONOREPO_ROOT/node_modules, so the local
  // apps/desktop/node_modules/electron path doesn't exist. require() walks up.
  const electronVersion = require('electron/package.json').version;
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const rebuildBin = path.join(MONOREPO_ROOT, 'node_modules', '.bin', `electron-rebuild${ext}`);
  const targetArch = arch || process.arch;
  console.log(`[forge] Rebuilding better-sqlite3 for Electron ${electronVersion} (${targetArch})...`);
  execSync(
    `"${rebuildBin}" -f -w better-sqlite3 -v ${electronVersion} --arch=${targetArch}`,
    { stdio: 'inherit', cwd: MONOREPO_ROOT }
  );
  console.log('[forge] better-sqlite3 rebuild complete');
}

// Windows code signing happens outside this config -- the GitHub Actions
// release workflow invokes Azure/trusted-signing-action against the
// out/make artifacts before uploading to GitHub Releases + Cloudflare R2.
// See .github/workflows/release.yml.

module.exports = {
  hooks: {
    prePackage: async (_config, _platform, arch) => rebuildSqlite(arch),
  },
  packagerConfig: {
    asar: { unpack: '**/*.node' },
    prune: false,
    name: 'Sekel',
    executableName: 'sekel',
    icon: path.join(__dirname, 'assets', 'sekel_logo'),
    appCopyright: 'Copyright © 2026 BYTEFLOW LLC',
    win32metadata: {
      CompanyName: 'BYTEFLOW LLC',
      ProductName: 'Sekel',
      FileDescription: 'SEKEL - Intelligent Flashcards',
    },
    fileAssociations: [
      {
        ext: 'spkg',
        name: 'Sekel Package',
        description: 'Sekel Flashcard Package',
        icon: path.join(__dirname, 'assets', 'sekel_logo'),
        mimeType: 'application/x-spkg',
        role: 'Editor',
      },
    ],
    // The packager doesn't copy node_modules in a monorepo workspace setup.
    // Walk the full production dependency tree and copy each package from
    // wherever npm placed it (local node_modules or hoisted to monorepo root).
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          const fs = require('fs');
          const buildNM = path.join(buildPath, 'node_modules');
          const localNM = path.join(__dirname, 'node_modules');
          const rootNM  = path.join(MONOREPO_ROOT, 'node_modules');
          const visited = new Set();

          // Resolve the real source for a package: prefer local, but if it's
          // a symlink/junction (hoisted by npm workspaces), use the root copy.
          function findSrc(depName) {
            const localPath = path.join(localNM, depName);
            const rootPath  = path.join(rootNM, depName);
            if (fs.existsSync(localPath)) {
              try {
                if (fs.lstatSync(localPath).isSymbolicLink()) {
                  return fs.existsSync(rootPath) ? rootPath : null;
                }
              } catch (_) {}
              return localPath;
            }
            return fs.existsSync(rootPath) ? rootPath : null;
          }

          // Walk a package.json's `dependencies` and recurse.
          function walkDeps(pkgJsonPath) {
            if (!fs.existsSync(pkgJsonPath)) return;
            try {
              const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
              for (const dep of Object.keys(pkgJson.dependencies || {})) copyDep(dep);
            } catch (_) {}
          }

          // Walk every package.json inside a node_modules folder (handles both
          // unscoped `pkg/` and scoped `@scope/pkg/` directory layouts).
          function walkNestedNodeModules(nmDir) {
            if (!fs.existsSync(nmDir)) return;
            let entries;
            try { entries = fs.readdirSync(nmDir); } catch (_) { return; }
            for (const entry of entries) {
              if (entry === '.bin' || entry === '.cache') continue;
              const entryPath = path.join(nmDir, entry);
              let stat;
              try { stat = fs.statSync(entryPath); } catch (_) { continue; }
              if (!stat.isDirectory()) continue;
              if (entry.startsWith('@')) {
                // Scoped: recurse one level deeper.
                let subEntries;
                try { subEntries = fs.readdirSync(entryPath); } catch (_) { continue; }
                for (const sub of subEntries) {
                  walkDeps(path.join(entryPath, sub, 'package.json'));
                  walkNestedNodeModules(path.join(entryPath, sub, 'node_modules'));
                }
              } else {
                walkDeps(path.join(entryPath, 'package.json'));
                walkNestedNodeModules(path.join(entryPath, 'node_modules'));
              }
            }
          }

          // Recursively copy a package and all of its runtime dependencies,
          // including the deps of any nested versions (npm workspaces hoist
          // most packages to root but pin conflicting versions inline under
          // a parent's node_modules; those nested versions can pull in deps
          // not visible at the top level -- e.g. isomorphic-dompurify nests
          // html-encoding-sniffer@6 which requires @exodus/bytes).
          function copyDep(depName) {
            if (visited.has(depName) || depName === 'electron') return;
            visited.add(depName);

            const dest = path.join(buildNM, depName);
            if (!fs.existsSync(dest)) {
              const src = findSrc(depName);
              if (!src) return;
              console.log(`[forge] Copying ${depName}...`);
              fs.cpSync(src, dest, { recursive: true, force: true });
            }

            walkDeps(path.join(dest, 'package.json'));
            walkNestedNodeModules(path.join(dest, 'node_modules'));
          }

          // Seed with the desktop's declared production dependencies.
          console.log('[forge] Resolving production dependency tree...');
          const desktopPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
          for (const dep of Object.keys(desktopPkg.dependencies || {})) copyDep(dep);

          // Always overwrite better-sqlite3 with the freshly rebuilt native binary.
          const bs3Src = path.join(rootNM, 'better-sqlite3');
          const bs3Dest = path.join(buildNM, 'better-sqlite3');
          if (fs.existsSync(bs3Src)) {
            console.log('[forge] Overwriting better-sqlite3 with rebuilt binary...');
            fs.cpSync(bs3Src, bs3Dest, { recursive: true, force: true });
          }

          callback();
        } catch (err) {
          callback(err);
        }
      },
    ],
  },
  rebuildConfig: { force: true },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Sekel',
        setupIcon: path.join(__dirname, 'assets', 'sekel_logo.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Tajohnson245',
          name: 'sekel-desktop'
        },
        prerelease: false,
        draft: true
      }
    },
    {
      name: '@electron-forge/publisher-s3',
      config: {
        bucket: 'sekel-releases',
        endpoint: 'https://10b526ce06de458a7e43834f97953694.r2.cloudflarestorage.com',
        region: 'auto',
        public: true,
        keyResolver: (fileName, platform, arch) => {
          return `${platform}/${arch}/${fileName}`;
        }
      }
    }
  ]
};
