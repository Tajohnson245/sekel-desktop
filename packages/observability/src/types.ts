export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    [key: string]: unknown;
}

export type Transport = (entry: LogEntry) => void;

export interface LoggerOptions {
    module: string;
    transports?: Transport[];
    minLevel?: LogLevel;
}

export interface MetricLabels {
    [key: string]: string;
}

export interface MetricSnapshot {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    timers: Record<string, { count: number; totalMs: number; maxMs: number }>;
}
