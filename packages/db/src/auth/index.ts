import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

export function signIn(client: SupabaseClient, email: string, password: string) {
    return client.auth.signInWithPassword({ email, password });
}

export function signUp(
    client: SupabaseClient,
    email: string,
    password: string,
    options?: { emailRedirectTo?: string },
) {
    return client.auth.signUp({
        email,
        password,
        options: options?.emailRedirectTo ? { emailRedirectTo: options.emailRedirectTo } : undefined,
    });
}

export function signOut(client: SupabaseClient) {
    return client.auth.signOut();
}

export function resetPasswordForEmail(
    client: SupabaseClient,
    email: string,
    options?: { redirectTo?: string },
) {
    return client.auth.resetPasswordForEmail(
        email,
        options?.redirectTo ? { redirectTo: options.redirectTo } : undefined,
    );
}

export function getSession(client: SupabaseClient) {
    return client.auth.getSession();
}

export function onAuthStateChange(
    client: SupabaseClient,
    callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
    return client.auth.onAuthStateChange(callback);
}

export function updatePassword(client: SupabaseClient, password: string) {
    return client.auth.updateUser({ password });
}

export function updateEmail(client: SupabaseClient, email: string) {
    return client.auth.updateUser({ email });
}

export function deleteAccount(client: SupabaseClient) {
    return client.rpc('delete_own_account');
}
