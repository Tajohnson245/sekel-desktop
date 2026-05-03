#!/usr/bin/env node

/**
 * bump.js — Version management for the Sekel monorepo.
 *
 * Usage:
 *   node scripts/bump.js <app> <version>   Bump app + its packages to <version>
 *   node scripts/bump.js --check            Validate all package.json versions match version.json
 *   node scripts/bump.js --status           Show current versions for all apps
 *
 * Examples:
 *   node scripts/bump.js desktop 1.5.0
 *   node scripts/bump.js --check
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(__dirname, 'version.json');

// Map each app to the packages it owns (versioned together)
const APP_PACKAGES = {
  desktop: ['apps/desktop', 'packages/components', 'packages/db', 'packages/observability'],
};

function readVersionFile() {
  return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
}

function writeVersionFile(versions) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versions, null, 2) + '\n');
}

function readPackageJson(pkgPath) {
  const fullPath = path.join(ROOT, pkgPath, 'package.json');
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function writePackageJson(pkgPath, data) {
  const fullPath = path.join(ROOT, pkgPath, 'package.json');
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
}

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

// Update @sekel/* dependency references within a package.json
function updateSekelDeps(pkg, nameToVersion) {
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depType]) continue;
    for (const [dep, currentRange] of Object.entries(pkg[depType])) {
      if (dep.startsWith('@sekel/') && nameToVersion[dep]) {
        // Preserve range prefix (^, ~, etc.) if present
        const prefix = currentRange.match(/^[^0-9]*/)?.[0] || '';
        pkg[depType][dep] = prefix + nameToVersion[dep];
      }
    }
  }
}

// --status: show all versions
function showStatus() {
  const versions = readVersionFile();
  console.log('\nSekel Monorepo Versions (from scripts/version.json):\n');

  for (const [app, version] of Object.entries(versions)) {
    const packages = APP_PACKAGES[app];
    if (!packages) continue;

    console.log(`  ${app}: ${version}`);
    for (const pkgPath of packages) {
      try {
        const pkg = readPackageJson(pkgPath);
        const match = pkg.version === version ? '✓' : `✗ (has ${pkg.version})`;
        console.log(`    ${pkgPath}/package.json: ${match}`);
      } catch {
        console.log(`    ${pkgPath}/package.json: (not found)`);
      }
    }
    console.log();
  }
}

// --check: validate all package.json files match version.json
function checkVersions() {
  const versions = readVersionFile();
  let errors = 0;

  for (const [app, expectedVersion] of Object.entries(versions)) {
    const packages = APP_PACKAGES[app];
    if (!packages) {
      console.error(`Unknown app in version.json: ${app}`);
      errors++;
      continue;
    }

    for (const pkgPath of packages) {
      try {
        const pkg = readPackageJson(pkgPath);
        if (pkg.version !== expectedVersion) {
          console.error(
            `MISMATCH: ${pkgPath}/package.json has version ${pkg.version}, expected ${expectedVersion} (from version.json "${app}")`
          );
          errors++;
        }
      } catch (err) {
        console.error(`ERROR: Could not read ${pkgPath}/package.json: ${err.message}`);
        errors++;
      }
    }
  }

  if (errors === 0) {
    console.log('All package versions match version.json.');
    process.exit(0);
  } else {
    console.error(`\n${errors} version mismatch(es) found.`);
    process.exit(1);
  }
}

// Bump: update version.json + all package.json files for an app
function bumpApp(app, newVersion) {
  if (!APP_PACKAGES[app]) {
    console.error(`Unknown app: "${app}". Valid apps: ${Object.keys(APP_PACKAGES).join(', ')}`);
    process.exit(1);
  }

  if (!isValidSemver(newVersion)) {
    console.error(`Invalid semver: "${newVersion}". Expected format: X.Y.Z`);
    process.exit(1);
  }

  const versions = readVersionFile();
  const oldVersion = versions[app];

  // Update version.json
  versions[app] = newVersion;
  writeVersionFile(versions);
  console.log(`Updated scripts/version.json: ${app} ${oldVersion} → ${newVersion}`);

  // Build a map of @sekel/name → new version (for updating cross-references)
  const nameToVersion = {};
  for (const [a, v] of Object.entries(versions)) {
    for (const pkgPath of APP_PACKAGES[a] || []) {
      try {
        const pkg = readPackageJson(pkgPath);
        nameToVersion[pkg.name] = v;
      } catch {
        // skip missing packages
      }
    }
  }
  // Override the ones we're bumping now
  for (const pkgPath of APP_PACKAGES[app]) {
    try {
      const pkg = readPackageJson(pkgPath);
      nameToVersion[pkg.name] = newVersion;
    } catch {
      // skip
    }
  }

  // Update each package.json for this app
  for (const pkgPath of APP_PACKAGES[app]) {
    try {
      const pkg = readPackageJson(pkgPath);
      pkg.version = newVersion;
      updateSekelDeps(pkg, nameToVersion);
      writePackageJson(pkgPath, pkg);
      console.log(`  Updated ${pkgPath}/package.json → ${newVersion}`);
    } catch (err) {
      console.error(`  ERROR updating ${pkgPath}: ${err.message}`);
    }
  }

  // Also update cross-references in OTHER packages that depend on bumped packages
  const allPaths = Object.values(APP_PACKAGES).flat();
  const bumpedPaths = new Set(APP_PACKAGES[app]);
  for (const pkgPath of allPaths) {
    if (bumpedPaths.has(pkgPath)) continue;
    try {
      const pkg = readPackageJson(pkgPath);
      const before = JSON.stringify(pkg);
      updateSekelDeps(pkg, nameToVersion);
      if (JSON.stringify(pkg) !== before) {
        writePackageJson(pkgPath, pkg);
        console.log(`  Updated cross-references in ${pkgPath}/package.json`);
      }
    } catch {
      // skip
    }
  }

  console.log(`\nDone. To release, commit and push tag: ${app}/v${newVersion}`);
}

// CLI
const args = process.argv.slice(2);

if (args[0] === '--check') {
  checkVersions();
} else if (args[0] === '--status') {
  showStatus();
} else if (args.length === 2) {
  bumpApp(args[0], args[1]);
} else {
  console.log(`Usage:
  node scripts/bump.js <app> <version>   Bump app version
  node scripts/bump.js --check            Validate versions match
  node scripts/bump.js --status           Show current versions

Apps: ${Object.keys(APP_PACKAGES).join(', ')}`);
  process.exit(1);
}
