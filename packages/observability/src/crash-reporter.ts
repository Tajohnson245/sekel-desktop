/**
 * Enhanced crash reporter — writes structured JSON crash logs with recent
 * log context from the ring buffer and a metrics snapshot.
 */

import type { RingBuffer } from './logger';
import * as metrics from './metrics';

interface CrashReporterOptions {
    /** Function that returns the crash log file path */
    getLogPath: () => string;
    /** Ring buffer with recent log entries */
    ringBuffer: RingBuffer;
    /** App version string (e.g. "1.8.0") */
    getVersion: () => string;
    /** Node fs module */
    fs: typeof import('node:fs');
    /** Show an error dialog to the user */
    showErrorDialog: (title: string, message: string) => void;
}

interface CrashEntry {
    timestamp: string;
    source: string;
    version: string;
    electron: string;
    platform: string;
    error: { message: string; stack?: string };
    recentLogs: unknown[];
    metricsSnapshot: unknown;
}

let _opts: CrashReporterOptions | undefined;

const MAX_LOG_SIZE = 1_048_576; // 1 MB

function rotateCrashLogIfNeeded(logPath: string, fs: typeof import('node:fs')): void {
    try {
        const stats = fs.statSync(logPath);
        if (stats.size > MAX_LOG_SIZE) {
            fs.renameSync(logPath, logPath + '.old');
        }
    } catch {
        // File doesn't exist yet — fine
    }
}

function writeCrashAndExit(source: string, error: unknown): void {
    if (!_opts) {
        process.stderr.write(`[CRASH] ${source}: ${String(error)}\n`);
        process.exit(1);
        return;
    }

    const errObj = error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };

    const entry: CrashEntry = {
        timestamp: new Date().toISOString(),
        source,
        version: _opts.getVersion(),
        electron: process.versions.electron ?? 'N/A',
        platform: `${process.platform} ${process.arch}`,
        error: errObj,
        recentLogs: _opts.ringBuffer.getAll(),
        metricsSnapshot: metrics.getSnapshot(),
    };

    const json = JSON.stringify(entry, null, 2) + '\n---\n';

    process.stderr.write(json);

    const logPath = _opts.getLogPath();
    try {
        rotateCrashLogIfNeeded(logPath, _opts.fs);
        _opts.fs.appendFileSync(logPath, json);
    } catch {
        // Best-effort
    }

    _opts.showErrorDialog(
        'Sekel - Unexpected Error',
        `Sekel encountered a fatal error and needs to close.\n\n` +
        `${errObj.message}\n\n` +
        `A crash log has been saved to:\n${logPath}`,
    );

    process.exit(1);
}

export function initCrashReporter(opts: CrashReporterOptions): void {
    _opts = opts;

    process.on('uncaughtException', (error) => {
        writeCrashAndExit('uncaughtException', error);
    });

    process.on('unhandledRejection', (reason) => {
        writeCrashAndExit('unhandledRejection', reason);
    });
}
