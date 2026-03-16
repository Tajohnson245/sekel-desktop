import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { createMenu } from './menu';
import { initDatabase } from './main/db/index';
import { setupAIHandlers } from './ipc/ai';
import { setupAuthHandlers } from './ipc/auth';
import { setupDocumentHandlers } from './ipc/document_parsing';
import { setupDatabaseHandlers } from './ipc/database';
import { setupImportHandlers } from './ipc/import';
import { cleanupStaleTempDirs } from './main/import/tempCleanup';

// update-electron-app is a CommonJS module
const updateElectronApp = require('update-electron-app');

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    // Save window state on close
    mainWindow.on('close', () => {
        const bounds = mainWindow.getBounds();
        store.set('windowState', bounds);
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    createMenu();
    mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
    try {
        initDatabase();
    } catch (err) {
        console.error('[main] database initialization failed — app will run without DB:', err);
    }

    // Register IPC handlers unconditionally so the renderer always has targets
    // to invoke. If the DB failed to initialize, individual handlers will throw
    // "Database not initialized" instead of the opaque "No handler registered".
    try { setupAIHandlers(); } catch (err) { console.error('[main] AI handler setup failed:', err); }
    try { setupAuthHandlers(); } catch (err) { console.error('[main] auth handler setup failed:', err); }
    try { setupDocumentHandlers(); } catch (err) { console.error('[main] document handler setup failed:', err); }
    try { setupDatabaseHandlers(); } catch (err) { console.error('[main] database handler setup failed:', err); }
    try { setupImportHandlers(); } catch (err) { console.error('[main] import handler setup failed:', err); }
    cleanupStaleTempDirs(); // fire-and-forget stale temp dir cleanup

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
