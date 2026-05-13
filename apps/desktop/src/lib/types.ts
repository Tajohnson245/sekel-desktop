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
// Card format — see packages/db/src/types.ts for the canonical definition.
// Renderers branch on this attribute to apply format-specific styling.
// ─────────────────────────────────────────────────────────────────
export type CardFormat =
    | 'basic'
    | 'cloze'
    | 'reversed'
    | 'true-false'
    | 'compare-contrast'
    | 'multiple-choice';

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
    format: CardFormat | null;
    anki_id: number | null;
    anki_guid: string | null;
    created_at: string;
    updated_at: string;
}

export type NoteInsert = Omit<Note, 'id' | 'created_at' | 'updated_at' | 'anki_id' | 'anki_guid' | 'format'> & { anki_id?: number | null; anki_guid?: string | null; format?: CardFormat | null };
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
// Image Occlusion Shapes
// ─────────────────────────────────────────────────────────────────

interface OcclusionShapeBase {
    id: string;          // crypto.randomUUID()
    groupId?: string;    // shapes with same groupId = 1 card unit
}

export interface OcclusionRectShape extends OcclusionShapeBase {
    type: 'rect';
    x: number;   // percentage 0-100
    y: number;
    w: number;
    h: number;
}

export interface OcclusionEllipseShape extends OcclusionShapeBase {
    type: 'ellipse';
    cx: number;  // center x, percentage 0-100
    cy: number;
    rx: number;  // radius x
    ry: number;
}

export interface OcclusionPolygonShape extends OcclusionShapeBase {
    type: 'polygon';
    points: { x: number; y: number }[];  // each point percentage 0-100
}

export type OcclusionShape = OcclusionRectShape | OcclusionEllipseShape | OcclusionPolygonShape;

export type IOMode = 'hide-all-guess-one' | 'hide-one-guess-one' | 'hide-all-reveal-all';

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
            { name: 'Image' },        // public URL of uploaded image
            { name: 'Shapes' },        // JSON array of OcclusionShape[]
            { name: 'ActiveIndex' },   // which card unit is masked on this card
            { name: 'IOMode' },        // 'hide-all-guess-one' | 'hide-one-guess-one'
            { name: 'Header' },        // optional text shown above image on front + back
            { name: 'BackExtra' },     // optional text shown below image on back only
        ],
        card_templates: [
            {
                name: 'Occlusion Card',
                front_template: '<div class="occlusion-text-above">{{Header}}</div><div class="occlusion-card" data-shapes="{{Shapes}}" data-active="{{ActiveIndex}}" data-iomode="{{IOMode}}"><img src="{{Image}}" /></div>',
                back_template: '<div class="occlusion-text-above">{{Header}}</div><div class="occlusion-card occlusion-reveal" data-shapes="{{Shapes}}" data-active="{{ActiveIndex}}" data-iomode="{{IOMode}}"><img src="{{Image}}" /></div><div class="occlusion-text-below">{{BackExtra}}</div>',
            },
        ],
    },
];

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

