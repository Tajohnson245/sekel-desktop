/**
 * The synced tables: one entry per user-owned SQLite table, mirrored 1:1 into
 * a Supabase table of the same name (docs/features/desktop/in-progress/
 * supabase-sync.md).
 *
 * This list is the single source of truth for the serializer, the local
 * outbox triggers (migration 26) and the drift test that checks the Postgres
 * schema (supabase/migrations/*_sync_schema.sql) column by column.
 *
 * Every server table also has the sync columns in SYNC_COLUMNS, and `user_id`.
 */

export type SyncColumnType = 'uuid' | 'text' | 'int' | 'bigint' | 'real' | 'bool' | 'json' | 'ts';

export interface SyncColumn {
    /** Server column name (also the local name unless `local` says otherwise). */
    name: string;
    type: SyncColumnType;
    /** NOT NULL on the server. */
    required?: boolean;
}

export type SyncTableName =
    | 'note_types' | 'decks' | 'notes' | 'cards' | 'deck_sessions' | 'reviews'
    | 'card_drafts' | 'media' | 'plans' | 'user_exam_profiles' | 'card_classifications'
    | 'time_travel_log';

export interface SyncTable {
    name: SyncTableName;
    /**
     * 'id': rows are identified by a UUID primary key (same id locally and on
     * the server). 'natural': identified by other columns (see the table's
     * notes in serialize.ts) because the local key is an install-specific
     * INTEGER.
     */
    key: 'id' | 'natural';
    columns: SyncColumn[];
}

/** Server-managed columns present on every synced table. */
export const SYNC_COLUMNS: SyncColumn[] = [
    { name: 'client_changed_at', type: 'ts', required: true },
    { name: 'deleted_at', type: 'ts' },
    { name: 'origin_device', type: 'uuid' },
    { name: 'server_seq', type: 'bigint', required: true },
    { name: 'server_updated_at', type: 'ts', required: true },
];

const ts = (name: string, required = true): SyncColumn => ({ name, type: 'ts', required });

/**
 * In dependency order: a table only references tables listed before it.
 * Pushes apply upserts in this order; pulls apply them in this order too.
 */
