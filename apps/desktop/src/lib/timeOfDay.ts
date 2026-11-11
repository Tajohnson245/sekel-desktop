import i18n from '../i18n';

/**
 * Time-of-day helpers for time-aware messaging across the app. Uses the
 * renderer's local clock. Buckets: morning (before noon), afternoon
 * (noon–5pm), evening (5pm onward).
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
    const h = date.getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
}

const GREETING_KEYS: Record<TimeOfDay, string> = {
    morning: 'dashboard.greeting_morning',
    afternoon: 'dashboard.greeting_afternoon',
    evening: 'dashboard.greeting_evening',
};

/**
 * Localized "Good morning" / "Good afternoon" / "Good evening" for the given
 * time. Translates through the shared i18n instance (evaluated at call time,
 * in the current language) so callers don't need to pass `t`.
 */
export function getGreeting(date: Date = new Date()): string {
    return i18n.t(GREETING_KEYS[getTimeOfDay(date)]);
}
