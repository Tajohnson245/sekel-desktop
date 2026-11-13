-- SEKEL-157: the sync API (docs/features/desktop/in-progress/supabase-sync.md).
--
-- Devices only call these functions; they never write the synced tables
-- directly. All run as the caller (SECURITY INVOKER), so RLS confines every
-- read and write to the signed-in user's rows.
--
--   sync_hello_v1()                       is sync enabled for me + server clock + my cursor
--   sync_push_v1(device, changes, force)  apply a batch of a device's changes
--   sync_pull_v1(since, limit, skip)      my rows changed after a cursor
--   sync_prune_v1(before_seq)             tombstone my rows not re-pushed since a
--                                         cursor (after restoring a backup)
--
-- Conflicts: last writer wins on client_changed_at (capped at server time +
-- 5 minutes, so a fast clock can't win forever). A push or prune holds a
-- per-user advisory lock, so a user's server_seq values commit in order and
-- a pull cursor never skips a row. Versioned names: change the shape of a
-- call by adding _v2, never by editing a released function.

-- Highest server_seq among a user's rows (0 when none). Reads through RLS,
-- so a caller only ever sees their own maximum.
create function public.sync_user_max_seq(p_user_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
    select coalesce(greatest(
        (select max(server_seq) from public.note_types where user_id = p_user_id),
        (select max(server_seq) from public.decks where user_id = p_user_id),
        (select max(server_seq) from public.notes where user_id = p_user_id),
        (select max(server_seq) from public.cards where user_id = p_user_id),
        (select max(server_seq) from public.deck_sessions where user_id = p_user_id),
        (select max(server_seq) from public.reviews where user_id = p_user_id),
        (select max(server_seq) from public.card_drafts where user_id = p_user_id),
        (select max(server_seq) from public.media where user_id = p_user_id),
        (select max(server_seq) from public.plans where user_id = p_user_id),
        (select max(server_seq) from public.user_exam_profiles where user_id = p_user_id),
        (select max(server_seq) from public.card_classifications where user_id = p_user_id),
        (select max(server_seq) from public.time_travel_log where user_id = p_user_id)
    ), 0);
$$;

create function public.sync_hello_v1()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_cfg jsonb;
begin
    if v_uid is null then
        raise exception 'sync: not signed in' using errcode = '28000';
    end if;
    select value into v_cfg from public.app_config where key = 'sync';
    return jsonb_build_object(
        'enabled', coalesce((v_cfg->>'enabled')::boolean, false)
                   or coalesce(v_cfg->'allow_users' ? v_uid::text, false),
        'server_time', now(),
        'max_seq', public.sync_user_max_seq(v_uid),
        'version', 1
    );
end;
$$;

-- p_changes is json, not jsonb: jsonb would reorder object keys, and note
-- fields are order-sensitive (first-field fallbacks). Shape:
-- {
--   "deletes": { "<table>": [{ "id": uuid, "at": ts }], "user_exam_profiles": [{ "exam_key", "at" }] },
--   "upserts": { "<table>": [row with client_changed_at],
--                "card_classifications": [{ "card_id", "exam_key", "at", "rows": [...] }] }
-- }
-- p_force: apply even when the server's copy is newer (restoring a backup).
create function public.sync_push_v1(p_device uuid, p_changes json, p_force boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_max timestamptz := now() + interval '5 minutes';
    v_n bigint;
    v_upserted bigint := 0;
    v_deleted bigint := 0;
begin
    if v_uid is null then
        raise exception 'sync: not signed in' using errcode = '28000';
    end if;
    if p_device is null then
        raise exception 'sync: device id required' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('sekel-sync:' || v_uid::text, 0));

    -- ── Tombstones ──────────────────────────────────────────────────────────
    update public.note_types t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'note_types', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.decks t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'decks', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.notes t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'notes', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.cards t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'cards', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.deck_sessions t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'deck_sessions', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.reviews t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'reviews', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.card_drafts t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'card_drafts', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.media t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'media', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.plans t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'plans', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.time_travel_log t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'time_travel_log', '[]'::json)) as d(id uuid, at timestamptz)
     where t.id = d.id and t.user_id = v_uid
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    update public.user_exam_profiles t
       set deleted_at = least(d.at, v_max), client_changed_at = least(d.at, v_max), origin_device = p_device
      from json_to_recordset(coalesce(p_changes->'deletes'->'user_exam_profiles', '[]'::json)) as d(exam_key text, at timestamptz)
     where t.user_id = v_uid and t.exam_key = d.exam_key
       and (p_force or t.client_changed_at <= least(d.at, v_max));
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    -- ── Upserts (parents before children; FKs are deferred to commit) ──────
    insert into public.note_types as t (id, user_id, name, fields, card_templates, created_at, updated_at, anki_id, anki_meta, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.name, r.fields, r.card_templates, r.created_at, r.updated_at, r.anki_id, r.anki_meta, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.note_types, coalesce(p_changes->'upserts'->'note_types', '[]'::json)) r
    on conflict (id) do update set
        name = excluded.name,
        fields = excluded.fields,
        card_templates = excluded.card_templates,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        anki_id = excluded.anki_id,
        anki_meta = excluded.anki_meta,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.decks as t (id, user_id, name, description, created_at, updated_at, algorithm, parent_id, anki_id, anki_meta, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.name, r.description, r.created_at, r.updated_at, r.algorithm, r.parent_id, r.anki_id, r.anki_meta, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.decks, coalesce(p_changes->'upserts'->'decks', '[]'::json)) r
    on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        algorithm = excluded.algorithm,
        parent_id = excluded.parent_id,
        anki_id = excluded.anki_id,
        anki_meta = excluded.anki_meta,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.notes as t (id, user_id, deck_id, note_type_id, fields, tags, created_at, updated_at, anki_id, anki_guid, anki_meta, format, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.deck_id, r.note_type_id, r.fields, r.tags, r.created_at, r.updated_at, r.anki_id, r.anki_guid, r.anki_meta, r.format, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.notes, coalesce(p_changes->'upserts'->'notes', '[]'::json)) r
    on conflict (id) do update set
        deck_id = excluded.deck_id,
        note_type_id = excluded.note_type_id,
        fields = excluded.fields,
        tags = excluded.tags,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        anki_id = excluded.anki_id,
        anki_guid = excluded.anki_guid,
        anki_meta = excluded.anki_meta,
        format = excluded.format,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.cards as t (id, user_id, note_id, template_index, state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review, created_at, updated_at, anki_id, ease_factor, anki_meta, learning_steps, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.note_id, r.template_index, r.state, r.due, r.stability, r.difficulty, r.elapsed_days, r.scheduled_days, r.reps, r.lapses, r.last_review, r.created_at, r.updated_at, r.anki_id, r.ease_factor, r.anki_meta, r.learning_steps, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.cards, coalesce(p_changes->'upserts'->'cards', '[]'::json)) r
    on conflict (id) do update set
        note_id = excluded.note_id,
        template_index = excluded.template_index,
        state = excluded.state,
        due = excluded.due,
        stability = excluded.stability,
        difficulty = excluded.difficulty,
        elapsed_days = excluded.elapsed_days,
        scheduled_days = excluded.scheduled_days,
        reps = excluded.reps,
        lapses = excluded.lapses,
        last_review = excluded.last_review,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        anki_id = excluded.anki_id,
        ease_factor = excluded.ease_factor,
        anki_meta = excluded.anki_meta,
        learning_steps = excluded.learning_steps,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.deck_sessions as t (id, user_id, deck_id, status, started_at, completed_at, created_at, kind, scope, system_keys, updated_at, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.deck_id, r.status, r.started_at, r.completed_at, r.created_at, r.kind, r.scope, r.system_keys, r.updated_at, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.deck_sessions, coalesce(p_changes->'upserts'->'deck_sessions', '[]'::json)) r
    on conflict (id) do update set
        deck_id = excluded.deck_id,
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        created_at = excluded.created_at,
        kind = excluded.kind,
        scope = excluded.scope,
        system_keys = excluded.system_keys,
        updated_at = excluded.updated_at,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.reviews as t (id, user_id, card_id, rating, review_time, review_duration_ms, state_before, stability_before, difficulty_before, state_after, stability_after, difficulty_after, scheduled_days, session_id, deck_id, review_index, created_at, interval_before, ease_factor_after, review_type, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.card_id, r.rating, r.review_time, r.review_duration_ms, r.state_before, r.stability_before, r.difficulty_before, r.state_after, r.stability_after, r.difficulty_after, r.scheduled_days, r.session_id, r.deck_id, r.review_index, r.created_at, r.interval_before, r.ease_factor_after, r.review_type, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.reviews, coalesce(p_changes->'upserts'->'reviews', '[]'::json)) r
    on conflict (id) do update set
        card_id = excluded.card_id,
        rating = excluded.rating,
        review_time = excluded.review_time,
        review_duration_ms = excluded.review_duration_ms,
        state_before = excluded.state_before,
        stability_before = excluded.stability_before,
        difficulty_before = excluded.difficulty_before,
        state_after = excluded.state_after,
        stability_after = excluded.stability_after,
        difficulty_after = excluded.difficulty_after,
        scheduled_days = excluded.scheduled_days,
        session_id = excluded.session_id,
        deck_id = excluded.deck_id,
        review_index = excluded.review_index,
        created_at = excluded.created_at,
        interval_before = excluded.interval_before,
        ease_factor_after = excluded.ease_factor_after,
        review_type = excluded.review_type,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.card_drafts as t (id, user_id, front, back, source, created_at, updated_at, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.front, r.back, r.source, r.created_at, r.updated_at, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.card_drafts, coalesce(p_changes->'upserts'->'card_drafts', '[]'::json)) r
    on conflict (id) do update set
        front = excluded.front,
        back = excluded.back,
        source = excluded.source,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.media as t (id, user_id, filename, file_hash, file_size, mime_type, created_at, storage_path, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.filename, r.file_hash, r.file_size, r.mime_type, r.created_at, r.storage_path, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.media, coalesce(p_changes->'upserts'->'media', '[]'::json)) r
    on conflict (id) do update set
        filename = excluded.filename,
        file_hash = excluded.file_hash,
        file_size = excluded.file_size,
        mime_type = excluded.mime_type,
        created_at = excluded.created_at,
        storage_path = excluded.storage_path,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.plans as t (id, user_id, exam_key, name, cards_per_day, suggested_per_day, snapshot, status, activated_at, created_at, updated_at, deck_filter, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.exam_key, r.name, r.cards_per_day, r.suggested_per_day, r.snapshot, r.status, r.activated_at, r.created_at, r.updated_at, r.deck_filter, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.plans, coalesce(p_changes->'upserts'->'plans', '[]'::json)) r
    on conflict (id) do update set
        exam_key = excluded.exam_key,
        name = excluded.name,
        cards_per_day = excluded.cards_per_day,
        suggested_per_day = excluded.suggested_per_day,
        snapshot = excluded.snapshot,
        status = excluded.status,
        activated_at = excluded.activated_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deck_filter = excluded.deck_filter,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.time_travel_log as t (id, user_id, triggered_at, overdue_count, window_days, daily_target, client_changed_at, deleted_at, origin_device)
    select r.id, v_uid, r.triggered_at, r.overdue_count, r.window_days, r.daily_target, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.time_travel_log, coalesce(p_changes->'upserts'->'time_travel_log', '[]'::json)) r
    on conflict (id) do update set
        triggered_at = excluded.triggered_at,
        overdue_count = excluded.overdue_count,
        window_days = excluded.window_days,
        daily_target = excluded.daily_target,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    insert into public.user_exam_profiles as t (user_id, exam_key, exam_date, is_primary, session_mode, created_at, updated_at, last_notified_threshold, client_changed_at, deleted_at, origin_device)
    select v_uid, r.exam_key, r.exam_date, r.is_primary, r.session_mode, r.created_at, r.updated_at, r.last_notified_threshold, least(r.client_changed_at, v_max), null, p_device
      from json_populate_recordset(null::public.user_exam_profiles, coalesce(p_changes->'upserts'->'user_exam_profiles', '[]'::json)) r
    on conflict (user_id, exam_key) do update set
        exam_date = excluded.exam_date,
        is_primary = excluded.is_primary,
        session_mode = excluded.session_mode,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_notified_threshold = excluded.last_notified_threshold,
        client_changed_at = excluded.client_changed_at,
        deleted_at = excluded.deleted_at,
        origin_device = excluded.origin_device
     where p_force or t.client_changed_at <= excluded.client_changed_at;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    -- Classifications sync per (card, exam) as a set, because classifying a
    -- card replaces its whole set. A set newer than every server row of that
    -- (card, exam) wins: rows it drops are tombstoned, rows it has upserted.
    with sets as (
        select s.card_id, s.exam_key, least(s.at, v_max) as at, coalesce(s.rows, '[]'::json) as rows
          from json_to_recordset(coalesce(p_changes->'upserts'->'card_classifications', '[]'::json))
               as s(card_id uuid, exam_key text, at timestamptz, rows json)
    ), fresh as (
        select * from sets s
         where p_force or not exists (
             select 1 from public.card_classifications c
              where c.user_id = v_uid and c.card_id = s.card_id and c.exam_key = s.exam_key
                and c.client_changed_at > s.at)
    )
    update public.card_classifications c
       set deleted_at = f.at, client_changed_at = f.at, origin_device = p_device
      from fresh f
     where c.user_id = v_uid and c.card_id = f.card_id and c.exam_key = f.exam_key and c.deleted_at is null
       and not exists (
           select 1 from json_to_recordset(f.rows) as r(system_key text)
            where r.system_key is not distinct from c.system_key);
    get diagnostics v_n = row_count; v_deleted := v_deleted + v_n;

    with sets as (
        select s.card_id, s.exam_key, least(s.at, v_max) as at, coalesce(s.rows, '[]'::json) as rows
          from json_to_recordset(coalesce(p_changes->'upserts'->'card_classifications', '[]'::json))
               as s(card_id uuid, exam_key text, at timestamptz, rows json)
    ), fresh as (
        select * from sets s
         where p_force or not exists (
             select 1 from public.card_classifications c
              where c.user_id = v_uid and c.card_id = s.card_id and c.exam_key = s.exam_key
                and c.client_changed_at > s.at)
    )
    insert into public.card_classifications as t (user_id, card_id, exam_key, system_key, topic_key, confidence, split_weight, classified_at, model_version, client_changed_at, deleted_at, origin_device)
    select v_uid, f.card_id, f.exam_key, r.system_key, r.topic_key, r.confidence, r.split_weight, r.classified_at, r.model_version, f.at, null, p_device
      from fresh f
      cross join lateral json_to_recordset(f.rows)
           as r(system_key text, topic_key text, confidence double precision, split_weight double precision, classified_at timestamptz, model_version text)
    on conflict (card_id, exam_key, system_key) do update set
        topic_key = excluded.topic_key,
        confidence = excluded.confidence,
        split_weight = excluded.split_weight,
        classified_at = excluded.classified_at,
        model_version = excluded.model_version,
        client_changed_at = excluded.client_changed_at,
        deleted_at = null,
        origin_device = excluded.origin_device;
    get diagnostics v_n = row_count; v_upserted := v_upserted + v_n;

    -- ── Losing changes re-send the winner ───────────────────────────────────
    -- A change older than the server's copy leaves the row as it is but
    -- re-stamps it (new server_seq, origin_device cleared), so every device
    -- pulls the winning version again — including this one, which may have
    -- skipped that version while its own edit was still waiting to be pushed.
    update public.note_types t set origin_device = null
      from json_populate_recordset(null::public.note_types, coalesce(p_changes->'upserts'->'note_types', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.note_types t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'note_types', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.decks t set origin_device = null
      from json_populate_recordset(null::public.decks, coalesce(p_changes->'upserts'->'decks', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.decks t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'decks', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.notes t set origin_device = null
      from json_populate_recordset(null::public.notes, coalesce(p_changes->'upserts'->'notes', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.notes t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'notes', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.cards t set origin_device = null
      from json_populate_recordset(null::public.cards, coalesce(p_changes->'upserts'->'cards', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.cards t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'cards', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.deck_sessions t set origin_device = null
      from json_populate_recordset(null::public.deck_sessions, coalesce(p_changes->'upserts'->'deck_sessions', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.deck_sessions t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'deck_sessions', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.reviews t set origin_device = null
      from json_populate_recordset(null::public.reviews, coalesce(p_changes->'upserts'->'reviews', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.reviews t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'reviews', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.card_drafts t set origin_device = null
      from json_populate_recordset(null::public.card_drafts, coalesce(p_changes->'upserts'->'card_drafts', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.card_drafts t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'card_drafts', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.media t set origin_device = null
      from json_populate_recordset(null::public.media, coalesce(p_changes->'upserts'->'media', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.media t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'media', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.plans t set origin_device = null
      from json_populate_recordset(null::public.plans, coalesce(p_changes->'upserts'->'plans', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.plans t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'plans', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.time_travel_log t set origin_device = null
      from json_populate_recordset(null::public.time_travel_log, coalesce(p_changes->'upserts'->'time_travel_log', '[]'::json)) r
     where not p_force and t.id = r.id and t.user_id = v_uid and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.time_travel_log t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'time_travel_log', '[]'::json)) as d(id uuid, at timestamptz)
     where not p_force and t.id = d.id and t.user_id = v_uid and t.client_changed_at > least(d.at, v_max);

    update public.user_exam_profiles t set origin_device = null
      from json_populate_recordset(null::public.user_exam_profiles, coalesce(p_changes->'upserts'->'user_exam_profiles', '[]'::json)) r
     where not p_force and t.user_id = v_uid and t.exam_key = r.exam_key and t.client_changed_at > least(r.client_changed_at, v_max);
    update public.user_exam_profiles t set origin_device = null
      from json_to_recordset(coalesce(p_changes->'deletes'->'user_exam_profiles', '[]'::json)) as d(exam_key text, at timestamptz)
     where not p_force and t.user_id = v_uid and t.exam_key = d.exam_key and t.client_changed_at > least(d.at, v_max);

    with sets as (
        select s.card_id, s.exam_key, least(s.at, v_max) as at
          from json_to_recordset(coalesce(p_changes->'upserts'->'card_classifications', '[]'::json))
               as s(card_id uuid, exam_key text, at timestamptz)
    )
    update public.card_classifications c set origin_device = null
      from sets s
     where not p_force and c.user_id = v_uid and c.card_id = s.card_id and c.exam_key = s.exam_key
       and exists (
           select 1 from public.card_classifications c2
            where c2.user_id = v_uid and c2.card_id = s.card_id and c2.exam_key = s.exam_key
              and c2.client_changed_at > s.at);

    return jsonb_build_object('upserted', v_upserted, 'deleted', v_deleted, 'max_seq', public.sync_user_max_seq(v_uid));
end;
$$;

-- The caller's rows changed after p_since, oldest first. Rows last written
-- by p_skip_device come back without their data (the device already has
-- them) but still advance the cursor.
create function public.sync_pull_v1(p_since bigint, p_limit integer default 500, p_skip_device uuid default null)
returns json
language plpgsql
stable
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
    v_changes json;
    v_next bigint;
    v_count integer;
begin
    if v_uid is null then
        raise exception 'sync: not signed in' using errcode = '28000';
    end if;
    with merged as (
        (select 'note_types'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.note_types x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'decks'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.decks x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'notes'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.notes x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'cards'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.cards x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'deck_sessions'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.deck_sessions x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'reviews'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.reviews x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'card_drafts'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.card_drafts x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'media'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.media x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'plans'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.plans x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'user_exam_profiles'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.user_exam_profiles x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'card_classifications'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.card_classifications x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
        union all
        (select 'time_travel_log'::text as t, x.server_seq as seq, x.origin_device as dev, to_json(x) as row
           from public.time_travel_log x
          where x.user_id = v_uid and x.server_seq > p_since
          order by x.server_seq limit v_limit)
    ), page as (
        select * from merged order by seq limit v_limit
    )
    select coalesce(json_agg(json_build_object(
               't', t, 'seq', seq,
               'row', case when p_skip_device is not null and dev = p_skip_device then null else row end
           ) order by seq), '[]'::json),
           max(seq),
           count(*)
      into v_changes, v_next, v_count
      from page;
    return json_build_object('changes', v_changes, 'next', coalesce(v_next, p_since), 'more', v_count = v_limit);
end;
$$;

-- After a device restores a backup it re-pushes everything it has (forced),
-- then calls this with the cursor from before that push: every row of the
-- user's that wasn't re-pushed is tombstoned, so the cloud matches the
-- restored library on every device.
create function public.sync_prune_v1(p_before_seq bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_n bigint;
    v_pruned bigint := 0;
begin
    if v_uid is null then
        raise exception 'sync: not signed in' using errcode = '28000';
    end if;
    if p_before_seq is null then
        raise exception 'sync: cursor required' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('sekel-sync:' || v_uid::text, 0));
    update public.note_types set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.decks set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.notes set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.cards set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.deck_sessions set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.reviews set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.card_drafts set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.media set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.plans set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.user_exam_profiles set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.card_classifications set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    update public.time_travel_log set deleted_at = now(), client_changed_at = now(), origin_device = null
     where user_id = v_uid and deleted_at is null and server_seq <= p_before_seq;
    get diagnostics v_n = row_count; v_pruned := v_pruned + v_n;
    return jsonb_build_object('pruned', v_pruned, 'max_seq', public.sync_user_max_seq(v_uid));
end;
$$;

revoke execute on function public.sync_user_max_seq(uuid) from public, anon;
revoke execute on function public.sync_hello_v1() from public, anon;
revoke execute on function public.sync_push_v1(uuid, json, boolean) from public, anon;
revoke execute on function public.sync_pull_v1(bigint, integer, uuid) from public, anon;
revoke execute on function public.sync_prune_v1(bigint) from public, anon;
grant execute on function public.sync_user_max_seq(uuid) to authenticated, service_role;
grant execute on function public.sync_hello_v1() to authenticated;
grant execute on function public.sync_push_v1(uuid, json, boolean) to authenticated;
grant execute on function public.sync_pull_v1(bigint, integer, uuid) to authenticated;
grant execute on function public.sync_prune_v1(bigint) to authenticated;

-- ── Admin dashboard aggregates, now over the synced tables ──────────────────
-- Same signatures as 20261110130100 except admin_user_stats, which adds
-- last_sync_at. Deleted (tombstoned) rows don't count.

drop function public.admin_user_stats();
create function public.admin_user_stats()
returns table (
    user_id        uuid,
    deck_count     bigint,
    card_count     bigint,
    review_count   bigint,
    last_review_at timestamptz,
    last_sync_at   timestamptz
)
language sql
stable
set search_path = ''
as $$
    with d as (select user_id, count(*) as n from public.decks where deleted_at is null group by user_id),
         c as (select user_id, count(*) as n from public.cards where deleted_at is null group by user_id),
         r as (select user_id, count(*) as n, max(review_time) as last_at
                 from public.reviews where deleted_at is null group by user_id),
         s as (select user_id, max(at) as at from (
                   select user_id, max(server_updated_at) as at from public.note_types group by user_id
                   union all select user_id, max(server_updated_at) from public.decks group by user_id
                   union all select user_id, max(server_updated_at) from public.notes group by user_id
                   union all select user_id, max(server_updated_at) from public.cards group by user_id
                   union all select user_id, max(server_updated_at) from public.reviews group by user_id
                   union all select user_id, max(server_updated_at) from public.deck_sessions group by user_id
                   union all select user_id, max(server_updated_at) from public.plans group by user_id
               ) x group by user_id)
    select p.id, coalesce(d.n, 0), coalesce(c.n, 0), coalesce(r.n, 0), r.last_at, s.at
    from public.user_profiles p
    left join d on d.user_id = p.id
    left join c on c.user_id = p.id
    left join r on r.user_id = p.id
    left join s on s.user_id = p.id;
$$;

create or replace function public.admin_review_activity(p_since timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select jsonb_build_object(
        'reviewsByDay', coalesce((
            select jsonb_agg(jsonb_build_object('date', to_char(day::timestamp, 'YYYY-MM-DD'), 'count', n) order by day)
            from (
                select (review_time at time zone 'utc')::date as day, count(*) as n
                from public.reviews
                where review_time >= p_since and deleted_at is null
                group by 1
            ) per_day
        ), '[]'::jsonb),
        'activeToday', (
            select count(distinct user_id) from public.reviews
            where review_time >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
              and deleted_at is null
        ),
        'activeLast7Days', (
            select count(distinct user_id) from public.reviews
            where review_time >= now() - interval '7 days' and deleted_at is null
        ),
        'activeLast30Days', (
            select count(distinct user_id) from public.reviews
            where review_time >= p_since and deleted_at is null
        )
    );
$$;

create or replace function public.admin_user_review_days(p_user_id uuid, p_since timestamptz)
returns table (day date, total bigint, correct bigint)
language sql
stable
set search_path = ''
as $$
    select (review_time at time zone 'utc')::date as day,
           count(*) as total,
           count(*) filter (where rating <> 'again') as correct
    from public.reviews
    where user_id = p_user_id and review_time >= p_since and deleted_at is null
    group by 1
    order by 1;
$$;

create or replace function public.admin_deck_card_counts(p_user_id uuid)
returns table (deck_id uuid, card_count bigint)
language sql
stable
set search_path = ''
as $$
    select n.deck_id, count(*)
    from public.cards c
    join public.notes n on n.id = c.note_id
    where c.user_id = p_user_id and c.deleted_at is null and n.deleted_at is null
    group by n.deck_id;
$$;

revoke execute on function public.admin_user_stats() from public, anon, authenticated;
grant execute on function public.admin_user_stats() to service_role;
