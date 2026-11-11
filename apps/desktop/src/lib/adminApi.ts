import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Feedback } from '@sekel/db';

/**
 * Admin dashboard data, served by the `admin` edge function
 * (supabase/functions/admin). The function checks the caller's JWT and
 * requires app_metadata.role = 'admin'; the checks here only decide what UI
 * to show.
 */

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

export type AdminFeedbackRow = Feedback & { user_email: string };

/**
 * True when the user has the admin role. app_metadata is set server-side only
 * (users can't change it), and the edge function re-checks it on every call.
 */
export function isAdminUser(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
    return user?.app_metadata?.role === 'admin';
}

async function invokeAdmin<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.functions.invoke('admin', { body });
    if (error) throw error;
    return data as T;
}

export function fetchAdminOverview(client: SupabaseClient): Promise<AdminOverview> {
    return invokeAdmin(client, { action: 'overview' });
}

export function fetchAdminUsers(client: SupabaseClient): Promise<AdminUserRow[]> {
    return invokeAdmin(client, { action: 'users' });
}

export function fetchAdminUserDetail(client: SupabaseClient, userId: string): Promise<AdminUserDetail> {
    return invokeAdmin(client, { action: 'userDetail', userId });
}

export function fetchAdminFeedback(client: SupabaseClient): Promise<AdminFeedbackRow[]> {
    return invokeAdmin(client, { action: 'feedback' });
}
