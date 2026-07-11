/**
 * Tier awareness (spec §9.6). There is no subscription column on the profile
 * yet, so we read an optional `subscription_tier` (if the backend ever adds
 * one) and otherwise treat an authenticated cloud user as DEDICATED. The FREE
 * branch is fully implemented downstream — the tier card's FREE variant and the
 * AI-surface UPGRADE chip — so those light up the moment that field lands with
 * no further UI work.
 */
import { useProfileStore } from '../stores/profileStore';

export type Tier = 'dedicated' | 'free';

export interface TierState {
    tier: Tier;
    isDedicated: boolean;
    isFree: boolean;
}

export function useTier(): TierState {
    const profile = useProfileStore((s) => s.profile);
    const raw = (profile as { subscription_tier?: string | null } | null)?.subscription_tier;
    const tier: Tier = raw === 'free' ? 'free' : 'dedicated';
    return { tier, isDedicated: tier === 'dedicated', isFree: tier === 'free' };
}
