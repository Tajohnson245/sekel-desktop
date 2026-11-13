/**
 * Real Postgres (PGlite, in-process WASM) with the repo's Supabase migrations
 * applied, for testing the sync schema and RPCs without a Supabase project.
 *
 * Supabase-provided objects the migrations rely on are stubbed: the anon /
 * authenticated / service_role roles, auth.users + auth.uid() / auth.role()
 * (read from the request.jwt.claim.* settings, as PostgREST sets them), and
 * the storage schema (buckets, objects, foldername()).
 */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], owner uuid,
    created_at timestamptz default now(), updated_at timestamptz default now()
);
create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
    name text, owner uuid, owner_id text, metadata jsonb, version text,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
    return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

/** A fresh database with every migration applied. */
export async function createSupabaseDb(): Promise<PGlite> {
    const pg = new PGlite();
    await pg.exec(SUPABASE_STUBS);
    for (const file of migrationFiles()) {
        const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        try {
            await pg.exec(sql);
        } catch (err) {
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
    }
    return pg;
}

export async function createAuthUser(pg: PGlite, id: string, email = `${id}@example.test`): Promise<void> {
    await pg.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}

/** Runs fn as a signed-in user (role authenticated, auth.uid() = userId), in one transaction. */
export async function asUser<T>(pg: PGlite, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
            [userId ?? '', userId ? 'authenticated' : 'anon']);
        await tx.exec(userId ? 'set local role authenticated' : 'set local role anon');
        return fn(tx);
    });
}

/** Calls a jsonb-returning RPC as a user, like supabase-js `rpc()` does. */
export async function rpc<T = unknown>(pg: PGlite, userId: string | null, fn: string, args: unknown[]): Promise<T> {
    return asUser(pg, userId, async (tx) => {
        const params = args.map((_, i) => `$${i + 1}`).join(', ');
        const res = await tx.query<{ r: T }>(`select public.${fn}(${params}) as r`, args);
        return res.rows[0].r;
    });
}
