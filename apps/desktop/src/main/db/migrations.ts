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
    // Migration 011 — blueprint tables for exam-aware study scheduling
    `
    CREATE TABLE IF NOT EXISTS blueprint_exams (
        id         INTEGER PRIMARY KEY,
        exam_key   TEXT UNIQUE NOT NULL,
        label      TEXT NOT NULL,
        source_url TEXT,
        version    TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blueprint_systems (
        id         INTEGER PRIMARY KEY,
        exam_id    INTEGER NOT NULL REFERENCES blueprint_exams(id),
        system_key TEXT NOT NULL,
        label      TEXT NOT NULL,
        weight_min REAL,
        weight_max REAL,
        UNIQUE(exam_id, system_key)
    );
    CREATE INDEX IF NOT EXISTS idx_blueprint_systems_exam_id ON blueprint_systems(exam_id);

    CREATE TABLE IF NOT EXISTS blueprint_topics (
        id              INTEGER PRIMARY KEY,
        system_id       INTEGER NOT NULL REFERENCES blueprint_systems(id),
        topic_key       TEXT NOT NULL,
        label           TEXT NOT NULL,
        physician_task  TEXT,
        relative_weight REAL,
        UNIQUE(system_id, topic_key)
    );
    CREATE INDEX IF NOT EXISTS idx_blueprint_topics_system_id ON blueprint_topics(system_id);

    CREATE TABLE IF NOT EXISTS card_classifications (
        id            INTEGER PRIMARY KEY,
        card_id       TEXT NOT NULL REFERENCES cards(id),
        exam_id       INTEGER NOT NULL REFERENCES blueprint_exams(id),
        system_id     INTEGER REFERENCES blueprint_systems(id),
        topic_id      INTEGER REFERENCES blueprint_topics(id),
        confidence    REAL,
        split_weight  REAL NOT NULL DEFAULT 1.0,
        classified_at TEXT NOT NULL,
        model_version TEXT,
        UNIQUE(card_id, exam_id, system_id)
    );
    CREATE INDEX IF NOT EXISTS idx_card_classifications_card_id ON card_classifications(card_id);
    CREATE INDEX IF NOT EXISTS idx_card_classifications_exam_id ON card_classifications(exam_id);

    CREATE TABLE IF NOT EXISTS user_exam_profiles (
        id           INTEGER PRIMARY KEY,
        user_id      TEXT NOT NULL,
        exam_id      INTEGER NOT NULL REFERENCES blueprint_exams(id),
        exam_date    TEXT NOT NULL,
        is_primary   INTEGER DEFAULT 1,
        session_mode TEXT NOT NULL DEFAULT 'auto',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_exam_profiles_user_id ON user_exam_profiles(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_exam_profiles_user_exam ON user_exam_profiles(user_id, exam_id);
    `,
    // Migration 012 — add last_notified_threshold to user_exam_profiles
    `
    ALTER TABLE user_exam_profiles ADD COLUMN last_notified_threshold REAL;
    `,
    // Migration 013 — recreate card_classifications with ON DELETE CASCADE on card_id
    // and fix decks.parent_id self-reference to CASCADE
    `
    CREATE TABLE IF NOT EXISTS card_classifications_new (
        id            INTEGER PRIMARY KEY,
        card_id       TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        exam_id       INTEGER NOT NULL REFERENCES blueprint_exams(id),
        system_id     INTEGER REFERENCES blueprint_systems(id),
        topic_id      INTEGER REFERENCES blueprint_topics(id),
        confidence    REAL,
        split_weight  REAL NOT NULL DEFAULT 1.0,
        classified_at TEXT NOT NULL,
        model_version TEXT,
        UNIQUE(card_id, exam_id, system_id)
    );
    INSERT INTO card_classifications_new SELECT * FROM card_classifications;
    DROP TABLE card_classifications;
    ALTER TABLE card_classifications_new RENAME TO card_classifications;
    CREATE INDEX IF NOT EXISTS idx_card_classifications_card_id ON card_classifications(card_id);
    CREATE INDEX IF NOT EXISTS idx_card_classifications_exam_id ON card_classifications(exam_id);
    `,
    // Migration 014 — align blueprint taxonomy with official USMLE Step 1 Content Outline (2025)
    // Restructures 12 placeholder systems into 11 official NBME organ-system categories with
    // correct weight ranges. Merges: respiratory+renal-urinary, reproductive+endocrine.
    // Renames: hematopoietic-lymphoreticular, musculoskeletal-skin-connective, multisystem-general,
    //          biostats-epi, neurology-special-senses, behavioral-social.
    // Creates: human-development. Moves topics across systems accordingly.
    // All statements are no-ops on empty blueprint tables (fresh install handled by seedBlueprints).
    `
    UPDATE blueprint_systems
        SET system_key = 'blood-lymphoreticular-immune',
            label      = 'Blood & Lymphoreticular/Immune Systems',
            weight_min = 9, weight_max = 13
        WHERE system_key = 'hematopoietic-lymphoreticular';

    UPDATE blueprint_systems
        SET system_key = 'musculoskeletal-skin-subcutaneous',
            label      = 'Musculoskeletal, Skin & Subcutaneous Tissue',
            weight_min = 8, weight_max = 12
        WHERE system_key = 'musculoskeletal-skin-connective';

    UPDATE blueprint_systems
        SET system_key = 'multisystem',
            label      = 'Multisystem Processes & Disorders',
            weight_min = 8, weight_max = 12
        WHERE system_key = 'multisystem-general';

    UPDATE blueprint_systems
        SET system_key = 'biostatistics-epidemiology',
            label      = 'Biostatistics & Epidemiology/Population Health',
            weight_min = 4, weight_max = 6
        WHERE system_key = 'biostats-epi';

    UPDATE blueprint_systems SET weight_min = 7, weight_max = 11 WHERE system_key = 'cardiovascular';
    UPDATE blueprint_systems SET weight_min = 6, weight_max = 10 WHERE system_key = 'gastrointestinal';

    UPDATE blueprint_systems
        SET system_key = 'behavioral-health-nervous-special-senses',
            label      = 'Behavioral Health & Nervous Systems/Special Senses',
            weight_min = 10, weight_max = 14
        WHERE system_key = 'neurology-special-senses';

    DELETE FROM card_classifications
        WHERE id IN (
            SELECT cc_old.id FROM card_classifications cc_old
            JOIN blueprint_topics bt ON bt.id = cc_old.topic_id
            JOIN blueprint_systems bs ON bs.id = bt.system_id
            WHERE bt.topic_key IN ('behavioral-science', 'substance-use', 'psychopharmacology')
              AND bs.system_key = 'behavioral-social'
              AND EXISTS (
                SELECT 1 FROM card_classifications cc_new
                WHERE cc_new.card_id = cc_old.card_id
                  AND cc_new.exam_id = cc_old.exam_id
                  AND cc_new.system_id = (
                    SELECT id FROM blueprint_systems
                    WHERE system_key = 'behavioral-health-nervous-special-senses' LIMIT 1
                  )
              )
        );

    UPDATE card_classifications
        SET system_id = (
            SELECT id FROM blueprint_systems
            WHERE system_key = 'behavioral-health-nervous-special-senses' LIMIT 1
        )
        WHERE topic_id IN (
            SELECT bt.id FROM blueprint_topics bt
            JOIN blueprint_systems bs ON bs.id = bt.system_id
            WHERE bt.topic_key IN ('behavioral-science', 'substance-use', 'psychopharmacology')
              AND bs.system_key = 'behavioral-social'
        );

    UPDATE blueprint_topics
        SET system_id = (
            SELECT id FROM blueprint_systems
            WHERE system_key = 'behavioral-health-nervous-special-senses' LIMIT 1
        )
        WHERE topic_key IN ('behavioral-science', 'substance-use', 'psychopharmacology')
          AND system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'behavioral-social' LIMIT 1
          );

    INSERT INTO blueprint_systems (exam_id, system_key, label, weight_min, weight_max)
        SELECT DISTINCT exam_id, 'human-development', 'Human Development & Aging', 1, 3
        FROM blueprint_systems
        WHERE exam_id = (SELECT id FROM blueprint_exams WHERE exam_key = 'step1' LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM blueprint_systems WHERE system_key = 'human-development')
        LIMIT 1;

    UPDATE card_classifications
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'human-development' LIMIT 1
        )
        WHERE topic_id = (
            SELECT bt.id FROM blueprint_topics bt
            JOIN blueprint_systems bs ON bs.id = bt.system_id
            WHERE bt.topic_key = 'development-aging' AND bs.system_key = 'behavioral-social'
            LIMIT 1
        );

    UPDATE blueprint_topics
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'human-development' LIMIT 1
        )
        WHERE topic_key = 'development-aging'
          AND system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'behavioral-social' LIMIT 1
          );

    UPDATE blueprint_topics
        SET label = 'Aging & Geriatrics', relative_weight = 0.30
        WHERE topic_key = 'development-aging'
          AND system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'human-development' LIMIT 1
          );

    INSERT OR IGNORE INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        SELECT id, 'prenatal-development', 'Prenatal Development & Congenital Defects',
               'foundational-science', 0.35
        FROM blueprint_systems WHERE system_key = 'human-development' LIMIT 1;

    INSERT OR IGNORE INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        SELECT id, 'growth-development', 'Postnatal Growth & Development',
               'foundational-science', 0.35
        FROM blueprint_systems WHERE system_key = 'human-development' LIMIT 1;

    UPDATE blueprint_systems
        SET system_key = 'social-sciences',
            label      = 'Social Sciences',
            weight_min = 6, weight_max = 9
        WHERE system_key = 'behavioral-social';

    UPDATE blueprint_topics
        SET relative_weight = 0.35,
            label           = 'Medical Ethics, Legal, & Patient Safety'
        WHERE topic_key = 'ethics-law'
          AND system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'social-sciences' LIMIT 1
          );

    UPDATE blueprint_topics
        SET relative_weight = 0.25,
            label           = 'Communication & Interpersonal Skills'
        WHERE topic_key = 'communication-systems'
          AND system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'social-sciences' LIMIT 1
          );

    INSERT OR IGNORE INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        SELECT id, 'healthcare-policy', 'Healthcare Policy & Systems',
               'health-maintenance', 0.25
        FROM blueprint_systems WHERE system_key = 'social-sciences' LIMIT 1;

    INSERT OR IGNORE INTO blueprint_topics (system_id, topic_key, label, physician_task, relative_weight)
        SELECT id, 'patient-safety', 'Patient Safety & Quality Improvement',
               'health-maintenance', 0.15
        FROM blueprint_systems WHERE system_key = 'social-sciences' LIMIT 1;

    UPDATE blueprint_systems
        SET system_key = 'respiratory-renal-urinary',
            label      = 'Respiratory & Renal/Urinary Systems',
            weight_min = 11, weight_max = 15
        WHERE system_key = 'respiratory';

    DELETE FROM card_classifications
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'renal-urinary' LIMIT 1
          )
          AND EXISTS (
            SELECT 1 FROM card_classifications cc2
            WHERE cc2.card_id = card_classifications.card_id
              AND cc2.exam_id = card_classifications.exam_id
              AND cc2.system_id = (
                SELECT id FROM blueprint_systems WHERE system_key = 'respiratory-renal-urinary' LIMIT 1
              )
          );

    UPDATE card_classifications
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'respiratory-renal-urinary' LIMIT 1
        )
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'renal-urinary' LIMIT 1
        );

    UPDATE blueprint_topics
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'respiratory-renal-urinary' LIMIT 1
        )
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'renal-urinary' LIMIT 1
        );

    DELETE FROM blueprint_systems WHERE system_key = 'renal-urinary';

    UPDATE blueprint_systems
        SET system_key = 'reproductive-endocrine',
            label      = 'Reproductive & Endocrine Systems',
            weight_min = 12, weight_max = 16
        WHERE system_key = 'reproductive';

    DELETE FROM card_classifications
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'endocrine' LIMIT 1
          )
          AND EXISTS (
            SELECT 1 FROM card_classifications cc2
            WHERE cc2.card_id = card_classifications.card_id
              AND cc2.exam_id = card_classifications.exam_id
              AND cc2.system_id = (
                SELECT id FROM blueprint_systems WHERE system_key = 'reproductive-endocrine' LIMIT 1
              )
          );

    UPDATE card_classifications
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'reproductive-endocrine' LIMIT 1
        )
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'endocrine' LIMIT 1
        );

    UPDATE blueprint_topics
        SET system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'reproductive-endocrine' LIMIT 1
        )
        WHERE system_id = (
            SELECT id FROM blueprint_systems WHERE system_key = 'endocrine' LIMIT 1
        );

    DELETE FROM blueprint_systems WHERE system_key = 'endocrine';
    `,
    // Migration 015 — plan mode: daily limit columns and plan state on local user_profiles
    // daily_new_limit / daily_review_limit mirror the Supabase profile values locally so the
    // plan service (main process) can read and temporarily override them without a Supabase call.
    // plan_recommended_new_per_day stores the last computed plan rate for rebalance detection.
    // plan_generated_at is the ISO timestamp when the plan was last computed.
    // plan_override_expires_at is set to tomorrow-midnight when a one-session override is active.
    `
    ALTER TABLE user_profiles ADD COLUMN daily_new_limit INTEGER DEFAULT 20;
    ALTER TABLE user_profiles ADD COLUMN daily_review_limit INTEGER DEFAULT 200;
    ALTER TABLE user_profiles ADD COLUMN plan_recommended_new_per_day INTEGER;
    ALTER TABLE user_profiles ADD COLUMN plan_generated_at TEXT;
    ALTER TABLE user_profiles ADD COLUMN plan_override_expires_at TEXT;
    `,

    // Migration 016 — plans table (multi-plan model)
    // Each plan is an explicit user-committed record with a full PlanResult snapshot.
    // cards_per_day  = the number the user chose to commit to.
    // suggested_per_day = what computePlan recommended at creation time.
    // snapshot       = JSON-serialised PlanResult (the full computed data at commit time).
    // status         = 'active' | 'archived'.
    // activated_at   = when this plan became active (differs from created_at on reactivation).
    `
    CREATE TABLE plans (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        exam_key         TEXT NOT NULL,
        name             TEXT NOT NULL,
        cards_per_day    INTEGER NOT NULL,
        suggested_per_day INTEGER NOT NULL,
        snapshot         TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'active',
        activated_at     TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    );
    CREATE INDEX idx_plans_user_status ON plans(user_id, status);
    CREATE INDEX idx_plans_user_exam   ON plans(user_id, exam_key);
    `,

    // Migration 017 — deck-level scope filter on plans
    // deck_filter stores a JSON array of deck IDs the plan was scoped to.
    // NULL means "all decks" (no filter applied).
    `ALTER TABLE plans ADD COLUMN deck_filter TEXT;`,

    // Migration 018 — add FK constraint on reviews.session_id
    // SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we recreate the table.
    // Orphaned session_id values (pointing at deleted deck_sessions) are set to NULL
    // before the data copy so the new FK constraint is satisfied immediately.
    `
    CREATE TABLE IF NOT EXISTS reviews_new (
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
        session_id         TEXT REFERENCES deck_sessions(id) ON DELETE SET NULL,
        deck_id            TEXT,
        review_index       INTEGER,
        created_at         TEXT NOT NULL,
        interval_before    INTEGER,
        ease_factor_after  INTEGER,
        review_type        INTEGER
    );
    INSERT INTO reviews_new
        SELECT
            id, user_id, card_id, rating, review_time, review_duration_ms,
            state_before, stability_before, difficulty_before,
            state_after, stability_after, difficulty_after,
            scheduled_days,
            CASE WHEN session_id IN (SELECT id FROM deck_sessions) THEN session_id ELSE NULL END,
            deck_id, review_index, created_at,
            interval_before, ease_factor_after, review_type
        FROM reviews;
    DROP TABLE reviews;
    ALTER TABLE reviews_new RENAME TO reviews;
    CREATE INDEX IF NOT EXISTS idx_reviews_user_id    ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_card_id    ON reviews(card_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_review_time ON reviews(review_time);
    CREATE INDEX IF NOT EXISTS idx_reviews_session_id ON reviews(session_id);
    `,
    // Migration 036 — reconcile orphaned active plans
    // Archives any plan still marked active whose owning user has no primary
    // exam profile, or whose exam_key doesn't match the user's current primary
    // exam. Companion JS pass (cleanupOrphanPlanDeckFilters) prunes deleted
    // deck UUIDs from plans.deck_filter at every boot.
    `
    UPDATE plans
       SET status = 'archived',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE status = 'active'
       AND NOT EXISTS (
           SELECT 1 FROM user_exam_profiles uep
           JOIN blueprint_exams be ON be.id = uep.exam_id
           WHERE uep.user_id = plans.user_id
             AND uep.is_primary = 1
             AND be.exam_key = plans.exam_key
       );
    `,
    // Migration — AI card format tracking. Nullable: pre-existing rows and
    // imported Anki notes keep `format` NULL. CHECK constraint omitted on the
    // SQLite side; the IPC validation layer enforces the allowed set.
    `
    ALTER TABLE notes ADD COLUMN format TEXT;
    `,
];
