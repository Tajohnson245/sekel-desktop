import { app, BrowserWindow, Menu, shell, MenuItemConstructorOptions } from 'electron';
import { createBackup } from './main/backup/service';

const isMac = process.platform === 'darwin';

const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    ...(isMac
        ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] as MenuItemConstructorOptions[]
        : []),
    // { role: 'fileMenu' }
    {
        label: 'File',
        submenu: [
            {
                label: 'Create Backup',
                accelerator: 'CmdOrCtrl+Shift+B',
                click: async () => {
                    const result = await createBackup();
                    if (result) {
                        const win = BrowserWindow.getFocusedWindow();
                        win?.webContents.send('backup:created', result);
                    }
                },
            },
            {
                label: 'Restore from Backup...',
                click: () => {
                    const win = BrowserWindow.getFocusedWindow();
                    win?.webContents.send('backup:open-restore');
                },
            },
            { type: 'separator' },
            isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    // { role: 'editMenu' }
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            ...(isMac
                ? [
                    { role: 'pasteAndMatchStyle' },
                    { role: 'delete' },
                    { role: 'selectAll' },
                    { type: 'separator' },
                    {
                        label: 'Speech',
                        submenu: [
                            { role: 'startSpeaking' },
                            { role: 'stopSpeaking' }
                        ]
                    }
                ] as MenuItemConstructorOptions[] // Cast the array literal
                : [
                    { role: 'delete' },
                    { type: 'separator' },
                    { role: 'selectAll' }
                ] as MenuItemConstructorOptions[]) // Cast the array literal
        ]
    },
    // { role: 'viewMenu' }
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            // Toggle DevTools is dev-only — packaged production builds don't
            // expose this menu item. The webPreferences.devTools: false flag
            // in main.ts also disables the Ctrl+Shift+I keyboard shortcut for
            // packaged builds.
            ...(app.isPackaged
                ? [] as MenuItemConstructorOptions[]
                : [{ role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[]),
            { role: 'resetZoom' },
            // Override the default `CmdOrCtrl+Plus` (Shift+= on Windows) with
            // `CmdOrCtrl+=` so the unshifted = key zooms in — that's what
            // Chrome / Edge / Firefox use and what users instinctively press.
            { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
            // Keep the shifted form working too (some users press Ctrl+Shift+=
            // habitually). Hidden from the menu since the visible item already
            // shows Ctrl+= as the primary shortcut.
            {
                label: 'Zoom In (alt)',
                role: 'zoomIn',
                accelerator: 'CmdOrCtrl+Plus',
                visible: false,
                acceleratorWorksWhenHidden: true,
            },
            // Numpad + on keyboards that have a numeric keypad.
            {
                label: 'Zoom In (numpad)',
                role: 'zoomIn',
                accelerator: 'CmdOrCtrl+numadd',
                visible: false,
                acceleratorWorksWhenHidden: true,
            },
            { role: 'zoomOut' },
            {
                label: 'Zoom Out (numpad)',
                role: 'zoomOut',
                accelerator: 'CmdOrCtrl+numsub',
                visible: false,
                acceleratorWorksWhenHidden: true,
            },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    // { role: 'windowMenu' }
    {
        label: 'Window',
        submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            ...(isMac
                ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] as MenuItemConstructorOptions[]
                : [
                    { role: 'close' }
                ] as MenuItemConstructorOptions[])
        ]
    },
    {
        role: 'help',
        submenu: [
            {
                label: 'Replay Tour',
                accelerator: 'CmdOrCtrl+Shift+T',
                click: () => {
                    const win = BrowserWindow.getFocusedWindow();
                    win?.webContents.send('tour:replay');
                },
            },
            { type: 'separator' },
            {
                label: 'Learn More',
                click: async () => {
                    await shell.openExternal('https://sekel.app');
                }
            }
        ]
    }
];

export const createMenu = () => {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
};
