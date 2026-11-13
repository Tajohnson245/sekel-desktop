/**
 * Small per-user UI state that follows the user between computers
 * (user_profiles.ui_state, SEKEL-157): the minimal study view, which feature
 * tours and session briefings were already shown, rebalance acknowledgements.
 *
 * localStorage stays as the fast path and the fallback — before the profile
 * loads, offline, or on a server that doesn't have the column yet. Writes go
 * to both; reads prefer the profile and fall back to localStorage.
 *
 * Shape: { minimal_study_view?: boolean,
 *          tours_seen?: { [tour]: true },
 *          briefings_seen?: { [tierKey]: true },
 *          rebalance_acks?: { ["{examKey}:{evaluatedSince}"]: daysMissed } }
 */
import { upsertUserProfile, type UserProfile } from '@sekel/db';
import { supabase } from './supabase';
import { useProfileStore } from '../stores/profileStore';

type UiState = Record<string, unknown>;
type ProfileWithUiState = UserProfile & { ui_state?: UiState | null };

function currentUiState(): UiState | null {
    const p = useProfileStore.getState().profile as ProfileWithUiState | null;
    return p?.ui_state && typeof p.ui_state === 'object' ? p.ui_state : null;
}

/** The profile's value for section (or section[key]); undefined when unknown. */
export function getUiValue(section: string, key?: string): unknown {
    const s = currentUiState();
    if (!s) return undefined;
    const v = s[section];
    if (key === undefined) return v;
    return v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
}

/**
 * Sets section (or section[key]) in the profile's ui_state: updated in the
 * store immediately, saved in the background. Failures are ignored —
 * callers also keep the value in localStorage.
 */
export function setUiValue(section: string, key: string | undefined, value: unknown): void {
    const profile = useProfileStore.getState().profile as ProfileWithUiState | null;
    if (!profile) return;
    const next: UiState = { ...(currentUiState() ?? {}) };
    if (key === undefined) next[section] = value;
    else next[section] = { ...((next[section] as Record<string, unknown> | undefined) ?? {}), [key]: value };

    useProfileStore.setState({ profile: { ...profile, ui_state: next } as UserProfile });
    upsertUserProfile(supabase, profile.id, { ui_state: next } as Partial<UserProfile>)
        .then((saved) => {
            // Keep the store on the server's copy only if nothing changed meanwhile.
            const now = useProfileStore.getState().profile as ProfileWithUiState | null;
            if (now?.ui_state === next) useProfileStore.setState({ profile: saved });
        })
        .catch(() => { /* e.g. column not deployed yet; localStorage still has it */ });
}

export function readLocal(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

export function writeLocal(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
