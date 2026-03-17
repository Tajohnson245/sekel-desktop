const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Monorepo root — better-sqlite3 is hoisted here by npm workspaces.
// @electron/rebuild must target this directory, not apps/desktop/node_modules.
const MONOREPO_ROOT = path.join(__dirname, '..', '..');

module.exports = {
  hooks: {
    // Runs before every `electron-forge start`. Rebuilds better-sqlite3 for the
    // correct Electron NMV. Uses execSync so output is visible and failures are fatal.
    // CWD is the monorepo root so the hoisted node_modules/better-sqlite3 is found.
    preStart: async () => {
      const { execSync } = require('child_process');
      const electronVersion = require(path.join(__dirname, 'node_modules', 'electron', 'package.json')).version;
      // Absolute path to the CLI installed in apps/desktop (.cmd on Windows)
      const ext = process.platform === 'win32' ? '.cmd' : '';
      const rebuildBin = path.join(__dirname, 'node_modules', '.bin', `electron-rebuild${ext}`);
      console.log(`[forge] Rebuilding better-sqlite3 for Electron ${electronVersion} (NMV fix)...`);
      execSync(
        `"${rebuildBin}" -f -w better-sqlite3 -v ${electronVersion}`,
        { stdio: 'inherit', cwd: MONOREPO_ROOT }
      );
      console.log('[forge] better-sqlite3 rebuild complete');
    },
  },
  packagerConfig: {
    asar: true,
    name: 'Sekel',
    executableName: 'sekel',
  },
  rebuildConfig: { force: true },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.ts',
            config: 'vite.main.config.ts',
            target: 'main',
          },
          {
            entry: 'src/preload.ts',
            config: 'vite.preload.config.ts',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.ts',
          },
        ],
      },
    },
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
