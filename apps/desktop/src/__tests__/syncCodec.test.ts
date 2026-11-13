import { describe, it, expect } from 'vitest';
import { localMediaPath, mediaStoragePath, remoteChangedAt, toLocal, toRemote } from '../main/sync/codec';
import { classifyRpcError } from '../main/sync/supabaseTransport';
import { toPayload } from '../main/sync/engine';
import type { SyncColumn } from '../main/sync/tables';

const col = (type: SyncColumn['type']): SyncColumn => ({ name: 'x', type });

describe('value conversion', () => {
    it('round-trips JSON text exactly, including key order', () => {
        const text = JSON.stringify({ Question: 'q', Answer: 'a', Extra: '' });
        expect(toLocal(col('json'), toRemote(col('json'), text))).toBe(text);
    });

    it('keeps non-JSON text in a JSON column intact', () => {
        const remote = toRemote(col('json'), 'not json {');
        expect(remote).toEqual({ __raw: 'not json {' });
        expect(toLocal(col('json'), remote)).toBe('not json {');
    });

    it('maps 0/1 to booleans and back', () => {
        expect(toRemote(col('bool'), 1)).toBe(true);
        expect(toRemote(col('bool'), 0)).toBe(false);
        expect(toLocal(col('bool'), true)).toBe(1);
        expect(toLocal(col('bool'), false)).toBe(0);
    });

    it('normalizes timestamps to ISO and leaves odd values alone', () => {
        expect(toRemote(col('ts'), '2026-11-01T10:00:00Z')).toBe('2026-11-01T10:00:00.000Z');
        expect(toLocal(col('ts'), '2026-11-01T10:00:00+00:00')).toBe('2026-11-01T10:00:00.000Z');
        expect(toRemote(col('ts'), 'now')).toBe('now');
    });

    it('rounds integers (the server columns are integer)', () => {
        expect(toRemote(col('int'), 2.6)).toBe(3);
        expect(toRemote(col('real'), 2.5)).toBe(2.5);
    });

    it('passes nulls through', () => {
        for (const t of ['json', 'bool', 'ts', 'int', 'text'] as const) {
            expect(toRemote(col(t), null)).toBeNull();
            expect(toLocal(col(t), null)).toBeNull();
        }
    });
});

describe('clock offset', () => {
    it('shifts change times by the measured offset', () => {
        expect(remoteChangedAt('2026-11-01T10:00:00.000Z', 90_000)).toBe('2026-11-01T10:01:30.000Z');
        expect(remoteChangedAt('2026-11-01T10:00:00.000Z')).toBe('2026-11-01T10:00:00.000Z');
    });
});

describe('media paths', () => {
    it('stores files content-addressed under the owner', () => {
        expect(mediaStoragePath('u1', { file_hash: 'abc', file_path: 'C:\\data\\media\\abc.PNG', filename: 'heart.png' })).toBe('u1/abc.PNG');
        expect(mediaStoragePath('u1', { file_hash: 'abc', file_path: '', filename: 'clip.mp3' })).toBe('u1/abc.mp3');
        expect(localMediaPath('/data/media', 'u1/abc.png').replace(/\\/g, '/')).toBe('/data/media/abc.png');
    });
});

describe('push payload', () => {
    it('groups parts by kind and table', () => {
        expect(toPayload([
            { kind: 'delete', table: 'decks', value: { id: 'd1', at: 't' } },
            { kind: 'upsert', table: 'decks', value: { id: 'd2' } },
            { kind: 'upsert', table: 'notes', value: { id: 'n1' } },
        ])).toEqual({
            deletes: { decks: [{ id: 'd1', at: 't' }] },
            upserts: { decks: [{ id: 'd2' }], notes: [{ id: 'n1' }] },
        });
    });
});

describe('error classification', () => {
    it.each([
        [{ code: 'PGRST202', message: 'Could not find the function public.sync_hello_v1' }, 'unavailable'],
        [{ code: '42883', message: 'function does not exist' }, 'unavailable'],
        [{ code: 'PGRST301', message: 'JWT expired' }, 'auth'],
        [{ code: '28000', message: 'sync: not signed in' }, 'auth'],
        [{ code: '23503', message: 'violates foreign key constraint' }, 'data'],
        [{ code: '22003', message: 'integer out of range' }, 'data'],
        [{ code: '42501', message: 'new row violates row-level security policy' }, 'data'],
        [{ code: '', message: 'fetch failed' }, 'transient'],
        [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'transient'],
    ])('%o → %s', (error, kind) => {
        expect(classifyRpcError(error).kind).toBe(kind);
    });
});
