/**
 * Admin-only IPC handlers for the diagnostics dashboard.
 * Uses a service-role Supabase client to bypass RLS and query all users' data.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { instrumentedHandle, createLogger, consoleTransport } from '@sekel/observability';

const log = createLogger({ module: 'admin', transports: [consoleTransport] });

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
    if (adminClient) return adminClient;

    const url = process.env.VITE_SUPABASE_PROJECT_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Missing VITE_SUPABASE_PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    adminClient = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return adminClient;
}

function requireAdmin(email: string | undefined): void {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || email !== adminEmail) {
        throw new Error('Unauthorized');
    }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface AdminUserRow {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    medical_school: string | null;
    role: string | null;
    exam: string | null;
    location: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    deck_count: number;
    card_count: number;
    review_count: number;
    last_review_at: string | null;
}

export interface AdminOverview {
    totalUsers: number;
    activeToday: number;
    activeLast7Days: number;
    activeLast30Days: number;
    totalDecks: number;
    totalCards: number;
    totalReviews: number;
    totalFeedback: number;
    reviewsByDay: Array<{ date: string; count: number }>;
    signupsByDay: Array<{ date: string; count: number }>;
}

export interface AdminUserDetail {
    profile: Record<string, unknown>;
    deckCount: number;
    cardCount: number;
    reviewCount: number;
    sessionCount: number;
    feedbackCount: number;
    recentReviews: Array<{ date: string; count: number; retention: number }>;
    decks: Array<{ id: string; name: string; card_count: number; created_at: string }>;
    feedback: Array<{ id: string; areas: string[]; description: string; created_at: string }>;
}

// ── Handlers ────────────────────────────────────────────────────────────────

export function setupAdminHandlers(): void {
    // Overview stats
    instrumentedHandle('admin:getOverview', async (_e, callerEmail: string) => {
        requireAdmin(callerEmail);
        const client = getAdminClient();

        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const day7 = new Date(now.getTime() - 7 * 86400000).toISOString();
        const day30 = new Date(now.getTime() - 30 * 86400000).toISOString();

        const [
            { count: totalUsers },
            { count: totalDecks },
            { count: totalCards },
            { count: totalReviews },
            { count: totalFeedback },
            _recentReviews,
            { data: authUsers },
        ] = await Promise.all([
            client.from('user_profiles').select('*', { count: 'exact', head: true }),
            client.from('decks').select('*', { count: 'exact', head: true }),
            client.from('cards').select('*', { count: 'exact', head: true }),
            client.from('reviews').select('*', { count: 'exact', head: true }),
            client.from('feedback').select('*', { count: 'exact', head: true }),
            client.from('reviews')
                .select('review_time')
                .gte('review_time', day30)
                .order('review_time', { ascending: true }),
            client.auth.admin.listUsers({ perPage: 1000 }),
        ]);

        // Count active users from reviews
        const todayReviewers = new Set<string>();
        const week7Reviewers = new Set<string>();
        const reviewsByDayMap: Record<string, number> = {};

        // Fetch reviews with user_id for active-user counting
        const { data: reviewsWithUser } = await client
            .from('reviews')
            .select('user_id, review_time')
            .gte('review_time', day30);

        for (const r of reviewsWithUser ?? []) {
            const date = (r.review_time as string).slice(0, 10);
            reviewsByDayMap[date] = (reviewsByDayMap[date] ?? 0) + 1;
            if (date === today) todayReviewers.add(r.user_id);
            if (r.review_time >= day7) week7Reviewers.add(r.user_id);
        }

        // Signups by day (last 30 days)
        const signupsByDayMap: Record<string, number> = {};
        const users = authUsers?.users ?? [];
        for (const u of users) {
            if (u.created_at && u.created_at >= day30) {
                const date = u.created_at.slice(0, 10);
                signupsByDayMap[date] = (signupsByDayMap[date] ?? 0) + 1;
            }
        }

        const reviewsByDay = Object.entries(reviewsByDayMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const signupsByDay = Object.entries(signupsByDayMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const overview: AdminOverview = {
            totalUsers: totalUsers ?? 0,
            activeToday: todayReviewers.size,
            activeLast7Days: week7Reviewers.size,
            activeLast30Days: new Set((reviewsWithUser ?? []).map(r => r.user_id)).size,
            totalDecks: totalDecks ?? 0,
            totalCards: totalCards ?? 0,
            totalReviews: totalReviews ?? 0,
            totalFeedback: totalFeedback ?? 0,
            reviewsByDay,
            signupsByDay,
        };

        log.info('Admin overview fetched', { totalUsers: overview.totalUsers });
        return overview;
    });

    // User list
    instrumentedHandle('admin:getUsers', async (_e, callerEmail: string) => {
        requireAdmin(callerEmail);
        const client = getAdminClient();

        // Fetch profiles
        const { data: profiles, error: profileErr } = await client
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (profileErr) throw profileErr;

        // Fetch auth users for email + last_sign_in
        const { data: authData } = await client.auth.admin.listUsers({ perPage: 1000 });
        const authMap = new Map<string, { email?: string; last_sign_in_at?: string }>();
        for (const u of authData?.users ?? []) {
            authMap.set(u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at ?? undefined });
        }

        // Build user rows with available data
        const users: AdminUserRow[] = (profiles ?? []).map(p => {
            const auth = authMap.get(p.id);
            return {
                id: p.id,
                email: auth?.email ?? null,
                first_name: p.first_name,
                last_name: p.last_name,
                medical_school: p.medical_school,
                role: p.role,
                exam: p.exam,
                location: p.location,
                created_at: p.created_at,
                last_sign_in_at: auth?.last_sign_in_at ?? null,
                deck_count: 0,
                card_count: 0,
                review_count: 0,
                last_review_at: null,
            };
        });

        // Enrich with per-user counts (separate queries since RPC may not exist)
        for (const user of users) {
            const [decks, cards, reviews] = await Promise.all([
                client.from('decks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
                client.from('cards').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
                client.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
            ]);
            user.deck_count = decks.count ?? 0;
            user.card_count = cards.count ?? 0;
            user.review_count = reviews.count ?? 0;

            const { data: lastReview } = await client
                .from('reviews')
                .select('review_time')
                .eq('user_id', user.id)
                .order('review_time', { ascending: false })
                .limit(1);
            user.last_review_at = lastReview?.[0]?.review_time ?? null;
        }

        log.info('Admin users fetched', { count: users.length });
        return users;
    });

    // User detail
    instrumentedHandle('admin:getUserDetail', async (_e, callerEmail: string, userId: string) => {
        requireAdmin(callerEmail);
        const client = getAdminClient();

        const [
            { data: profile },
            { count: deckCount },
            { count: cardCount },
            { count: reviewCount },
            { count: sessionCount },
            { count: feedbackCount },
            { data: decksRaw },
            { data: feedbackRaw },
            { data: reviewsRaw },
        ] = await Promise.all([
            client.from('user_profiles').select('*').eq('id', userId).single(),
            client.from('decks').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            client.from('cards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            client.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            client.from('deck_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            client.from('feedback').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            client.from('decks').select('id, name, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
            client.from('feedback').select('id, areas, description, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
            client.from('reviews').select('review_time, rating').eq('user_id', userId)
                .gte('review_time', new Date(Date.now() - 30 * 86400000).toISOString())
                .order('review_time', { ascending: true }),
        ]);

        // Get card count per deck
        const deckIds = (decksRaw ?? []).map(d => d.id);
        const deckCardCounts: Record<string, number> = {};
        if (deckIds.length > 0) {
            const { data: cardsByDeck } = await client
                .from('cards')
                .select('note_id, notes!inner(deck_id)')
                .eq('user_id', userId);

            // Count cards per deck from notes relationship
            for (const c of cardsByDeck ?? []) {
                const deckId = (c as unknown as { notes: { deck_id: string } }).notes?.deck_id;
                if (deckId) deckCardCounts[deckId] = (deckCardCounts[deckId] ?? 0) + 1;
            }
        }

        // Aggregate reviews by day with retention
        const reviewsByDay: Record<string, { total: number; correct: number }> = {};
        for (const r of reviewsRaw ?? []) {
            const date = (r.review_time as string).slice(0, 10);
            if (!reviewsByDay[date]) reviewsByDay[date] = { total: 0, correct: 0 };
            reviewsByDay[date].total++;
            if (r.rating !== 'again') reviewsByDay[date].correct++;
        }

        const detail: AdminUserDetail = {
            profile: profile ?? {},
            deckCount: deckCount ?? 0,
            cardCount: cardCount ?? 0,
            reviewCount: reviewCount ?? 0,
            sessionCount: sessionCount ?? 0,
            feedbackCount: feedbackCount ?? 0,
            recentReviews: Object.entries(reviewsByDay)
                .map(([date, { total, correct }]) => ({
                    date,
                    count: total,
                    retention: total > 0 ? Math.round((correct / total) * 100) : 0,
                }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            decks: (decksRaw ?? []).map(d => ({
                id: d.id,
                name: d.name,
                card_count: deckCardCounts[d.id] ?? 0,
                created_at: d.created_at,
            })),
            feedback: (feedbackRaw ?? []).map(f => ({
                id: f.id,
                areas: f.areas ?? [],
                description: f.description,
                created_at: f.created_at,
            })),
        };

        log.info('Admin user detail fetched', { userId });
        return detail;
    });

    // All feedback
    instrumentedHandle('admin:getFeedback', async (_e, callerEmail: string) => {
        requireAdmin(callerEmail);
        const client = getAdminClient();

        const { data, error } = await client
            .from('feedback')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        // Enrich with user emails
        const { data: authData } = await client.auth.admin.listUsers({ perPage: 1000 });
        const emailMap = new Map<string, string>();
        for (const u of authData?.users ?? []) {
            emailMap.set(u.id, u.email ?? 'unknown');
        }

        return (data ?? []).map(f => ({
            ...f,
            user_email: emailMap.get(f.user_id) ?? 'unknown',
        }));
    });
}
