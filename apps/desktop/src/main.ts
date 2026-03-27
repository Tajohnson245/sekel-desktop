import { app, BrowserWindow, protocol } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import fs from 'node:fs';
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
import { startBackupScheduler, stopBackupScheduler } from './main/backup/service';
import { cleanupStaleTempDirs } from './main/import/tempCleanup';
import { fetchMediaByFilename } from './main/db/service';

// Register sekel-media:// as a privileged scheme before app is ready.
// This must be called synchronously before app.whenReady().
protocol.registerSchemesAsPrivileged([
    { scheme: 'sekel-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

import { updateElectronApp } from 'update-electron-app';

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
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
        },
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
        console.error('[main] database initialization failed — app will run without DB:', err);
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
            console.warn('[sekel-media] failed to serve:', request.url, err);
            return new Response(null, { status: 500 });
        }
    });

    // Register IPC handlers unconditionally so the renderer always has targets
    // to invoke. If the DB failed to initialize, individual handlers will throw
    // "Database not initialized" instead of the opaque "No handler registered".
    try { setupAIHandlers(); } catch (err) { console.error('[main] AI handler setup failed:', err); }
    try { setupAuthHandlers(); } catch (err) { console.error('[main] auth handler setup failed:', err); }
    try { setupDocumentHandlers(); } catch (err) { console.error('[main] document handler setup failed:', err); }
    try { setupDatabaseHandlers(); } catch (err) { console.error('[main] database handler setup failed:', err); }
    try { setupImportHandlers(); } catch (err) { console.error('[main] import handler setup failed:', err); }
    try { setupNotificationHandlers(); } catch (err) { console.error('[main] notification handler setup failed:', err); }
    try { setupBackupHandlers(); } catch (err) { console.error('[main] backup handler setup failed:', err); }
    try { setupClassifyHandlers(); } catch (err) { console.error('[main] classify handler setup failed:', err); }
    cleanupStaleTempDirs().catch((err) => console.error('[main] temp cleanup failed:', err));

    // Start automatic backup scheduler
    try { startBackupScheduler(); } catch (err) { console.error('[main] backup scheduler failed:', err); }

    // Check for updates only in production (packaged app)
    if (app.isPackaged) {
        updateElectronApp({
            updateInterval: '1 hour',
            logger: console,
        });
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    stopBackupScheduler();
});
