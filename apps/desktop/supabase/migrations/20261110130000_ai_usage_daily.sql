-- SEKEL-154: per-user daily allowance for the ai-proxy edge function.
--
-- The desktop app used to call OpenAI directly with a key built into every
-- installer. It now calls the ai-proxy edge function, which holds the key and
-- meters each signed-in user here. One row per user per UTC day.
--
-- Only the edge function (service role) reads or writes this table. RLS is on
-- with no policies, and the anon / authenticated grants are removed, so users
-- can't see or reset their own counters.

create table if not exists public.ai_usage_daily (
    user_id           uuid        not null references auth.users(id) on delete cascade,
    usage_date        date        not null,
    request_count     integer     not null default 0,
    prompt_tokens     bigint      not null default 0,
    completion_tokens bigint      not null default 0,
    updated_at        timestamptz not null default now(),
    primary key (user_id, usage_date)
);

comment on table public.ai_usage_daily is
    'Per-user, per-UTC-day OpenAI usage recorded by the ai-proxy edge function. Service role only.';

alter table public.ai_usage_daily enable row level security;
revoke all on table public.ai_usage_daily from public, anon, authenticated;
grant all on table public.ai_usage_daily to service_role;

-- Counts one request against today's allowance, but only while the user is
-- under both limits. Returns allowed = false (and leaves the counters alone)
-- once either limit is reached. Tokens are added afterwards by
-- ai_usage_record(), so a burst of concurrent requests can overshoot the token
-- limit by at most those in-flight requests.
create or replace function public.ai_usage_try_consume(
    p_user_id      uuid,
    p_max_requests integer,
    p_max_tokens   bigint
)
returns table (allowed boolean, request_count integer, total_tokens bigint)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_today date := (now() at time zone 'utc')::date;
    v_row   public.ai_usage_daily;
begin
    if p_max_requests < 1 or p_max_tokens < 1 then
        select * into v_row from public.ai_usage_daily u
        where u.user_id = p_user_id and u.usage_date = v_today;
        return query select false,
            coalesce(v_row.request_count, 0),
            coalesce(v_row.prompt_tokens + v_row.completion_tokens, 0::bigint);
        return;
    end if;

    insert into public.ai_usage_daily as u (user_id, usage_date, request_count)
    values (p_user_id, v_today, 1)
    on conflict (user_id, usage_date) do update
        set request_count = u.request_count + 1,
            updated_at    = now()
        where u.request_count < p_max_requests
          and u.prompt_tokens + u.completion_tokens < p_max_tokens
    returning * into v_row;

    if found then
        return query select true, v_row.request_count, v_row.prompt_tokens + v_row.completion_tokens;
        return;
    end if;

    select * into v_row from public.ai_usage_daily u
    where u.user_id = p_user_id and u.usage_date = v_today;
    return query select false, v_row.request_count, v_row.prompt_tokens + v_row.completion_tokens;
end;
$$;

-- Adds the token usage OpenAI reported for one request.
create or replace function public.ai_usage_record(
    p_user_id           uuid,
    p_prompt_tokens     bigint,
    p_completion_tokens bigint
)
returns void
language sql
set search_path = ''
as $$
    insert into public.ai_usage_daily as u (user_id, usage_date, prompt_tokens, completion_tokens)
    values (
        p_user_id,
        (now() at time zone 'utc')::date,
        greatest(coalesce(p_prompt_tokens, 0), 0),
        greatest(coalesce(p_completion_tokens, 0), 0)
    )
    on conflict (user_id, usage_date) do update
        set prompt_tokens     = u.prompt_tokens + excluded.prompt_tokens,
            completion_tokens = u.completion_tokens + excluded.completion_tokens,
            updated_at        = now();
$$;

revoke execute on function public.ai_usage_try_consume(uuid, integer, bigint) from public, anon, authenticated;
revoke execute on function public.ai_usage_record(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_usage_try_consume(uuid, integer, bigint) to service_role;
grant execute on function public.ai_usage_record(uuid, bigint, bigint) to service_role;
