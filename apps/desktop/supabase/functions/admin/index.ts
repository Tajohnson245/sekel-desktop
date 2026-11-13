// Data for the in-app admin dashboard (src/components/Admin/AdminDashboard.tsx).
//
// This used to run inside the desktop app with the service-role key built
// into every installer. It now runs here, and the app calls it with
// supabase.functions.invoke('admin', { body: { action, ... } }).
//
// Auth: deployed WITH JWT verification (no --no-verify-jwt). The caller is
// identified from their JWT via auth.getUser(), and must have
// app_metadata.role = 'admin'. app_metadata can only be changed with the
// service role (SQL editor or the Auth admin API), never by the user, e.g.:
//   update auth.users
//   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
//   where email = '...';
//
// Actions: overview | users | userDetail (userId) | feedback
//
// Counting is done by the admin_* SQL functions
// (20261110130100_admin_stats_functions.sql) so large tables aren't pulled
// row by row or cut off at PostgREST's 1000-row page size.
//
// Auto-provided by the Supabase runtime:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAGE = 1000;
const MAX_AUTH_PAGES = 50;
const DAY_MS = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Synced study tables (SEKEL-157) keep deleted rows as tombstones.
const SYNCED_TABLES = new Set(['decks', 'cards', 'reviews', 'deck_sessions', 'notes', 'note_types']);

async function countRows(table: string, userId?: string): Promise<number> {
    let q = db.from(table).select('*', { count: 'exact', head: true });
    if (userId) q = q.eq('user_id', userId);
    if (SYNCED_TABLES.has(table)) q = q.is('deleted_at', null);
    const { count, error } = await q;
    if (error) {
        console.error('count failed', { table, error: error.message });
        return 0;
    }
    return count ?? 0;
}

/** Every auth user, paging through the admin API. */
async function listAllAuthUsers(): Promise<User[]> {
    const out: User[] = [];
    for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
        if (error) throw error;
        const users = data?.users ?? [];
        out.push(...users);
        if (users.length < PAGE) break;
    }
    return out;
}

