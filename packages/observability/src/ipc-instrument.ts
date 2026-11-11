/**
 * Drop-in replacement for ipcMain.handle that auto-tracks timing, call count,
 * and error rate per channel.
 *
 * Usage: replace `ipcMain.handle(ch, fn)` with `instrumentedHandle(ch, fn)`.
 * Handler signatures are unchanged.
 */

import * as metrics from './metrics';
import type { Logger } from './logger';

// Use loose types so this module doesn't depend on the `electron` package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcMainInvokeEvent = any;

interface IpcMainLike {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
}

let _ipcMain: IpcMainLike | undefined;
let _logger: Logger | undefined;
let _validateSender: ((event: IpcMainInvokeEvent) => boolean) | undefined;

export interface IpcInstrumentationOptions {
    /**
     * Called before every handler. Return false to refuse the call — used to
     * reject IPC from any frame that is not the app's own renderer page.
     */
    validateSender?: (event: IpcMainInvokeEvent) => boolean;
}

export function initIpcInstrumentation(
    ipcMain: IpcMainLike,
    logger: Logger,
    options: IpcInstrumentationOptions = {},
): void {
    _ipcMain = ipcMain;
    _logger = logger;
    _validateSender = options.validateSender;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentedHandle(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => any,
): void {
    if (!_ipcMain) {
        throw new Error(
            'instrumentedHandle called before initIpcInstrumentation(). ' +
            'Call initIpcInstrumentation(ipcMain, logger) in main.ts first.',
        );
    }

    _ipcMain.handle(channel, async (event, ...args) => {
        if (_validateSender && !_validateSender(event)) {
            metrics.increment('ipc.blocked_total', { channel });
            _logger?.warn('IPC call from untrusted sender blocked', {
                channel,
                senderUrl: event?.senderFrame?.url,
            });
            throw new Error('IPC call refused: untrusted sender');
        }
        const end = metrics.startTimer('ipc.duration_ms', { channel });
        metrics.increment('ipc.calls_total', { channel });
        try {
            const result = await handler(event, ...args);
            end();
            return result;
        } catch (err) {
            metrics.increment('ipc.errors_total', { channel });
            end();
            _logger?.error('IPC handler error', {
                channel,
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
            });
            throw err;
        }
    });
}
