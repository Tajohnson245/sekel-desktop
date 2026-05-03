import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
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
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Save window state on close
    mainWindow.on('close', () => {
        const bounds = mainWindow.getBounds();
        store.set('windowState', bounds);
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

    // Check for updates only in production (packaged app)
    if (app.isPackaged) {
        updateElectronApp({
            updateSource: {
                type: UpdateSourceType.StaticStorage,
                baseUrl: 'https://pub-1dd00656fa304302a2db06169963ac20.r2.dev'
            },
            updateInterval: '1 hour',
            notifyUser: true
        });
    }

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