/** All rows of a query, fetched in PAGE-sized ranges. */
async function selectAll<T>(
    build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function overview() {
    const day30 = new Date(Date.now() - 30 * DAY_MS).toISOString();

    const [totalUsers, totalDecks, totalCards, totalReviews, totalFeedback, activity, authUsers] = await Promise.all([
        countRows('user_profiles'),
        countRows('decks'),
        countRows('cards'),
        countRows('reviews'),
        countRows('feedback'),
        db.rpc('admin_review_activity', { p_since: day30 }),
        listAllAuthUsers(),
    ]);
    if (activity.error) throw new Error(activity.error.message);
    const a = (activity.data ?? {}) as {
        reviewsByDay?: Array<{ date: string; count: number }>;
        activeToday?: number;
        activeLast7Days?: number;
        activeLast30Days?: number;
    };

    const signups: Record<string, number> = {};
    for (const u of authUsers) {
        if (u.created_at && u.created_at >= day30) {
            const date = u.created_at.slice(0, 10);
            signups[date] = (signups[date] ?? 0) + 1;
        }
    }

    return {
        totalUsers,
        activeToday: a.activeToday ?? 0,
        activeLast7Days: a.activeLast7Days ?? 0,
        activeLast30Days: a.activeLast30Days ?? 0,
        totalDecks,
        totalCards,
        totalReviews,
        totalFeedback,
        reviewsByDay: a.reviewsByDay ?? [],
        signupsByDay: Object.entries(signups)
            .map(([date, count]) => ({ date, count }))
            .sort((x, y) => x.date.localeCompare(y.date)),
    };
}

async function users() {
    type Profile = {
        id: string; first_name: string | null; last_name: string | null; medical_school: string | null;
        role: string | null; exam: string | null; location: string | null; created_at: string;
    };
    type Stats = { user_id: string; deck_count: number; card_count: number; review_count: number; last_review_at: string | null; last_sync_at?: string | null };

    const [profiles, statsRes, authUsers] = await Promise.all([
        selectAll<Profile>(() => db.from('user_profiles').select('*').order('created_at', { ascending: false })),
        db.rpc('admin_user_stats'),
        listAllAuthUsers(),
    ]);
    if (statsRes.error) throw new Error(statsRes.error.message);

    const stats = new Map<string, Stats>();
    for (const s of (statsRes.data ?? []) as Stats[]) stats.set(s.user_id, s);
    const auth = new Map(authUsers.map((u) => [u.id, u]));

    return profiles.map((p) => {
        const s = stats.get(p.id);
        const u = auth.get(p.id);
        return {
            id: p.id,
            email: u?.email ?? null,
            first_name: p.first_name,
            last_name: p.last_name,
            medical_school: p.medical_school,
            role: p.role,
            exam: p.exam,
            location: p.location,
            created_at: p.created_at,
            last_sign_in_at: u?.last_sign_in_at ?? null,
            deck_count: Number(s?.deck_count ?? 0),
            card_count: Number(s?.card_count ?? 0),
            review_count: Number(s?.review_count ?? 0),
            last_review_at: s?.last_review_at ?? null,
            last_sync_at: s?.last_sync_at ?? null,
        };
    });
}

async function userDetail(userId: string) {
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

    const [
        profileRes, deckCount, cardCount, reviewCount, sessionCount, feedbackCount,
        decks, feedback, reviewDays, deckCards,
    ] = await Promise.all([
        db.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        countRows('decks', userId),
        countRows('cards', userId),
        countRows('reviews', userId),
        countRows('deck_sessions', userId),
        countRows('feedback', userId),
        selectAll<{ id: string; name: string; created_at: string }>(() =>
            db.from('decks').select('id, name, created_at').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false })),
        selectAll<{ id: string; areas: string[] | null; description: string; created_at: string }>(() =>
            db.from('feedback').select('id, areas, description, created_at').eq('user_id', userId).order('created_at', { ascending: false })),
        db.rpc('admin_user_review_days', { p_user_id: userId, p_since: since }),
        db.rpc('admin_deck_card_counts', { p_user_id: userId }),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (reviewDays.error) throw new Error(reviewDays.error.message);
    if (deckCards.error) throw new Error(deckCards.error.message);

    const perDeck = new Map<string, number>();
    for (const r of (deckCards.data ?? []) as Array<{ deck_id: string; card_count: number }>) {
        perDeck.set(r.deck_id, Number(r.card_count));
    }

    return {
        profile: profileRes.data ?? {},
        deckCount,
        cardCount,
        reviewCount,
        sessionCount,
        feedbackCount,
        recentReviews: ((reviewDays.data ?? []) as Array<{ day: string; total: number; correct: number }>).map((r) => {
            const total = Number(r.total);
            const correct = Number(r.correct);
            return {
                date: String(r.day).slice(0, 10),
                count: total,
                retention: total > 0 ? Math.round((correct / total) * 100) : 0,
            };
        }),
        decks: decks.map((d) => ({
            id: d.id,
            name: d.name,
            card_count: perDeck.get(d.id) ?? 0,
            created_at: d.created_at,
        })),
        feedback: feedback.map((f) => ({
            id: f.id,
            areas: f.areas ?? [],
            description: f.description,
            created_at: f.created_at,
        })),
    };
}

async function feedback() {
    const [rows, authUsers] = await Promise.all([
        selectAll<Record<string, unknown> & { user_id: string }>(() =>
            db.from('feedback').select('*').order('created_at', { ascending: false })),
        listAllAuthUsers(),
    ]);
    const emails = new Map(authUsers.map((u) => [u.id, u.email ?? 'unknown']));
    return rows.map((f) => ({ ...f, user_email: emails.get(f.user_id) ?? 'unknown' }));
}

// ── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: 'unauthorized' }, 401);
    if (caller.app_metadata?.role !== 'admin') {
        console.warn('admin call refused', { userId: caller.id });
        return json({ error: 'forbidden' }, 403);
    }

    let body: { action?: unknown; userId?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'invalid JSON body' }, 400);
    }

    try {
        switch (body.action) {
            case 'overview':
                return json(await overview());
            case 'users':
                return json(await users());
            case 'userDetail':
                if (typeof body.userId !== 'string' || !UUID_RE.test(body.userId)) {
                    return json({ error: 'userId must be a UUID' }, 400);
                }
                return json(await userDetail(body.userId));
            case 'feedback':
                return json(await feedback());
            default:
                return json({ error: 'unknown action' }, 400);
        }
    } catch (err) {
        console.error('admin action failed', { action: body.action, error: err instanceof Error ? err.message : String(err) });
        return json({ error: 'internal error' }, 500);
    }
});
