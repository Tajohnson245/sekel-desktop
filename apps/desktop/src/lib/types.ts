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
    created_at: string;
    updated_at: string;
}

export type DeckInsert = Omit<Deck, 'id' | 'created_at' | 'updated_at'>;
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
    name: string;
    fields: FieldDefinition[];
    card_templates: CardTemplate[];
    created_at: string;
    updated_at: string;
}

export type NoteTypeInsert = Omit<NoteType, 'id' | 'created_at' | 'updated_at' | 'anki_id'> & { anki_id?: number | null };
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
    created_at: string;
    updated_at: string;
}

export type NoteInsert = Omit<Note, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'anki_guid'> & { anki_id?: number | null; anki_guid?: string | null };
export type NoteUpdate = Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// ─────────────────────────────────────────────────────────────────
// Card (FSRS scheduling state)
// ─────────────────────────────────────────────────────────────────
export interface Card {
    id: string;
    user_id: string;
    anki_id: number | null;
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

export type CardInsert = Omit<Card, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'ease_factor'> & { anki_id?: number | null; ease_factor?: number | null };
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

export interface TopForgottenCard {
    cardId: string;
    lapseCount: number;
    frontPreview?: string | null;
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
    };
    timeStats?: {
        averageTimeMs: number;
        timeByRating: TimeByRatingItem[];
        slowestCards: SlowestCard[];
    };
}

// ─────────────────────────────────────────────────────────────────
// Default Note Types (pre-populated for new users)
// ─────────────────────────────────────────────────────────────────
export const DEFAULT_NOTE_TYPES: Omit<NoteType, 'id' | 'user_id' | 'anki_id' |'created_at' | 'updated_at'>[] = [
    {
        name: 'Basic',
        fields: [{ name: 'Front' }, { name: 'Back' }],
        card_templates: [
            {
                name: 'Card 1',
                front_template: '{{Front}}',
                back_template: '{{Back}}',
            },
        ],
    },
    {
        name: 'Basic (and reversed card)',
        fields: [{ name: 'Front' }, { name: 'Back' }],
        card_templates: [
            {
                name: 'Card 1',
                front_template: '{{Front}}',
                back_template: '{{Back}}',
            },
            {
                name: 'Card 2',
                front_template: '{{Back}}',
                back_template: '{{Front}}',
            },
        ],
    },
    {
        name: 'Image Occlusion',
        fields: [
            { name: 'Image' },       // public URL of uploaded image
            { name: 'Rectangles' },   // JSON array of all rects [{x,y,w,h},...]
            { name: 'ActiveIndex' },  // which rect is masked on this card
            { name: 'Front' },        // optional context/prompt text shown above the image
            { name: 'Back' },         // optional explanation text shown after reveal
        ],
        card_templates: [
            {
                name: 'Occlusion Card',
                front_template: '<div class="occlusion-text-above">{{Front}}</div><div class="occlusion-card" data-rects="{{Rectangles}}" data-active="{{ActiveIndex}}"><img src="{{Image}}" /></div>',
                back_template: '<div class="occlusion-text-above">{{Back}}</div><div class="occlusion-card occlusion-reveal" data-rects="{{Rectangles}}" data-active="{{ActiveIndex}}"><img src="{{Image}}" /></div>',
            },
        ],
    },
];

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

