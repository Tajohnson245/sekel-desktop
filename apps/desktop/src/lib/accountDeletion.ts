import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteAccount as deleteOwnAccountRpc } from '@sekel/db';

function errorStatus(error: unknown): number | undefined {
    const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
    return typeof status === 'number' ? status : undefined;
}

/**
 * True when the edge function couldn't be reached at all: network/CORS
 * failure, a Supabase relay error, or 404 (function not deployed). Only then
 * is it safe to fall back to the RPC. Any other error came from the function
 * itself (e.g. Storage cleanup failed); falling back then would delete the
 * user while leaving their files behind.
 *
 * Matches on error.name rather than instanceof so a duplicated
 * @supabase/functions-js copy can't break the check.
 */
export function isEdgeFunctionUnreachable(error: unknown): boolean {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return true;
    return name === 'FunctionsHttpError' && errorStatus(error) === 404;
}

/**
 * Deletes the signed-in user's account through the `delete-account` edge
 * function. It removes the user's Storage objects, then the auth user, and
 * public.* rows cascade. Falls back to the legacy `delete_own_account` RPC
 * (DB rows only, Storage objects remain) only when the function is
 * unreachable.
 */
export async function deleteAccountViaEdgeFunction(
    client: SupabaseClient,
): Promise<{ error: Error | null; usedFallback: boolean }> {
    const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
    if (!error) return { error: null, usedFallback: false };

    if (isEdgeFunctionUnreachable(error)) {
        const { error: rpcError } = await deleteOwnAccountRpc(client);
        return { error: rpcError ? new Error(rpcError.message) : null, usedFallback: true };
    }

    const status = errorStatus(error);
    const message = error instanceof Error ? error.message : String(error);
    return {
        error: new Error(`Account deletion failed${status ? ` (HTTP ${status})` : ''}: ${message}`),
        usedFallback: false,
    };
}
