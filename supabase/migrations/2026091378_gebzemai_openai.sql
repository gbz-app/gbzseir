-- GebzemAI on OpenAI: a provider setting and OpenAI models in the allowlist. Builds on 2026091375_gebzemai.sql.
-- Limits, the daily budget and ai_begin_turn / ai_finish_turn / ai_status are unchanged.
--
-- a) app_settings 'ai_provider' ('openai' | 'anthropic'). Without it the app picks OpenAI when OPENAI_API_KEY is set,
--    else Anthropic. Seeded 'openai' (the owner's key is OpenAI); on that first seed a Claude ai_model becomes
--    gpt-5.4-mini. Re-running keeps whatever the admin chose later.
-- b) private.ai_model_provider(model): the model allowlist (keep equal to AI_MODEL_IDS in src/features/ai/lib/models.ts):
--    OpenAI gpt-5.4-mini (default), gpt-5.4-nano, gpt-4.1-mini, gpt-5.4; Anthropic claude-haiku-4-5 (default),
--    claude-sonnet-5. private.ai_provider(): the stored provider or null. private.ai_model(): the stored model when it
--    belongs to the provider, else that provider's default (ai_begin_turn records it on the turn).
-- c) public.admin_set_ai_settings(..., p_provider): replaces the 5-argument version. p_provider is last with a default
--    (null = the model's provider), so a call without it still works. The model must belong to the provider.
--    Writes the six ai_* keys (audited by audit_app_settings).
-- d) public.admin_ai_usage(p_days): settings also carry 'provider'.
-- Re-runnable.


-- b) allowlist and effective provider / model ------------------------------------------------------------------------------
create or replace function private.ai_model_provider(p_model text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_model in ('gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1-mini', 'gpt-5.4') then 'openai'
    when p_model in ('claude-haiku-4-5', 'claude-sonnet-5') then 'anthropic'
  end
$$;

create or replace function private.ai_default_model(p_provider text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_provider when 'anthropic' then 'claude-haiku-4-5' else 'gpt-5.4-mini' end
$$;

create or replace function private.ai_provider()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (select s.value #>> '{}' from public.app_settings s
           where s.key = 'ai_provider' and jsonb_typeof(s.value) = 'string'
             and (s.value #>> '{}') in ('openai', 'anthropic'))
$$;

-- Same signature as in 2026091375 (ai_begin_turn and admin_ai_usage call it).
create or replace function private.ai_model()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select (select s.value #>> '{}' from public.app_settings s
             where s.key = 'ai_model' and jsonb_typeof(s.value) = 'string'
               and private.ai_model_provider(s.value #>> '{}') is not null) as model,
           private.ai_provider() as provider
  )
  select case
           when m.provider is null then coalesce(m.model, private.ai_default_model(null))
           when private.ai_model_provider(m.model) = m.provider then m.model
           else private.ai_default_model(m.provider)
         end
    from m
$$;


-- d) admin_ai_usage (as in 2026091375, plus settings.provider) -----------------------------------------------------------------
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
  v_model text := private.ai_model();
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
    -- Turn outcomes of the last 24 hours (errors usually mean a missing / invalid key, no quota or an upstream outage).
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
      'provider', coalesce(private.ai_provider(), private.ai_model_provider(v_model)),
      'model', v_model,
      'daily_messages', (v_lim ->> 'daily')::int,
      'per_minute', (v_lim ->> 'minute')::int,
      'daily_budget_usd', round((v_lim ->> 'budget_micro')::numeric / 1000000, 2)));
end $$;


-- c) admin_set_ai_settings with the provider --------------------------------------------------------------------------------------
drop function if exists public.admin_set_ai_settings(boolean, text, int, int, numeric);

create or replace function public.admin_set_ai_settings(
  p_enabled boolean,
  p_model text,
  p_daily_messages int,
  p_per_minute int,
  p_daily_budget_usd numeric,
  p_provider text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
begin
  perform private.assert_admin();
  v_provider := coalesce(nullif(btrim(p_provider), ''), private.ai_model_provider(p_model));
  if p_enabled is null then
    raise exception 'GebzemAI için açık ya da kapalı seç.' using hint = 'invalid_value';
  end if;
  -- The model first: with p_provider omitted (old callers) an unknown model must say "model", not "provider".
  if p_model is null or private.ai_model_provider(p_model) is null then
    raise exception 'Bu model desteklenmiyor.' using hint = 'invalid_model';
  end if;
  if v_provider is null or v_provider not in ('openai', 'anthropic') then
    raise exception 'Bu sağlayıcı desteklenmiyor.' using hint = 'invalid_provider';
  end if;
  if private.ai_model_provider(p_model) <> v_provider then
    raise exception 'Bu model seçilen sağlayıcıda yok.' using hint = 'invalid_model';
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
         ('ai_provider', to_jsonb(v_provider), now()),
         ('ai_model', to_jsonb(p_model), now()),
         ('ai_daily_messages', to_jsonb(p_daily_messages), now()),
         ('ai_per_minute', to_jsonb(p_per_minute), now()),
         ('ai_daily_budget_usd', to_jsonb(round(p_daily_budget_usd, 2)), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
   where s.value is distinct from excluded.value;

  return jsonb_build_object('enabled', p_enabled, 'provider', v_provider, 'model', p_model, 'daily_messages', p_daily_messages,
                            'per_minute', p_per_minute, 'daily_budget_usd', round(p_daily_budget_usd, 2));
end $$;


-- grants ----------------------------------------------------------------------------------------------------------------------------
revoke all on function private.ai_model_provider(text) from public, anon, authenticated;
revoke all on function private.ai_default_model(text) from public, anon, authenticated;
revoke all on function private.ai_provider() from public, anon, authenticated;
revoke all on function private.ai_model() from public, anon, authenticated;

revoke all on function public.admin_ai_usage(int) from public, anon, authenticated;
grant execute on function public.admin_ai_usage(int) to authenticated;

revoke all on function public.admin_set_ai_settings(boolean, text, int, int, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_set_ai_settings(boolean, text, int, int, numeric, text) to authenticated;


-- a) seed (first run only) -------------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.app_settings where key = 'ai_provider') then
    insert into public.app_settings (key, value, updated_at) values ('ai_provider', '"openai"'::jsonb, now());
    update public.app_settings
       set value = '"gpt-5.4-mini"'::jsonb, updated_at = now()
     where key = 'ai_model'
       and private.ai_model_provider(value #>> '{}') is distinct from 'openai';
  end if;
end $$;

-- PostgREST: the admin_set_ai_settings signature changed.
notify pgrst, 'reload schema';
