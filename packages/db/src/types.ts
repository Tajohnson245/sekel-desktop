/**
 * TypeScript type definitions matching Supabase schema
 * for Sekel flashcard system
 */

// ─────────────────────────────────────────────────────────────────
// Card State (matches Postgres enum)
// ─────────────────────────────────────────────────────────────────
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

// ─────────────────────────────────────────────────────────────────
// Rating (matches Postgres enum)
// ─────────────────────────────────────────────────────────────────
export type Rating = 'again' | 'hard' | 'good' | 'easy';

// ─────────────────────────────────────────────────────────────────
// Deck
// ─────────────────────────────────────────────────────────────────
export interface Deck {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    algorithm: 'fsrs' | 'sm2';
    parent_id: string | null;
    anki_id: number | null;
    anki_meta: string | null;
    created_at: string;
    updated_at: string;
}

export type DeckInsert = Omit<Deck, 'id' | 'created_at' | 'updated_at' | 'anki_meta'> & { anki_meta?: string | null };
export type DeckUpdate = Partial<Omit<Deck, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// ─────────────────────────────────────────────────────────────────
// Note Type (defines card templates)
// ─────────────────────────────────────────────────────────────────
export interface FieldDefinition {
    name: string;
}

export interface CardTemplate {
    name: string;
    front_template: string;
    back_template: string;
}

export interface NoteType {
    id: string;
    user_id: string;
    anki_id: number | null;
    anki_meta: string | null;
    name: string;
    fields: FieldDefinition[];
    card_templates: CardTemplate[];
    created_at: string;
    updated_at: string;
}

export type NoteTypeInsert = Omit<NoteType, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'anki_meta'> & { anki_id?: number | null; anki_meta?: string | null };
export type NoteTypeUpdate = Partial<Omit<NoteType, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// ─────────────────────────────────────────────────────────────────
// Note (source content)
// ─────────────────────────────────────────────────────────────────
export interface Note {
    id: string;
    user_id: string;
    deck_id: string;
    note_type_id: string;
    fields: Record<string, string>;
    tags: string[];
    anki_id: number | null;
    anki_guid: string | null;
    anki_meta: string | null;
    created_at: string;
    updated_at: string;
}

export type NoteInsert = Omit<Note, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'anki_guid' | 'anki_meta'> & { anki_id?: number | null; anki_guid?: string | null; anki_meta?: string | null };
export type NoteUpdate = Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// ─────────────────────────────────────────────────────────────────
// Card (FSRS scheduling state)
// ─────────────────────────────────────────────────────────────────
export interface Card {
    id: string;
    user_id: string;
    anki_id: number | null;
    anki_meta: string | null;
    ease_factor: number | null;
    note_id: string;
    template_index: number;

    // FSRS state
    state: CardState;
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    last_review: string | null;

    created_at: string;
    updated_at: string;
}

export type CardInsert = Omit<Card, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'anki_meta' | 'ease_factor'> & { anki_id?: number | null; anki_meta?: string | null; ease_factor?: number | null };
export type CardUpdate = Partial<Omit<Card, 'id' | 'user_id' | 'note_id' | 'template_index' | 'created_at' | 'updated_at'>>;

// ─────────────────────────────────────────────────────────────────
// Session Status (matches Postgres enum)
// ─────────────────────────────────────────────────────────────────
export type SessionStatus = 'in_progress' | 'completed';

// ─────────────────────────────────────────────────────────────────
// Deck Session (for post-session analytics)
// ─────────────────────────────────────────────────────────────────
export interface DeckSession {
    id: string;
    user_id: string;
    deck_id: string;
    status: SessionStatus;
    started_at: string;
    completed_at: string | null;
    created_at: string;
}

export type DeckSessionInsert = Omit<DeckSession, 'id' | 'created_at' | 'completed_at'> & { completed_at?: string | null };

// ─────────────────────────────────────────────────────────────────
// Review (history log)
// ─────────────────────────────────────────────────────────────────
export interface Review {
    id: string;
    user_id: string;
    card_id: string;
    rating: Rating;
    review_time: string;
    review_duration_ms: number | null;

    // state before review
    state_before: CardState;
    stability_before: number;
    difficulty_before: number;

    // state after review
    state_after: CardState;
    stability_after: number;
    difficulty_after: number;
    scheduled_days: number;

    // session scoping (for analytics)
    session_id: string | null;
    deck_id: string | null;
    review_index: number | null;

    // anki import metadata
    interval_before: number | null;
    ease_factor_after: number | null;
    review_type: number | null;

    created_at: string;
}

export type ReviewInsert = Omit<Review, 'id' | 'created_at' | 'interval_before' | 'ease_factor_after' | 'review_type'> & { interval_before?: number | null; ease_factor_after?: number | null; review_type?: number | null };

// ─────────────────────────────────────────────────────────────────
// Media (imported from .apkg)
// ─────────────────────────────────────────────────────────────────
export interface Media {
    id: string;
    user_id: string;
    filename: string;
    file_path: string;
    file_hash: string;
    file_size: number | null;
    mime_type: string | null;
    import_id?: string | null;
    created_at: string;
}

