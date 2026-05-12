/**
 * Windows file association for .spkg.
 *
 * Why this exists: `fileAssociations` in forge.config.js is an @electron/packager
 * option that only writes to macOS Info.plist — Squirrel.Windows never registers
 * file extensions, so without these registry writes Explorer shows the generic
 * blank-document icon for .spkg files.
 *
 * We write under HKCU (per-user, matches Sekel's per-user Squirrel install — no
 * admin needed) and re-run on every app startup, which makes the registration
 * self-healing across version updates: `process.execPath` rotates between
 * `app-X.Y.Z` folders after each Squirrel update, and re-writing on launch keeps
 * the registry pointing at the current binary.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const EXT = '.spkg';
const PROG_ID = 'Sekel.spkg';
const DESCRIPTION = 'Sekel Flashcard Package';
const MIME_TYPE = 'application/x-spkg';

function regAddDefault(key: string, value: string): void {
    execFileSync('reg.exe', ['add', key, '/ve', '/d', value, '/f', '/t', 'REG_SZ'], {
        stdio: 'ignore',
        windowsHide: true,
    });
}

function regAddNamed(key: string, name: string, value: string): void {
    execFileSync('reg.exe', ['add', key, '/v', name, '/d', value, '/f', '/t', 'REG_SZ'], {
        stdio: 'ignore',
        windowsHide: true,
    });
}

function regDeleteKey(key: string): void {
    try {
        execFileSync('reg.exe', ['delete', key, '/f'], { stdio: 'ignore', windowsHide: true });
    } catch {
        // Absent → nothing to delete. Not an error.
    }
}

// Tell Explorer to drop its icon cache so the new association is visible
// without a logout / explorer.exe restart. SHCNE_ASSOCCHANGED = 0x08000000,
// SHCNF_IDLIST = 0x0000. Cosmetic — failure is fine, Explorer catches up on
// its own eventually.
function broadcastAssocChanged(): void {
    try {
        execFileSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-WindowStyle', 'Hidden',
                '-Command',
                "Add-Type -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"Shell32.dll\")]public static extern void SHChangeNotify(uint a,uint b,System.IntPtr c,System.IntPtr d);' -Name N -Namespace S; [S.N]::SHChangeNotify(0x08000000,0,[System.IntPtr]::Zero,[System.IntPtr]::Zero)",
            ],
            { stdio: 'ignore', windowsHide: true, timeout: 5000 },
        );
    } catch {
        // ignore
    }
}

export interface RegisterOptions {
    execPath: string;
    isPackaged: boolean;
}

export function registerSpkgFileAssociation({ execPath, isPackaged }: RegisterOptions): boolean {
    if (process.platform !== 'win32') return false;
    // In dev mode execPath points at the Electron binary, not Sekel.exe. Don't
    // hijack .spkg system-wide to launch dev electron.
    if (!isPackaged) return false;

    const exe = path.normalize(execPath);

    // Update.exe sits at the install root, one level above app-X.Y.Z\Sekel.exe.
    // Using it as the launcher keeps the open-command stable across Squirrel
    // updates (the per-version exe path becomes invalid the moment Squirrel
    // rotates folders during an update).
    const installRoot = path.dirname(path.dirname(exe));
    const updateExe = path.join(installRoot, 'Update.exe');
    const exeName = path.basename(exe);

    const openCommand = `"${updateExe}" --processStart="${exeName}" --process-start-args="\\"%1\\""`;
    const iconRef = `"${exe}",0`;

    const extKey = `HKCU\\Software\\Classes\\${EXT}`;
    const progIdKey = `HKCU\\Software\\Classes\\${PROG_ID}`;

    regAddDefault(extKey, PROG_ID);
    regAddNamed(extKey, 'Content Type', MIME_TYPE);
    regAddDefault(progIdKey, DESCRIPTION);
    regAddDefault(`${progIdKey}\\DefaultIcon`, iconRef);
    regAddDefault(`${progIdKey}\\shell\\open\\command`, openCommand);

    broadcastAssocChanged();
    return true;
}

export function unregisterSpkgFileAssociation(): boolean {
    if (process.platform !== 'win32') return false;

    regDeleteKey(`HKCU\\Software\\Classes\\${EXT}`);
    regDeleteKey(`HKCU\\Software\\Classes\\${PROG_ID}`);

    broadcastAssocChanged();
    return true;
}
