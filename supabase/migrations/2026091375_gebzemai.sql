-- GebzemAI (stage 7): limits, daily budget and usage metadata for the AI assistant at /gebzemai.
-- Stores ONLY usage metadata (counts, tokens, cost). The conversation text is never stored anywhere.
--
-- a) private.ai_usage (user_id, day, messages, input_tokens, output_tokens, cost_micro_usd): per user per Istanbul day.
--    private.ai_usage_daily (day, ...): the global daily total (survives account deletion).
--    private.ai_turns: one row per turn, for the per-minute limit and to finish a turn exactly once (kept 3 days).
-- b) public.ai_begin_turn(): authenticated only. Under one advisory lock: checks ai_enabled, bans, the per-user
--    limits (app_settings ai_daily_messages, default 20; ai_per_minute, default 5) and the global daily budget
--    (ai_daily_budget_usd, default 5; reserved turns count with an estimate), then reserves the turn.
-- c) public.ai_finish_turn(p_turn, p_input, p_output, ...): service_role only. Called by the public app's route
--    handler (server, service-role key) so users can never under-report their usage. Finishes a reserved turn once;
--    an upstream error with no output gives the message back.
-- d) public.ai_status(): authenticated, read-only remaining / limit state for the page.
-- e) public.admin_ai_usage(p_days) and public.admin_set_ai_settings(...): admins only (the admin site has no
--    service-role key). The settings RPC writes only the five ai_* app_settings keys (audited by audit_app_settings).
-- f) private.ai_cleanup() + pg_cron 'gebzem-ai-cleanup' (daily): stale reservations, 3-day turn rows,
--    per-user rows after analytics_retention_days, daily totals after 2 years.
-- g) app_settings seeds: ai_enabled false (the owner switches it on in Admin > GebzemAI once ANTHROPIC_API_KEY is set
--    on the public Vercel project), ai_model claude-haiku-4-5, 20 messages / day, 5 / minute, 5 USD / day.
-- Re-runnable. Model allowlist here and in src/features/ai/server/models.ts must stay the same.


-- a) tables ---------------------------------------------------------------------------------------------------------------
create table if not exists private.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages int not null default 0 check (messages >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  primary key (user_id, day)
);
create index if not exists ai_usage_day_idx on private.ai_usage (day);
comment on table private.ai_usage is
  'GebzemAI usage per user per Istanbul day: counts, tokens and cost only (no conversation text). Written by ai_begin_turn / ai_finish_turn.';

create table if not exists private.ai_usage_daily (
  day date primary key,
  messages int not null default 0 check (messages >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0)
);
comment on table private.ai_usage_daily is 'GebzemAI global daily totals (budget check and admin report). No user ids.';

create table if not exists private.ai_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'reserved' check (status in ('reserved', 'done', 'error', 'aborted', 'lost')),
  model text check (model is null or char_length(model) <= 80),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  tool_calls int not null default 0 check (tool_calls >= 0)
);
create index if not exists ai_turns_user_created_idx on private.ai_turns (user_id, created_at desc);
create index if not exists ai_turns_reserved_idx on private.ai_turns (created_at) where status = 'reserved';
create index if not exists ai_turns_created_idx on private.ai_turns (created_at);
comment on table private.ai_turns is
  'GebzemAI turns (metadata only: status, model, tokens, cost). Per-minute limit + finish-once. Kept 3 days.';

alter table private.ai_usage enable row level security;
alter table private.ai_usage_daily enable row level security;
alter table private.ai_turns enable row level security;
revoke all on table private.ai_usage from public, anon, authenticated;
revoke all on table private.ai_usage_daily from public, anon, authenticated;
revoke all on table private.ai_turns from public, anon, authenticated;


-- helpers -------------------------------------------------------------------------------------------------------------------
-- Numeric app setting (jsonb number or numeric string), else the default.
create or replace function private.ai_setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric
      when jsonb_typeof(s.value) = 'string' and btrim(s.value #>> '{}') ~ '^\d{1,7}(\.\d{1,4})?$' then btrim(s.value #>> '{}')::numeric
    end
      from public.app_settings s
     where s.key = p_key), p_default)