export type MediaInsert = Omit<Media, 'id' | 'created_at'>;
export type MediaUpdate = Partial<Omit<Media, 'id' | 'user_id' | 'created_at'>>;

// ─────────────────────────────────────────────────────────────────
// Session Analytics (payload for post-session charts)
// ─────────────────────────────────────────────────────────────────
export interface RetentionTrendPoint {
    reviewIndex: number;
    retentionRate: number;
}

export interface RatingDistributionItem {
    rating: Rating;
    count: number;
    percent: number;
}

export interface CardClassificationLabel {
    systemLabel: string;
    topicLabel: string | null;
    splitWeight: number;
}

export interface TopForgottenCard {
    cardId: string;
    lapseCount: number;
    frontPreview?: string | null;
    classifications?: CardClassificationLabel[];
}

export interface TimeByRatingItem {
    rating: Rating;
    averageMs: number;
    count: number;
}

export interface SlowestCard {
    cardId: string;
    durationMs: number;
    frontPreview: string | null;
}

export interface SessionAnalytics {
    retentionTrend: RetentionTrendPoint[];
    ratingDistribution: RatingDistributionItem[];
    lapseStats: {
        lapseCount: number;
        lapseRate: number;
        totalReviews: number;
        topForgottenCards: TopForgottenCard[];
        missedCardIds: string[];
    };
    timeStats?: {
        averageTimeMs: number;
        timeByRating: TimeByRatingItem[];
        slowestCards: SlowestCard[];
    };
}

// ─────────────────────────────────────────────────────────────────
// Statistics Types (for dedicated statistics page)
// ─────────────────────────────────────────────────────────────────

export interface TodaySummary {
    totalReviews: number;
    againCount: number;
    newCount: number;
    learnCount: number;
    reviewCount: number;
    relearnCount: number;
    totalTimeMs: number;
}

export interface CardCountsByMaturity {
    newCount: number;
    learningCount: number;
    youngCount: number;
    matureCount: number;
}

export interface RetentionByMaturity {
    youngRetention: number | null;
    matureRetention: number | null;
    overallRetention: number | null;
}

// ─────────────────────────────────────────────────────────────────
// Missed Card Statistics (topic breakdown + trend)
// ─────────────────────────────────────────────────────────────────

export type DateRangeDays = 7 | 30 | 90 | null; // null = All time

export interface MissedTopicRow {
    topicKey: string;
    topicLabel: string;
    missCount: number;
    totalReviewsInTopic: number;
    missRate: number; // 0–100
}

export interface MissedSystemBreakdown {
    systemKey: string;
    systemLabel: string;
    missCount: number;
    totalReviewsInSystem: number;
    missRate: number; // 0–100
    topics: MissedTopicRow[];
}

export interface MissedCardStats {
    systems: MissedSystemBreakdown[];
    unclassifiedMissCount: number;
    totalMissCount: number;
    dateRangeDays: DateRangeDays;
}

export interface MissRateTrendPoint {
    date: string; // YYYY-MM-DD (daily) or YYYY-Www (weekly for all-time)
    totalReviews: number;
    missCount: number;
    missRate: number; // 0–100
}

// ─────────────────────────────────────────────────────────────────
// Draft Card (AI-generated, not yet in a deck)
// ─────────────────────────────────────────────────────────────────
export interface DraftCard {
    id: string;
    user_id: string;
    front: string;
    back: string;
    source: string | null;
    created_at: string;
}

export type DraftCardInsert = Pick<DraftCard, 'front' | 'back'> & { source?: string | null };

// ─────────────────────────────────────────────────────────────────
// User Profile
// ─────────────────────────────────────────────────────────────────
export interface UserProfile {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    medical_school: string | null;
    degree_track: string | null;
    exam: string | null;
    target_date: string | null;
    language: string;
    avatar_url: string | null;
    location: string | null;
    theme_preference: 'light' | 'dark' | 'system' | 'red' | 'purple' | 'pink' | 'turquoise';
    flip_animation: boolean;
    card_style: boolean;
    notifications_enabled: boolean;
    reminder_times: string[];
    background_url: string | null;
    daily_limits_enabled: boolean;
    daily_new_limit: number;
    daily_review_limit: number;
    max_answer_seconds: number;
    show_timer: boolean;
    auto_advance_on_timeout: boolean;
    intelligence_enabled: boolean;
    onboarded_at: string | null;
    created_at: string;
    updated_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Feedback
// ─────────────────────────────────────────────────────────────────
export type FeedbackType = 'bug' | 'feature_request' | 'question' | 'other';

export interface Feedback {
    id: string;
    user_id: string;
    type: FeedbackType;
    summary: string;
    areas: string[];
    description: string;
    screenshot_url: string | null;
    desired_fix: string | null;
    os: string | null;
    mac_chip: string | null;
    app_version: string | null;
    ticket_number: number;
    created_at: string;
}

export type FeedbackInsert = Omit<Feedback, 'id' | 'ticket_number' | 'created_at'>;
