const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Monorepo root — better-sqlite3 is hoisted here by npm workspaces.
// @electron/rebuild must target this directory, not apps/desktop/node_modules.
const MONOREPO_ROOT = path.join(__dirname, '..', '..');

function rebuildSqlite(arch) {
  const { execSync } = require('child_process');
  const electronVersion = require(path.join(__dirname, 'node_modules', 'electron', 'package.json')).version;
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const rebuildBin = path.join(__dirname, 'node_modules', '.bin', `electron-rebuild${ext}`);
  const targetArch = arch || process.arch;
  console.log(`[forge] Rebuilding better-sqlite3 for Electron ${electronVersion} (${targetArch})...`);
  execSync(
    `"${rebuildBin}" -f -w better-sqlite3 -v ${electronVersion} --arch=${targetArch}`,
    { stdio: 'inherit', cwd: MONOREPO_ROOT }
  );
  console.log('[forge] better-sqlite3 rebuild complete');
}

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
        ext: 'sekel',
        name: 'Sekel Package',
        description: 'Sekel Flashcard Package',
        icon: path.join(__dirname, 'assets', 'sekel_logo'),
        mimeType: 'application/x-sekel',
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

          // Recursively copy a package and all of its runtime dependencies.
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

            const pkgJsonPath = path.join(dest, 'package.json');
            if (!fs.existsSync(pkgJsonPath)) return;
            try {
              const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
              for (const dep of Object.keys(pkgJson.dependencies || {})) copyDep(dep);
            } catch (_) {}
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
          name: 'sekel'
        },
        prerelease: false,
        draft: true
      }
    }
  ]
};