$$;

create or replace function private.ai_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value = 'true'::jsonb from public.app_settings s where s.key = 'ai_enabled'), false)
$$;

-- Keep this list equal to AI_MODELS in src/features/ai/server/models.ts.
create or replace function private.ai_model()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.value #>> '{}' from public.app_settings s
     where s.key = 'ai_model' and jsonb_typeof(s.value) = 'string'
       and (s.value #>> '{}') in ('claude-haiku-4-5', 'claude-sonnet-5')), 'claude-haiku-4-5')
$$;

-- Budget reservation per unfinished turn and the charge for a turn that never finished: 0.02 USD.
create or replace function private.ai_turn_estimate()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 20000::bigint
$$;

-- Effective limits (clamped like the admin form).
create or replace function private.ai_limits()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', greatest(1, least(500, round(private.ai_setting_num('ai_daily_messages', 20))))::int,
    'minute', greatest(1, least(60, round(private.ai_setting_num('ai_per_minute', 5))))::int,
    'budget_micro', (greatest(0, least(1000, private.ai_setting_num('ai_daily_budget_usd', 5))) * 1000000)::bigint)
$$;

-- Reservations older than 10 minutes never finished (the route runs at most 60 s): mark them 'lost' and charge the
-- estimate, so a crashed function cannot hide spend from the budget.
create or replace function private.ai_sweep_stale()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  with lost as (
    update private.ai_turns t
       set status = 'lost', finished_at = now(), cost_micro_usd = private.ai_turn_estimate()
     where t.status = 'reserved' and t.created_at < now() - interval '10 minutes'
    returning t.user_id, t.day, t.cost_micro_usd
  ), per_user as (
    insert into private.ai_usage as u (user_id, day, cost_micro_usd)
    select l.user_id, l.day, sum(l.cost_micro_usd) from lost l group by l.user_id, l.day
    on conflict (user_id, day) do update set cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd
    returning 1
  ), per_day as (
    insert into private.ai_usage_daily as d (day, cost_micro_usd)
    select l.day, sum(l.cost_micro_usd) from lost l group by l.day
    on conflict (day) do update set cost_micro_usd = d.cost_micro_usd + excluded.cost_micro_usd
    returning 1
  )
  select count(*) into v_n from lost;
  return v_n;
end $$;

-- Why may p_uid not start a turn right now? {reason: null | disabled | banned | daily | minute | budget, reset_at,
-- daily_limit, used}. Read-only; ai_begin_turn calls it under its lock.
create or replace function private.ai_check(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_midnight timestamptz := ((v_day + 1)::timestamp at time zone 'Europe/Istanbul');
  v_lim jsonb := private.ai_limits();
  v_daily int := (v_lim ->> 'daily')::int;
  v_minute int := (v_lim ->> 'minute')::int;
  v_budget bigint := (v_lim ->> 'budget_micro')::bigint;
  v_used int;
  v_recent int;
  v_oldest timestamptz;
  v_spent bigint;
  v_pending int;
  v_reason text;
  v_reset timestamptz;
begin
  select u.messages into v_used from private.ai_usage u where u.user_id = p_uid and u.day = v_day;
  v_used := coalesce(v_used, 0);

  if not private.ai_enabled() then
    v_reason := 'disabled';
  elsif private.is_banned(p_uid) then
    v_reason := 'banned';
  elsif v_used >= v_daily then
    v_reason := 'daily';
    v_reset := v_midnight;
  else
    select count(*), min(t.created_at) into v_recent, v_oldest
      from private.ai_turns t
     where t.user_id = p_uid and t.created_at > now() - interval '1 minute';
    if v_recent >= v_minute then
      v_reason := 'minute';
      v_reset := v_oldest + interval '1 minute';
    else
      select coalesce((select d.cost_micro_usd from private.ai_usage_daily d where d.day = v_day), 0) into v_spent;
      select count(*) into v_pending from private.ai_turns t
       where t.status = 'reserved' and t.created_at > now() - interval '10 minutes';
      if v_spent + (v_pending + 1) * private.ai_turn_estimate() > v_budget then
        v_reason := 'budget';
        v_reset := v_midnight;
      end if;
    end if;
  end if;

  return jsonb_build_object('reason', v_reason, 'reset_at', v_reset, 'daily_limit', v_daily, 'used', v_used,
                            'remaining', greatest(0, v_daily - v_used));
end $$;


-- b) ai_begin_turn -------------------------------------------------------------------------------------------------------------
create or replace function public.ai_begin_turn()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_check jsonb;
  v_model text;
  v_turn uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  -- One lock for every begin: per-user limits and the global budget cannot be overshot by parallel calls.
  perform pg_advisory_xact_lock(hashtext('gebzem:ai:begin'));
  perform private.ai_sweep_stale();

  v_check := private.ai_check(v_uid);
  if v_check ->> 'reason' is not null then
    return jsonb_build_object('ok', false, 'reason', v_check ->> 'reason', 'reset_at', v_check -> 'reset_at',
                              'daily_limit', v_check -> 'daily_limit', 'remaining', v_check -> 'remaining');
  end if;

  v_model := private.ai_model();
  insert into private.ai_turns (user_id, day, model) values (v_uid, v_day, v_model) returning id into v_turn;
  insert into private.ai_usage as u (user_id, day, messages) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set messages = u.messages + 1;
  insert into private.ai_usage_daily as d (day, messages) values (v_day, 1)
  on conflict (day) do update set messages = d.messages + 1;

  return jsonb_build_object('ok', true, 'turn_id', v_turn, 'model', v_model,
                            'daily_limit', (v_check ->> 'daily_limit')::int,
                            'remaining', greatest(0, (v_check ->> 'remaining')::int - 1));
