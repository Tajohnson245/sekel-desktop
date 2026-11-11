import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminOverview, fetchAdminUserDetail, isAdminUser } from '../lib/adminApi';

function fakeClient(result: { data: unknown; error: unknown }) {
    const invoke = vi.fn(async () => result);
    return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
}

describe('isAdminUser', () => {
    it('is true only for app_metadata.role = admin', () => {
        expect(isAdminUser({ app_metadata: { role: 'admin' } })).toBe(true);
        expect(isAdminUser({ app_metadata: { role: 'user' } })).toBe(false);
        expect(isAdminUser({ app_metadata: {} })).toBe(false);
        expect(isAdminUser(null)).toBe(false);
        expect(isAdminUser(undefined)).toBe(false);
    });
});

describe('admin edge function calls', () => {
    it('sends the action and returns the data', async () => {
        const { client, invoke } = fakeClient({ data: { totalUsers: 3 }, error: null });
        await expect(fetchAdminOverview(client)).resolves.toEqual({ totalUsers: 3 });
        expect(invoke).toHaveBeenCalledWith('admin', { body: { action: 'overview' } });
    });

    it('passes the user id for user detail', async () => {
        const { client, invoke } = fakeClient({ data: {}, error: null });
        await fetchAdminUserDetail(client, 'u-1');
        expect(invoke).toHaveBeenCalledWith('admin', { body: { action: 'userDetail', userId: 'u-1' } });
    });

    it('throws the function error', async () => {
        const error = Object.assign(new Error('forbidden'), { name: 'FunctionsHttpError' });
        const { client } = fakeClient({ data: null, error });
        await expect(fetchAdminOverview(client)).rejects.toBe(error);
    });
});
