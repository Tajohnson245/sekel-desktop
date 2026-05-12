import * as Sentry from '@sentry/electron/main';
import { app, autoUpdater, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';

Sentry.init({
    dsn: 'https://cacb0014cc3c9ce493a71a738929f415@o4511351709171712.ingest.us.sentry.io/4511351710285824',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    release: app.getVersion(),
});

// Handle Squirrel.Windows install/update/uninstall events. When the installer
// invokes our binary with --squirrel-install / --squirrel-updated /
// --squirrel-uninstall / --squirrel-obsolete, this hook performs the
// shortcut-creation / removal work and returns true so we exit immediately
// without ever creating a BrowserWindow. Without this guard the app briefly
// shows a window during install, which Squirrel then closes and re-launches
// — the "double launch" flicker.
// On --squirrel-uninstall, clean up our .spkg registry entries synchronously
// before electron-squirrel-startup's spawnUpdate fires and we quit — otherwise
// the keys leak after uninstall.
import { registerSpkgFileAssociation, unregisterSpkgFileAssociation } from './main/fileAssociations';
if (process.platform === 'win32' && process.argv[1] === '--squirrel-uninstall') {
    try { unregisterSpkgFileAssociation(); } catch { /* best effort */ }
}
// Use require() so the module is hit synchronously before any other init.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require('electron-squirrel-startup')) {
    app.quit();
}

// ── Deep linking (sekel:// custom URL scheme) ────────────────────────────────
// Used for Supabase email confirmation, password reset, magic-link callbacks.
// The OS opens us with a URL like sekel://auth/callback#access_token=...&...
// which we forward to the renderer so it can complete the auth flow.

const DEEP_LINK_PROTOCOL = 'sekel';

// Without a single-instance lock, clicking a deep link would spawn a new
// process on Windows/Linux instead of routing to the running app. The
// 'second-instance' event below depends on this.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
    process.exit(0);
}

// Held until the renderer is ready, then delivered. Also acts as a fallback
// when the renderer mounts after the deep-link event fires.
let pendingDeepLink: string | null = null;
let mainWindowRef: import('electron').BrowserWindow | null = null;

function extractDeepLink(argv: string[]): string | null {
    return argv.find(a => typeof a === 'string' && a.startsWith(`${DEEP_LINK_PROTOCOL}://`)) ?? null;
}

function deliverDeepLink(url: string) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('deep-link', url);
        if (mainWindowRef.isMinimized()) mainWindowRef.restore();
        mainWindowRef.focus();
    } else {
        pendingDeepLink = url;
    }
}

// Cold-start: on Windows/Linux the URL is in argv. macOS uses the open-url
// event below (which fires for both cold start and while running).
if (process.platform !== 'darwin') {
    const initial = extractDeepLink(process.argv);
    if (initial) pendingDeepLink = initial;
}

app.on('second-instance', (_event, argv) => {
    const url = extractDeepLink(argv);
    if (url) deliverDeepLink(url);
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
});

import Store from 'electron-store';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
    createLogger,
    consoleTransport,
    createFileTransport,
    createRingBuffer,
    createRingBufferTransport,
    initCrashReporter,
    initIpcInstrumentation,
    metrics,
} from '@sekel/observability';
import { createMenu } from './menu';
import { initDatabase } from './main/db/index';
import { setupAIHandlers } from './ipc/ai';
import { setupAuthHandlers } from './ipc/auth';
import { setupDocumentHandlers } from './ipc/document_parsing';
import { setupDatabaseHandlers } from './ipc/database';
import { setupImportHandlers } from './ipc/import';
import { setupNotificationHandlers } from './ipc/notifications';
import { setupBackupHandlers } from './ipc/backup';
import { setupClassifyHandlers } from './ipc/classify';
import { setupExamHandlers } from './ipc/exam';
import { setupAdminHandlers } from './ipc/admin';
import { setupPlanHandlers } from './ipc/plan';
import { cleanupStaleTempDirs } from './main/import/tempCleanup';
import { fetchMediaByFilename, abandonAllOpenSessions } from './main/db/service';
import { pruneDeletedItems } from './main/backup/deletionLog';

