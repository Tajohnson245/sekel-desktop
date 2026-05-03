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
            { role: 'zoomIn' },
            { role: 'zoomOut' },
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
