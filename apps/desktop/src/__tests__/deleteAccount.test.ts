import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { deleteAccountViaEdgeFunction as deleteAccount, isEdgeFunctionUnreachable } from '../lib/accountDeletion';

function fakeClient(invokeError: unknown, rpcError: { message: string } | null = null) {
    const invoke = vi.fn().mockResolvedValue({ data: invokeError ? null : { ok: true }, error: invokeError });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });
    const client = { functions: { invoke }, rpc } as unknown as SupabaseClient;
    return { client, invoke, rpc };
}

describe('deleteAccount', () => {
    it('uses the edge function and does not touch the RPC on success', async () => {
        const { client, invoke, rpc } = fakeClient(null);
        const res = await deleteAccount(client);
        expect(res).toEqual({ error: null, usedFallback: false });
        expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each([
        ['network failure', new FunctionsFetchError(new TypeError('Failed to fetch'))],
        ['relay error', new FunctionsRelayError(new Response(null, { status: 502 }))],
        ['function not deployed (404)', new FunctionsHttpError(new Response(null, { status: 404 }))],
    ])('falls back to the RPC on %s', async (_label, err) => {
        const { client, rpc } = fakeClient(err);
        const res = await deleteAccount(client);
        expect(rpc).toHaveBeenCalledWith('delete_own_account');
        expect(res).toEqual({ error: null, usedFallback: true });
    });

    it('surfaces an RPC error from the fallback', async () => {
        const { client } = fakeClient(new FunctionsFetchError(new Error('offline')), { message: 'boom' });
        const res = await deleteAccount(client);
        expect(res.usedFallback).toBe(true);
        expect(res.error?.message).toBe('boom');
    });

    it.each([401, 500])('does NOT fall back when the function itself fails (HTTP %i)', async (status) => {
        const { client, rpc } = fakeClient(new FunctionsHttpError(new Response(null, { status })));
        const res = await deleteAccount(client);
        expect(rpc).not.toHaveBeenCalled();
        expect(res.usedFallback).toBe(false);
        expect(res.error?.message).toContain(`HTTP ${status}`);
    });
});

describe('isEdgeFunctionUnreachable', () => {
    it('ignores unrelated errors', () => {
        expect(isEdgeFunctionUnreachable(new Error('x'))).toBe(false);
        expect(isEdgeFunctionUnreachable(null)).toBe(false);
    });
});
