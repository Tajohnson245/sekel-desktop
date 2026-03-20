// Rebuild better-sqlite3 against Electron's Node.js headers.
// Electron bundles its own Node.js (e.g. v24 / ABI 143) which differs from
// the system Node.js. Native modules must be compiled against Electron's ABI.
//
// Skipped in CI — unit tests run under plain Node.js, not Electron,
// so they need the system-native binary (compiled by npm install).
if (process.env.CI) {
  console.log('CI detected — skipping Electron-targeted rebuild');
  process.exit(0);
}

const path = require('path');
const { execSync } = require('child_process');

const desktopDir = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(desktopDir, '..', '..');

const electronVersion = require(
  path.join(desktopDir, 'node_modules', 'electron', 'package.json')
).version;

const ext = process.platform === 'win32' ? '.cmd' : '';
const rebuildBin = path.join(desktopDir, 'node_modules', '.bin', `electron-rebuild${ext}`);

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
execSync(
  `"${rebuildBin}" -f -w better-sqlite3 -v ${electronVersion}`,
  { stdio: 'inherit', cwd: monorepoRoot }
);
console.log('better-sqlite3 rebuild complete');
