import type { LogLevel, LogEntry, Transport, LoggerOptions } from './types';

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: '\x1b[90m',   // gray
    info: '\x1b[36m',    // cyan
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    fatal: '\x1b[35m',   // magenta
};
const RESET = '\x1b[0m';

// ── Transports ──────────────────────────────────────────────────────────────

export function consoleTransport(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level] ?? '';
    const { timestamp, level, module, message, ...extra } = entry;
    const extraStr = Object.keys(extra).length > 0 ? ' ' + JSON.stringify(extra) : '';
    const line = `${color}[${level.toUpperCase()}]${RESET} [${module}] ${message}${extraStr}`;

    if (LEVEL_ORDER[entry.level] >= LEVEL_ORDER.error) {
        console.error(line);
    } else if (entry.level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export interface FileTransportOptions {
    filePath: string;
    maxBytes?: number;
    fs: typeof import('node:fs');
    path: typeof import('node:path');
}

export function createFileTransport(opts: FileTransportOptions): Transport {
    const maxBytes = opts.maxBytes ?? 5_242_880; // 5 MB

    return (entry: LogEntry) => {
        const line = JSON.stringify(entry) + '\n';
        try {
            const stats = opts.fs.statSync(opts.filePath);
            if (stats.size > maxBytes) {
                opts.fs.renameSync(opts.filePath, opts.filePath + '.old');
            }
        } catch {
            // File doesn't exist yet — that's fine
        }
        try {
            opts.fs.appendFileSync(opts.filePath, line);
        } catch {
            // Best-effort: if we can't write, carry on
        }
    };
}

export interface RingBuffer {
    entries: LogEntry[];
    push(entry: LogEntry): void;
    getAll(): LogEntry[];
}

export function createRingBuffer(capacity = 500): RingBuffer {
    const entries: LogEntry[] = [];
    let cursor = 0;
    let full = false;

    return {
        entries,
        push(entry: LogEntry) {
            if (full) {
                entries[cursor] = entry;
            } else {
                entries.push(entry);
            }
            cursor = (cursor + 1) % capacity;
            if (cursor === 0) full = true;
        },
        getAll(): LogEntry[] {
            if (!full) return entries.slice();
            return [...entries.slice(cursor), ...entries.slice(0, cursor)];
        },
    };
}

export function createRingBufferTransport(buffer: RingBuffer): Transport {
    return (entry: LogEntry) => buffer.push(entry);
}

// ── Logger ──────────────────────────────────────────────────────────────────

export interface Logger {
    debug(message: string, extra?: Record<string, unknown>): void;
    info(message: string, extra?: Record<string, unknown>): void;
    warn(message: string, extra?: Record<string, unknown>): void;
    error(message: string, extra?: Record<string, unknown>): void;
    fatal(message: string, extra?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}

export function createLogger(options: LoggerOptions): Logger {
    const { module, transports = [consoleTransport], minLevel = 'debug' } = options;
    const minOrder = LEVEL_ORDER[minLevel];

    function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
        if (LEVEL_ORDER[level] < minOrder) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            module,
            message,
            ...extra,
        };

        for (const transport of transports) {
            try {
                transport(entry);
            } catch {
                // Never let a transport failure crash the app
            }
        }
    }

    return {
        debug: (msg, extra?) => log('debug', msg, extra),
        info: (msg, extra?) => log('info', msg, extra),
        warn: (msg, extra?) => log('warn', msg, extra),
        error: (msg, extra?) => log('error', msg, extra),
        fatal: (msg, extra?) => log('fatal', msg, extra),
        child(context: Record<string, unknown>): Logger {
            const childModule = (context.module as string) ?? module;
            return createLogger({
                module: childModule,
                transports,
                minLevel,
            });
        },
    };
}
