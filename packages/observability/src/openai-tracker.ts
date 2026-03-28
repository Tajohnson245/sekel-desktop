/**
 * Wrapper for OpenAI chat.completions.create() that tracks latency,
 * token usage, and errors via the metrics module.
 */

import * as metrics from './metrics';
import type { Logger } from './logger';

interface TrackedCompletionOptions<T> {
    /** Label for the operation (e.g. "chunk", "generate", "evaluate", "classify") */
    operation: string;
    /** The OpenAI create() call — pass the promise directly */
    call: PromiseLike<T>;
    /** Logger instance for error logging */
    logger?: Logger;
}

export async function trackedCompletion<T>(
    opts: TrackedCompletionOptions<T>,
): Promise<T> {
    const end = metrics.startTimer('openai.duration_ms', { operation: opts.operation });
    metrics.increment('openai.calls_total', { operation: opts.operation });

    try {
        const response = await opts.call;
        const ms = end();

        // Extract usage if present (duck-type check)
        const usage = (response as Record<string, unknown>)?.usage as
            { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

        if (usage) {
            if (usage.prompt_tokens != null) {
                metrics.increment('openai.prompt_tokens', { operation: opts.operation }, usage.prompt_tokens);
            }
            if (usage.completion_tokens != null) {
                metrics.increment('openai.completion_tokens', { operation: opts.operation }, usage.completion_tokens);
            }
            if (usage.total_tokens != null) {
                metrics.increment('openai.total_tokens', { operation: opts.operation }, usage.total_tokens);
            }
        }

        opts.logger?.debug('OpenAI call completed', {
            operation: opts.operation,
            durationMs: Math.round(ms),
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
        });

        return response;
    } catch (err) {
        end();
        metrics.increment('openai.errors_total', { operation: opts.operation });
        opts.logger?.error('OpenAI call failed', {
            operation: opts.operation,
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}
