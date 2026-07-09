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

const GREETINGS: Record<TimeOfDay, string> = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
};

/** "Good morning" / "Good afternoon" / "Good evening" for the given time. */
export function getGreeting(date: Date = new Date()): string {
    return GREETINGS[getTimeOfDay(date)];
}
