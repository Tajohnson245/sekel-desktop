/**
 * Ordered array of migration SQL strings.
 * Each entry is applied once, tracked by index in the schema_version table.
 * To add a new migration, append a new string to this array — never edit existing entries.
 */
export const MIGRATIONS: string[] = [
    // Migration 001 — initial schema
    `
    CREATE TABLE IF NOT EXISTS note_types (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        name           TEXT NOT NULL,
        fields         TEXT NOT NULL DEFAULT '[]',
        card_templates TEXT NOT NULL DEFAULT '[]',
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_note_types_user_id ON note_types(user_id);

    CREATE TABLE IF NOT EXISTS decks (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        name         TEXT NOT NULL,
        description  TEXT,
        fsrs_enabled INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );
    `,
    // Migration 002 — deck enhancements: algorithm, parent_id, anki_id
    `
    ALTER TABLE decks ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'fsrs';
    UPDATE decks SET algorithm = CASE WHEN fsrs_enabled = 1 THEN 'fsrs' ELSE 'sm2' END;
    ALTER TABLE decks DROP COLUMN fsrs_enabled;
    ALTER TABLE decks ADD COLUMN parent_id TEXT REFERENCES decks(id);
    ALTER TABLE decks ADD COLUMN anki_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);

    CREATE TABLE IF NOT EXISTS notes (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        deck_id      TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        note_type_id TEXT NOT NULL REFERENCES note_types(id),
        fields       TEXT NOT NULL DEFAULT '{}',
        tags         TEXT NOT NULL DEFAULT '[]',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_deck_id ON notes(deck_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);

    CREATE TABLE IF NOT EXISTS cards (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        note_id        TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        template_index INTEGER NOT NULL DEFAULT 0,
        state          TEXT NOT NULL DEFAULT 'new',
        due            TEXT NOT NULL,
        stability      REAL NOT NULL DEFAULT 0,
        difficulty     REAL NOT NULL DEFAULT 0,
        elapsed_days   INTEGER NOT NULL DEFAULT 0,
        scheduled_days INTEGER NOT NULL DEFAULT 0,
        reps           INTEGER NOT NULL DEFAULT 0,
        lapses         INTEGER NOT NULL DEFAULT 0,
        last_review    TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_note_id ON cards(note_id);
    CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
    CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);

    CREATE TABLE IF NOT EXISTS reviews (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL,
        card_id            TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rating             TEXT NOT NULL,
        review_time        TEXT NOT NULL,
        review_duration_ms INTEGER,
        state_before       TEXT NOT NULL,
        stability_before   REAL NOT NULL,
        difficulty_before  REAL NOT NULL,
        state_after        TEXT NOT NULL,
        stability_after    REAL NOT NULL,
        difficulty_after   REAL NOT NULL,
        scheduled_days     INTEGER NOT NULL,
        session_id         TEXT,
        deck_id            TEXT,
        review_index       INTEGER,
        created_at         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_review_time ON reviews(review_time);
    CREATE INDEX IF NOT EXISTS idx_reviews_session_id ON reviews(session_id);

    CREATE TABLE IF NOT EXISTS deck_sessions (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        deck_id      TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        status       TEXT NOT NULL DEFAULT 'in_progress',
        started_at   TEXT NOT NULL,
        completed_at TEXT,
        created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deck_sessions_user_id ON deck_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_deck_sessions_deck_id ON deck_sessions(deck_id);

    CREATE TABLE IF NOT EXISTS card_drafts (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        front      TEXT NOT NULL,
        back       TEXT NOT NULL,
        source     TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_drafts_user_id ON card_drafts(user_id);

    CREATE TABLE IF NOT EXISTS user_profiles (
        id               TEXT PRIMARY KEY,
        first_name       TEXT,
        last_name        TEXT,
        role             TEXT,
        medical_school   TEXT,
        degree_track     TEXT,
        exam             TEXT,
        target_date      TEXT,
        language         TEXT NOT NULL DEFAULT 'en',
        avatar_url       TEXT,
        location         TEXT,
        theme_preference TEXT NOT NULL DEFAULT 'system',
        flip_animation   INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    `,
    // Migration 003 — note enhancements: anki_id, anki_guid
    `
    ALTER TABLE notes ADD COLUMN anki_id INTEGER;
    ALTER TABLE notes ADD COLUMN anki_guid TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_anki_guid ON notes(anki_guid) WHERE anki_guid IS NOT NULL;
    `,
    // Migration 004 — note_type enhancements: anki_id
    `
    ALTER TABLE note_types ADD COLUMN anki_id INTEGER;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_note_types_anki_id ON note_types(user_id, anki_id) WHERE anki_id IS NOT NULL;
    `,
    // Migration 005 — card enhancements: anki_id, ease_factor
    `
    ALTER TABLE cards ADD COLUMN anki_id INTEGER;
    ALTER TABLE cards ADD COLUMN ease_factor INTEGER;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_anki_id ON cards(user_id, anki_id) WHERE anki_id IS NOT NULL;
    `,
    // Migration 006 — review enhancements: interval_before, ease_factor_after, review_type
    `
    ALTER TABLE reviews ADD COLUMN interval_before INTEGER;
    ALTER TABLE reviews ADD COLUMN ease_factor_after INTEGER;
    ALTER TABLE reviews ADD COLUMN review_type INTEGER;
    `,
    // Migration 007 — media table for .apkg imported files
    `
    CREATE TABLE IF NOT EXISTS media (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        filename   TEXT NOT NULL,
        file_path  TEXT NOT NULL,
        file_hash  TEXT NOT NULL,
        file_size  INTEGER,
        mime_type  TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_user_filename ON media(user_id, filename);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_user_file_hash ON media(user_id, file_hash);
    `,
    // Migration 008 — media import_id for batch tracking and cleanup
    `
    ALTER TABLE media ADD COLUMN import_id TEXT;
    `,
    // Migration 009 — anki_meta JSON columns for full Anki round-trip fidelity
    `
    ALTER TABLE note_types ADD COLUMN anki_meta TEXT;
    ALTER TABLE notes      ADD COLUMN anki_meta TEXT;
    ALTER TABLE cards      ADD COLUMN anki_meta TEXT;
    ALTER TABLE decks      ADD COLUMN anki_meta TEXT;
    `,
    // Migration 010 — time_travel_log for tracking redistribution events
    `
    CREATE TABLE IF NOT EXISTS time_travel_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        triggered_at TEXT NOT NULL,
        overdue_count INTEGER NOT NULL,
        window_days INTEGER NOT NULL,
        daily_target INTEGER NOT NULL
    );
    `,
];