export const SYNC_TABLES: SyncTable[] = [
    {
        name: 'note_types', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'name', type: 'text', required: true },
            { name: 'fields', type: 'json', required: true },
            { name: 'card_templates', type: 'json', required: true },
            ts('created_at'), ts('updated_at'),
            { name: 'anki_id', type: 'bigint' },
            { name: 'anki_meta', type: 'json' },
        ],
    },
    {
        name: 'decks', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'name', type: 'text', required: true },
            { name: 'description', type: 'text' },
            ts('created_at'), ts('updated_at'),
            { name: 'algorithm', type: 'text', required: true },
            { name: 'parent_id', type: 'uuid' },
            { name: 'anki_id', type: 'bigint' },
            { name: 'anki_meta', type: 'json' },
        ],
    },
    {
        name: 'notes', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'deck_id', type: 'uuid', required: true },
            { name: 'note_type_id', type: 'uuid', required: true },
            { name: 'fields', type: 'json', required: true },
            { name: 'tags', type: 'json', required: true },
            ts('created_at'), ts('updated_at'),
            { name: 'anki_id', type: 'bigint' },
            { name: 'anki_guid', type: 'text' },
            { name: 'anki_meta', type: 'json' },
            { name: 'format', type: 'text' },
        ],
    },
    {
        name: 'cards', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'note_id', type: 'uuid', required: true },
            { name: 'template_index', type: 'int', required: true },
            { name: 'state', type: 'text', required: true },
            ts('due'),
            { name: 'stability', type: 'real', required: true },
            { name: 'difficulty', type: 'real', required: true },
            { name: 'elapsed_days', type: 'int', required: true },
            { name: 'scheduled_days', type: 'int', required: true },
            { name: 'reps', type: 'int', required: true },
            { name: 'lapses', type: 'int', required: true },
            ts('last_review', false),
            ts('created_at'), ts('updated_at'),
            { name: 'anki_id', type: 'bigint' },
            { name: 'ease_factor', type: 'real' },
            { name: 'anki_meta', type: 'json' },
            { name: 'learning_steps', type: 'int', required: true },
        ],
    },
    {
        name: 'deck_sessions', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'deck_id', type: 'uuid', required: true },
            { name: 'status', type: 'text', required: true },
            ts('started_at'),
            ts('completed_at', false),
            ts('created_at'),
            { name: 'kind', type: 'text', required: true },
            { name: 'scope', type: 'text' },
            { name: 'system_keys', type: 'json' },
            ts('updated_at', false),
        ],
    },
    {
        name: 'reviews', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'card_id', type: 'uuid', required: true },
            { name: 'rating', type: 'text', required: true },
            ts('review_time'),
            { name: 'review_duration_ms', type: 'int' },
            { name: 'state_before', type: 'text', required: true },
            { name: 'stability_before', type: 'real', required: true },
            { name: 'difficulty_before', type: 'real', required: true },
            { name: 'state_after', type: 'text', required: true },
            { name: 'stability_after', type: 'real', required: true },
            { name: 'difficulty_after', type: 'real', required: true },
            { name: 'scheduled_days', type: 'int', required: true },
            { name: 'session_id', type: 'uuid' },
            { name: 'deck_id', type: 'uuid' },
            { name: 'review_index', type: 'int' },
            ts('created_at'),
            { name: 'interval_before', type: 'int' },
            { name: 'ease_factor_after', type: 'real' },
            { name: 'review_type', type: 'int' },
        ],
    },
    {
        name: 'card_drafts', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'front', type: 'text', required: true },
            { name: 'back', type: 'text', required: true },
            { name: 'source', type: 'text' },
            ts('created_at'),
            ts('updated_at', false),
        ],
    },
    {
        // Locally file_path is an absolute path on this machine; the server
        // keeps storage_path ("{user}/{sha1}{ext}" in the sekel-media bucket).
        name: 'media', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'filename', type: 'text', required: true },
            { name: 'file_hash', type: 'text', required: true },
            { name: 'file_size', type: 'bigint' },
            { name: 'mime_type', type: 'text' },
            ts('created_at'),
            { name: 'storage_path', type: 'text', required: true },
        ],
    },
    {
        name: 'plans', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'exam_key', type: 'text', required: true },
            { name: 'name', type: 'text', required: true },
            { name: 'cards_per_day', type: 'int', required: true },
            { name: 'suggested_per_day', type: 'int', required: true },
            { name: 'snapshot', type: 'json', required: true },
            { name: 'status', type: 'text', required: true },
            ts('activated_at'),
            ts('created_at'), ts('updated_at'),
            { name: 'deck_filter', type: 'json' },
        ],
    },
    {
        // Natural key (user_id, exam_key); locally (user_id, exam_id) where
        // exam_id is this install's blueprint rowid.
        name: 'user_exam_profiles', key: 'natural', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'exam_key', type: 'text', required: true },
            { name: 'exam_date', type: 'text', required: true },
            { name: 'is_primary', type: 'bool', required: true },
            { name: 'session_mode', type: 'text', required: true },
            ts('created_at'), ts('updated_at'),
            { name: 'last_notified_threshold', type: 'real' },
        ],
    },
    {
        // Natural key (card_id, exam_key, system_key); a card's rows for one
        // exam sync as a set, because classifying replaces the whole set.
        name: 'card_classifications', key: 'natural', columns: [
            { name: 'id', type: 'uuid', required: true },
            { name: 'card_id', type: 'uuid', required: true },
            { name: 'exam_key', type: 'text', required: true },
            { name: 'system_key', type: 'text' },
            { name: 'topic_key', type: 'text' },
            { name: 'confidence', type: 'real' },
            { name: 'split_weight', type: 'real', required: true },
            ts('classified_at'),
            { name: 'model_version', type: 'text' },
        ],
    },
    {
        // id is the local sync_id (the local PK is an INTEGER).
        name: 'time_travel_log', key: 'id', columns: [
            { name: 'id', type: 'uuid', required: true },
            ts('triggered_at'),
            { name: 'overdue_count', type: 'int', required: true },
            { name: 'window_days', type: 'int', required: true },
            { name: 'daily_target', type: 'int', required: true },
        ],
    },
];

export const SYNC_TABLE_NAMES = SYNC_TABLES.map((t) => t.name);

/** Position in dependency order (parents first). */
export function tableRank(name: string): number {
    const i = SYNC_TABLE_NAMES.indexOf(name as SyncTableName);
    if (i < 0) throw new Error(`Unknown sync table: ${name}`);
    return i;
}

export function getSyncTable(name: string): SyncTable {
    const t = SYNC_TABLES.find((x) => x.name === name);
    if (!t) throw new Error(`Unknown sync table: ${name}`);
    return t;
}
