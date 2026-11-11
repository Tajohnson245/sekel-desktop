-- SEKEL-154: aggregate queries for the admin edge function.
--
-- The admin dashboard used to run in the desktop app with the service-role
-- key built in. It now runs in the `admin` edge function. These functions do
-- the counting in Postgres, which avoids two problems with the old queries:
--   * one round trip per user (4 per user) for the user list, which would hit
--     the edge function time limit as the user count grows;
--   * PostgREST's 1000-row cap silently truncating "reviews in the last 30
--     days" and "cards per deck".
--
-- SECURITY INVOKER: they read with the caller's rights. Only service_role may
-- call them (it bypasses RLS); anon and authenticated can't.

-- Per-user deck / card / review counts and last review time.
create or replace function public.admin_user_stats()
returns table (
    user_id        uuid,
    deck_count     bigint,
    card_count     bigint,
    review_count   bigint,
    last_review_at timestamptz
)
language sql
stable
set search_path = ''
as $$
    with d as (select user_id, count(*) as n from public.decks group by user_id),
         c as (select user_id, count(*) as n from public.cards group by user_id),
         r as (select user_id, count(*) as n, max(review_time) as last_at from public.reviews group by user_id)
    select p.id, coalesce(d.n, 0), coalesce(c.n, 0), coalesce(r.n, 0), r.last_at
    from public.user_profiles p
    left join d on d.user_id = p.id
    left join c on c.user_id = p.id
    left join r on r.user_id = p.id;
$$;

-- Review volume per UTC day since p_since, and distinct active reviewers.
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
                where review_time >= p_since
                group by 1
            ) per_day
        ), '[]'::jsonb),
        'activeToday', (
            select count(distinct user_id) from public.reviews
            where review_time >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
        ),
        'activeLast7Days', (
            select count(distinct user_id) from public.reviews
            where review_time >= now() - interval '7 days'
        ),
        'activeLast30Days', (
            select count(distinct user_id) from public.reviews
            where review_time >= p_since
        )
    );
$$;

-- One user's reviews per UTC day since p_since, with how many weren't "again".
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
    where user_id = p_user_id and review_time >= p_since
    group by 1
    order by 1;
$$;

-- One user's card count per deck.
create or replace function public.admin_deck_card_counts(p_user_id uuid)
returns table (deck_id uuid, card_count bigint)
language sql
stable
set search_path = ''
as $$
    select n.deck_id, count(*)
    from public.cards c
    join public.notes n on n.id = c.note_id
    where c.user_id = p_user_id
    group by n.deck_id;
$$;

revoke execute on function public.admin_user_stats() from public, anon, authenticated;
revoke execute on function public.admin_review_activity(timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_user_review_days(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_deck_card_counts(uuid) from public, anon, authenticated;

grant execute on function public.admin_user_stats() to service_role;
grant execute on function public.admin_review_activity(timestamptz) to service_role;
grant execute on function public.admin_user_review_days(uuid, timestamptz) to service_role;
grant execute on function public.admin_deck_card_counts(uuid) to service_role;