// Register sekel-media:// as a privileged scheme before app is ready.
// This must be called synchronously before app.whenReady().
protocol.registerSchemesAsPrivileged([
    { scheme: 'sekel-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

// Auto-update notes are fetched at the moment Squirrel finishes downloading
// the new version. release.yml's publish-notes job mirrors the GitHub-
// generated release body to R2 at notes/v${version}.md so the modal can
// read them without authenticating — the repo is private and anonymous
// api.github.com calls 404, so we don't reach for GitHub here at all.
const RELEASE_NOTES_BASE_URL = 'https://pub-1dd00656fa304302a2db06169963ac20.r2.dev/notes';

async function fetchReleaseNotes(version: string): Promise<string | null> {
    if (!version) return null;
    const tag = version.startsWith('v') ? version : `v${version}`;
    const url = `${RELEASE_NOTES_BASE_URL}/${tag}.md`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(url, {
            headers: { 'Accept': 'text/markdown, text/plain', 'User-Agent': 'sekel-desktop' },
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const body = (await res.text()).trim();
        return body || null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Observability — structured logger + crash reporter, registered early.
// ---------------------------------------------------------------------------

function getLogDir(): string {
    try {
        return app.getPath('userData');
    } catch {
        return os.homedir();
    }
}

const ringBuffer = createRingBuffer(500);

const log = createLogger({
    module: 'main',
    transports: [
        consoleTransport,
        createRingBufferTransport(ringBuffer),
        createFileTransport({ filePath: path.join(getLogDir(), 'sekel.log'), fs, path }),
    ],
});

initCrashReporter({
    getLogPath: () => {
        try { return path.join(app.getPath('userData'), 'crash.log'); }
        catch { return path.join(os.homedir(), '.sekel-crash.log'); }
    },
    ringBuffer,
    getVersion: () => app.isReady() ? app.getVersion() : 'unknown',
    fs,
    showErrorDialog: (title, message) => dialog.showErrorBox(title, message),
});

initIpcInstrumentation(ipcMain, log);

const createWindow = () => {
    const store = new Store();

    // Get stored window state with defaults
    const windowState = store.get('windowState', {
        width: 1200,
        height: 800,
    }) as { width: number; height: number; x?: number; y?: number };

    const mainWindow = new BrowserWindow({
        width: windowState.width,
        height: windowState.height,
        x: windowState.x,
        y: windowState.y,
        icon: path.join(__dirname, '..', '..', 'assets', 'sekel_logo_draft copy.ico'),
        // Defer display until the renderer is ready to paint — kills the
        // brief blank/white flash on launch. Background colour matches the
        // app shell so the first paint isn't jarring.
        show: false,
        backgroundColor: '#0E141B',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            navigateOnDragDrop: false,
            // Disable DevTools entirely in packaged builds. This kills both
            // the Ctrl+Shift+I shortcut and any programmatic openDevTools()
            // call. The View > Toggle Developer Tools menu item is also
            // hidden in production via menu.ts.
            devTools: !app.isPackaged,
        },
    });

    mainWindowRef = mainWindow;
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Route any window.open() / target="_blank" link clicks to the user's
    // default browser instead of letting Electron open a new BrowserWindow.
    // Used by the auto-update modal's release-notes links (GitHub PRs etc.),
    // and any future external links rendered into the UI.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Save window state on close
    mainWindow.on('close', () => {
        const bounds = mainWindow.getBounds();
        store.set('windowState', bounds);
        if (mainWindowRef === mainWindow) mainWindowRef = null;
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    createMenu();
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }
};

app.whenReady().then(() => {
    // Register the app as the OS handler for sekel:// URLs. In dev (when run
    // via `electron .`) we have to pass the path explicitly so the OS knows
    // what command to run. In production the binary path is enough.
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
    }

    // Register .spkg with Windows Explorer so exported packages show the Sekel
    // icon instead of the generic blank-document icon. Idempotent + re-runs
    // every launch, so it self-heals after Squirrel updates rotate execPath.
    try {
        registerSpkgFileAssociation({ execPath: process.execPath, isPackaged: app.isPackaged });
    } catch (err) {
        log.warn('Failed to register .spkg file association', { error: err instanceof Error ? err.message : String(err) });
    }

    // Renderer asks for the cold-start deep link once it mounts. Returning
    // here also clears the buffer so we don't redeliver on reload.
    ipcMain.handle('deep-link:get-initial', () => {
        const url = pendingDeepLink;
        pendingDeepLink = null;
        return url;
    });

    try {
        initDatabase();
    } catch (err) {
        log.error('Database initialization failed — app will run without DB', { error: err instanceof Error ? err.message : String(err) });
    }

    // Prune the deletion log once on launch instead of on every delete.
    // Keeps the per-delete path cheap regardless of how big the log gets.
    try {
        pruneDeletedItems();
    } catch (err) {
        log.warn('Deletion log prune failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // Handle sekel-media://{userId}/{filename} — serves imported media files from disk.
    // URL format: sekel-media://user-id/original-filename.jpg
    protocol.handle('sekel-media', (request) => {
        try {
            const url = new URL(request.url);
            const userId = decodeURIComponent(url.hostname);
            const filename = decodeURIComponent(url.pathname.slice(1)); // strip leading "/"
            const record = fetchMediaByFilename(userId, filename);
            if (!record) {
                return new Response(null, { status: 404 });
            }

            // Path confinement: ensure file_path is inside the media directory
            const mediaDir = path.join(app.getPath('userData'), 'media');
            const resolved = path.resolve(record.file_path);
            if (!resolved.startsWith(mediaDir + path.sep) && resolved !== mediaDir) {
                log.warn('Blocked path escape attempt', { resolved });
                return new Response(null, { status: 403 });
            }

            // Read file directly and return with proper headers
            const filePath = record.file_path;
            const fileBuffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
            };
            const contentType = mimeMap[ext] || 'application/octet-stream';
            return new Response(fileBuffer, {
                status: 200,
                headers: { 'Content-Type': contentType, 'Content-Length': String(fileBuffer.byteLength) },
            });
        } catch (err) {
            log.warn('Failed to serve media', { url: request.url, error: err instanceof Error ? err.message : String(err) });
            return new Response(null, { status: 500 });
        }
    });

    // Register IPC handlers unconditionally so the renderer always has targets
    // to invoke. If the DB failed to initialize, individual handlers will throw
    // "Database not initialized" instead of the opaque "No handler registered".
    const handlers = [
        ['AI', setupAIHandlers],
        ['auth', setupAuthHandlers],
        ['document', setupDocumentHandlers],
        ['database', setupDatabaseHandlers],
        ['import', setupImportHandlers],
        ['notification', setupNotificationHandlers],
        ['backup', setupBackupHandlers],
        ['classify', setupClassifyHandlers],
        ['exam', setupExamHandlers],
        ['admin', setupAdminHandlers],
        ['plan', setupPlanHandlers],
    ] as const;
    for (const [name, setup] of handlers) {
        try { setup(); } catch (err) { log.error(`${name} handler setup failed`, { error: err instanceof Error ? err.message : String(err) }); }
    }
    cleanupStaleTempDirs().catch((err) => log.error('Temp cleanup failed', { error: err instanceof Error ? err.message : String(err) }));

    // Check for updates only in production (packaged app, Windows only — the
    // R2 release feed currently only ships Squirrel.Windows artifacts).
    // notifyUser is off because the renderer shows a custom modal — see
    // UpdateAvailableModal. The update-downloaded handler below pushes the
    // GitHub Release notes (auto-generated by the publish-notes job in
    // .github/workflows/release.yml) into the renderer for display.
    if (app.isPackaged && process.platform === 'win32') {
        updateElectronApp({
            updateSource: {
                type: UpdateSourceType.StaticStorage,
                // release.yml uploads to ${platform}/${arch}/${filename}, so the
                // auto-updater's baseUrl has to include /win32/x64. Without that
                // path Squirrel hits the bucket root and gets a 404 on the
                // RELEASES manifest, never finding updates. Diagnosed via
                // %LocalAppData%\Sekel\Squirrel-CheckForUpdate.log.
                baseUrl: 'https://pub-1dd00656fa304302a2db06169963ac20.r2.dev/win32/x64'
            },
            updateInterval: '10 minutes',
            notifyUser: false,
            // update-electron-app's ILogger expects a `log` method which our
            // @sekel/observability logger doesn't have — adapt it inline so
            // every check-for-update / download / error event flows into our
            // structured log file.
            logger: {
                log:   (...args: unknown[]) => log.info(args.map(String).join(' ')),
                info:  (...args: unknown[]) => log.info(args.map(String).join(' ')),
                warn:  (...args: unknown[]) => log.warn(args.map(String).join(' ')),
                error: (...args: unknown[]) => log.error(args.map(String).join(' ')),
            },
        });

        // Squirrel.Windows always passes empty string for releaseNotes; fetch
        // them from R2 instead. Failure returns null — the modal renders a
        // fallback message but still works.
        autoUpdater.on('update-downloaded', async (_e, _notes, releaseName) => {
            const notes = await fetchReleaseNotes(releaseName);
            if (mainWindowRef && !mainWindowRef.isDestroyed()) {
                mainWindowRef.webContents.send('update:downloaded', { version: releaseName, notes });
            }
        });
    }

    ipcMain.handle('update:install', () => {
        autoUpdater.quitAndInstall();
    });

    // Expose metrics snapshot for diagnostics
    ipcMain.handle('obs:getMetrics', () => metrics.getSnapshot());
    ipcMain.handle('obs:isAdmin', (_e, email: string) =>
        typeof process.env.ADMIN_EMAIL === 'string' &&
        process.env.ADMIN_EMAIL.length > 0 &&
        email === process.env.ADMIN_EMAIL,
    );

    createWindow();

    app.on('render-process-gone', (_event, _webContents, details) => {
        if (details.reason === 'clean-exit') return;

        log.fatal('Renderer process crashed', { reason: details.reason, exitCode: details.exitCode });

        dialog.showErrorBox(
            'Sekel - Renderer Error',
            'The application window has crashed. Sekel will attempt to reload.',
        );
        createWindow();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    try {
        abandonAllOpenSessions();
    } catch (err) {
        log.error('Failed to abandon open sessions on quit', { error: err instanceof Error ? err.message : String(err) });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

