// VS Code sets ELECTRON_RUN_AS_NODE=1 because it's an Electron app.
// This makes require('electron') return a path string instead of the module.
// cross-env can only set it to "" which doesn't help — Electron checks existence, not value.
// This script deletes the var entirely, then spawns electron-vite dev.
delete process.env.ELECTRON_RUN_AS_NODE;

const { execSync } = require('child_process');
const path = require('path');

try {
  execSync('electron-vite dev', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    shell: true,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