end $$;


-- c) ai_finish_turn ------------------------------------------------------------------------------------------------------------
-- p_cost_micro_usd: computed by the server from the model's price; null = conservative estimate (5 / 25 USD per MTok).
-- p_status: 'done' | 'error' | 'aborted'. Returns false when the turn is unknown or already finished.
create or replace function public.ai_finish_turn(
  p_turn uuid,
  p_input int,
  p_output int,
  p_cost_micro_usd bigint default null,
  p_model text default null,
  p_status text default 'done',
  p_tool_calls int default 0)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in int := greatest(0, least(coalesce(p_input, 0), 10000000));
  v_out int := greatest(0, least(coalesce(p_output, 0), 1000000));
  v_status text := case when p_status in ('done', 'error', 'aborted') then p_status else 'done' end;
  v_cost bigint;
  v_refund int := 0;
  v_user uuid;
  v_day date;
begin
  if p_turn is null then
    return false;
  end if;
  v_cost := greatest(0, least(coalesce(p_cost_micro_usd, v_in::bigint * 5 + v_out::bigint * 25), 10000000));

  update private.ai_turns t
     set status = v_status,
         finished_at = now(),
         input_tokens = v_in,
         output_tokens = v_out,
         cost_micro_usd = v_cost,
         tool_calls = greatest(0, least(coalesce(p_tool_calls, 0), 50)),
         model = coalesce(left(nullif(btrim(p_model), ''), 80), t.model)
   where t.id = p_turn and t.status = 'reserved'
  returning t.user_id, t.day into v_user, v_day;
  if not found then
    return false;
  end if;

  -- The user got nothing (upstream failed before any output): the message does not count against the daily limit.
  if v_status = 'error' and v_out = 0 then
    v_refund := 1;
  end if;

  insert into private.ai_usage as u (user_id, day, input_tokens, output_tokens, cost_micro_usd)
  values (v_user, v_day, v_in, v_out, v_cost)
  on conflict (user_id, day) do update
    set input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens,
        cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd,
        messages = greatest(0, u.messages - v_refund);

  insert into private.ai_usage_daily as d (day, input_tokens, output_tokens, cost_micro_usd)
  values (v_day, v_in, v_out, v_cost)
  on conflict (day) do update
    set input_tokens = d.input_tokens + excluded.input_tokens,
        output_tokens = d.output_tokens + excluded.output_tokens,
        cost_micro_usd = d.cost_micro_usd + excluded.cost_micro_usd,
        messages = greatest(0, d.messages - v_refund);

  return true;
