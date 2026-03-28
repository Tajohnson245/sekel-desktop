import type { MetricLabels, MetricSnapshot } from './types';

function key(name: string, labels: MetricLabels): string {
    const parts = Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`);
    return parts.length > 0 ? `${name}{${parts.join(',')}}` : name;
}

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const timers = new Map<string, { count: number; totalMs: number; maxMs: number }>();

export function increment(name: string, labels: MetricLabels = {}, value = 1): void {
    const k = key(name, labels);
    counters.set(k, (counters.get(k) ?? 0) + value);
}

export function set(name: string, value: number, labels: MetricLabels = {}): void {
    gauges.set(key(name, labels), value);
}

export function startTimer(name: string, labels: MetricLabels = {}): () => number {
    const start = performance.now();
    return () => {
        const ms = performance.now() - start;
        const k = key(name, labels);
        const existing = timers.get(k) ?? { count: 0, totalMs: 0, maxMs: 0 };
        existing.count += 1;
        existing.totalMs += ms;
        existing.maxMs = Math.max(existing.maxMs, ms);
        timers.set(k, existing);
        return ms;
    };
}

export function getSnapshot(): MetricSnapshot {
    return {
        counters: Object.fromEntries(counters),
        gauges: Object.fromEntries(gauges),
        timers: Object.fromEntries(
            [...timers.entries()].map(([k, v]) => [k, { ...v }]),
        ),
    };
}

export function reset(): void {
    counters.clear();
    gauges.clear();
    timers.clear();
}