end $$;


-- d) ai_status --------------------------------------------------------------------------------------------------------------------
create or replace function public.ai_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_check jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  v_check := private.ai_check(v_uid);
  return jsonb_build_object('ok', v_check ->> 'reason' is null, 'reason', v_check -> 'reason', 'reset_at', v_check -> 'reset_at',
                            'daily_limit', v_check -> 'daily_limit', 'remaining', v_check -> 'remaining');
end $$;


-- e) admin ----------------------------------------------------------------------------------------------------------------------
-- Usage of the last p_days Istanbul days (1-90, newest first, zero-filled) + totals, today's state and the settings.
create or replace function public.admin_ai_usage(p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 7), 90));
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_from date := v_today - (greatest(1, least(coalesce(p_days, 7), 90)) - 1);
  v_lim jsonb := private.ai_limits();
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'from', v_from,
    'to', v_today,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', g.day,
               'messages', coalesce(d.messages, 0),
               'input_tokens', coalesce(d.input_tokens, 0),
               'output_tokens', coalesce(d.output_tokens, 0),
               'cost_micro_usd', coalesce(d.cost_micro_usd, 0),
               'active_users', coalesce(au.n, 0)) order by g.day desc), '[]'::jsonb)
        from (select generate_series(v_from, v_today, interval '1 day')::date as day) g
        left join private.ai_usage_daily d on d.day = g.day
        left join lateral (
          select count(*)::int as n from private.ai_usage u where u.day = g.day and u.messages > 0) au on true),
    'totals', (
      select jsonb_build_object(
               'messages', coalesce(sum(d.messages), 0),
               'input_tokens', coalesce(sum(d.input_tokens), 0),
               'output_tokens', coalesce(sum(d.output_tokens), 0),
               'cost_micro_usd', coalesce(sum(d.cost_micro_usd), 0),
               'active_users', (select count(distinct u.user_id) from private.ai_usage u
                                 where u.day between v_from and v_today and u.messages > 0))
        from private.ai_usage_daily d
       where d.day between v_from and v_today),
    'today', jsonb_build_object(
      'messages', coalesce((select d.messages from private.ai_usage_daily d where d.day = v_today), 0),
      'cost_micro_usd', coalesce((select d.cost_micro_usd from private.ai_usage_daily d where d.day = v_today), 0),
      'pending', (select count(*) from private.ai_turns t where t.status = 'reserved' and t.created_at > now() - interval '10 minutes'),
      'budget_micro_usd', (v_lim ->> 'budget_micro')::bigint),
    -- Turn outcomes of the last 24 hours (errors usually mean a missing / invalid key or an upstream outage).
    'last_24h', (
      select jsonb_build_object(
               'done', count(*) filter (where t.status = 'done'),
               'error', count(*) filter (where t.status = 'error'),
               'aborted', count(*) filter (where t.status = 'aborted'),
               'lost', count(*) filter (where t.status = 'lost'),
               'last_error_at', max(t.created_at) filter (where t.status = 'error'))
        from private.ai_turns t
       where t.created_at > now() - interval '24 hours'),
    'settings', jsonb_build_object(
      'enabled', private.ai_enabled(),
      'model', private.ai_model(),
      'daily_messages', (v_lim ->> 'daily')::int,
      'per_minute', (v_lim ->> 'minute')::int,
      'daily_budget_usd', round((v_lim ->> 'budget_micro')::numeric / 1000000, 2)));
end $$;

-- Writes the five ai_* settings (validated). Unchanged values are not rewritten (no audit noise).
create or replace function public.admin_set_ai_settings(
  p_enabled boolean,
  p_model text,
  p_daily_messages int,
  p_per_minute int,
  p_daily_budget_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  if p_enabled is null then
    raise exception 'GebzemAI için açık ya da kapalı seç.' using hint = 'invalid_value';
  end if;
  if p_model is null or p_model not in ('claude-haiku-4-5', 'claude-sonnet-5') then
    raise exception 'Bu model desteklenmiyor.' using hint = 'invalid_model';
  end if;
  if p_daily_messages is null or p_daily_messages < 1 or p_daily_messages > 500 then
    raise exception 'Günlük soru sınırı 1 ile 500 arasında olmalı.' using hint = 'invalid_value';
  end if;
  if p_per_minute is null or p_per_minute < 1 or p_per_minute > 60 then
    raise exception 'Dakikalık soru sınırı 1 ile 60 arasında olmalı.' using hint = 'invalid_value';
  end if;
  if p_daily_budget_usd is null or p_daily_budget_usd < 0 or p_daily_budget_usd > 1000 then
    raise exception 'Günlük bütçe 0 ile 1000 dolar arasında olmalı.' using hint = 'invalid_value';
  end if;

  insert into public.app_settings as s (key, value, updated_at)
  values ('ai_enabled', to_jsonb(p_enabled), now()),
         ('ai_model', to_jsonb(p_model), now()),
         ('ai_daily_messages', to_jsonb(p_daily_messages), now()),
         ('ai_per_minute', to_jsonb(p_per_minute), now()),
         ('ai_daily_budget_usd', to_jsonb(round(p_daily_budget_usd, 2)), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
   where s.value is distinct from excluded.value;

  return jsonb_build_object('enabled', p_enabled, 'model', p_model, 'daily_messages', p_daily_messages,
                            'per_minute', p_per_minute, 'daily_budget_usd', round(p_daily_budget_usd, 2));
end $$;


-- f) cleanup ----------------------------------------------------------------------------------------------------------------------
create or replace function private.ai_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform private.ai_sweep_stale();
  delete from private.ai_turns where created_at < now() - interval '3 days';
  delete from private.ai_usage where day < v_today - private.app_setting_int('analytics_retention_days', 180);
  delete from private.ai_usage_daily where day < v_today - 730;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-ai-cleanup';
    -- pg_cron runs in GMT: 00:20 UTC = 03:20 Europe/Istanbul.
    perform cron.schedule('gebzem-ai-cleanup', '20 0 * * *', 'select private.ai_cleanup()');
  end if;
end $$;


-- grants ----------------------------------------------------------------------------------------------------------------------------
-- Supabase default privileges grant new functions to anon/authenticated: take them back, then grant exactly.
revoke all on function private.ai_setting_num(text, numeric) from public, anon, authenticated;
revoke all on function private.ai_enabled() from public, anon, authenticated;
revoke all on function private.ai_model() from public, anon, authenticated;
revoke all on function private.ai_turn_estimate() from public, anon, authenticated;
revoke all on function private.ai_limits() from public, anon, authenticated;
revoke all on function private.ai_sweep_stale() from public, anon, authenticated;
revoke all on function private.ai_check(uuid) from public, anon, authenticated;
revoke all on function private.ai_cleanup() from public, anon, authenticated;

revoke all on function public.ai_begin_turn() from public, anon, authenticated;
grant execute on function public.ai_begin_turn() to authenticated;

revoke all on function public.ai_finish_turn(uuid, int, int, bigint, text, text, int) from public, anon, authenticated;
grant execute on function public.ai_finish_turn(uuid, int, int, bigint, text, text, int) to service_role;

revoke all on function public.ai_status() from public, anon, authenticated;
grant execute on function public.ai_status() to authenticated;

revoke all on function public.admin_ai_usage(int) from public, anon, authenticated;
grant execute on function public.admin_ai_usage(int) to authenticated;

revoke all on function public.admin_set_ai_settings(boolean, text, int, int, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_ai_settings(boolean, text, int, int, numeric) to authenticated;


-- g) seeds (kept when the admin already set them) -------------------------------------------------------------------------------------
insert into public.app_settings (key, value, updated_at)
values ('ai_enabled', 'false'::jsonb, now()),
       ('ai_model', '"claude-haiku-4-5"'::jsonb, now()),
       ('ai_daily_messages', '20'::jsonb, now()),
       ('ai_per_minute', '5'::jsonb, now()),
       ('ai_daily_budget_usd', '5'::jsonb, now())
on conflict (key) do nothing;
