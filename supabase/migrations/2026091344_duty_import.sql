-- Real duty list (audit step 30): the admin enters it by hand, an importer can fill it automatically.
--  * pharmacy_duty keeps one row per pharmacy and duty day (unique (poi_id, duty_start); every writer uses the standard
--    08:30 -> 08:30 Europe/Istanbul window). Sources: 'demo' (roll_demo_duty), 'manual' (admin), an importer id ('nosyapi').
--  * duty_import_runs: log of every import attempt and manual save (admins read it on /admin/nobet).
--  * admin_set_duty(p_day, p_poi_ids): the admin's list of a duty day (source 'manual'); it replaces the day's real rows.
--    An importer never overwrites a day that has manual rows.
--  * duty_import_record(...): service role only; /api/cron/duty writes an imported list and logs the run with it.
--  * pg_cron: gebzem-duty-import (08:35) and gebzem-duty-import-recheck (09:10, 12:10, 18:10) POST to /api/cron/duty
--    through pg_net (Vault secret 'gebzem_push_webhook_secret' = CRON_SECRET, see 2026091314_listing_purge.sql);
--    gebzem-duty-stale-check (09:15) sends an admin notice when duty_data_mode = 'live' and no real row is on duty.
-- The duty RPCs (mode / hidden filters from 2026091320_duty_mode_gate.sql and 2026091335_poi_admin.sql) are unchanged:
-- in 'live' they show every source except 'demo'. Re-runnable.

set search_path = public, extensions;

create extension if not exists pg_net;

-- ===========================================================================
-- 1. One row per pharmacy and duty day (created by 20260910000001_init.sql; kept for older databases)
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pharmacy_duty'::regclass and contype = 'u'
       and conkey = array[
         (select attnum from pg_attribute where attrelid = 'public.pharmacy_duty'::regclass and attname = 'poi_id'),
         (select attnum from pg_attribute where attrelid = 'public.pharmacy_duty'::regclass and attname = 'duty_start')]::smallint[]
  ) then
    alter table public.pharmacy_duty add constraint pharmacy_duty_poi_id_duty_start_key unique (poi_id, duty_start);
  end if;
end $$;

-- ===========================================================================
-- 2. Import log
-- ===========================================================================
create table if not exists public.duty_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- importer id, 'manual' (admin) or 'none' (no source configured)
  source text not null,
  status text not null,
  duty_day date,
  fetched int not null default 0,
  matched int not null default 0,
  written int not null default 0,
  -- names the importer could not match to a pharmacy
  unmatched jsonb not null default '[]'::jsonb,
  message text,
  actor_id uuid references public.profiles(id) on delete set null
);

-- ok: list written · manual: admin save · skipped: the day has an admin list · empty: nothing (matched) in the source ·
-- stale: the source has not published the day's list yet · no_source: no source key · error: source or parse error
alter table public.duty_import_runs drop constraint if exists duty_import_runs_status_check;
alter table public.duty_import_runs add constraint duty_import_runs_status_check
  check (status in ('ok', 'manual', 'skipped', 'empty', 'stale', 'no_source', 'error'));

create index if not exists duty_import_runs_created_idx on public.duty_import_runs (created_at desc);

comment on table public.duty_import_runs is 'Duty list import runs and manual saves (/admin/nobet). Kept 90 days.';

alter table public.duty_import_runs enable row level security;
drop policy if exists "admin read" on public.duty_import_runs;
create policy "admin read" on public.duty_import_runs for select to authenticated using (public.is_admin());

-- Written only by the security definer functions below and the service role.
revoke all on public.duty_import_runs from anon, authenticated;
grant select on public.duty_import_runs to authenticated;
grant all on public.duty_import_runs to service_role;

-- ===========================================================================
-- 3. Admin: the day's list by hand
-- ===========================================================================
create or replace function public.admin_set_duty(p_day date, p_poi_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today date := private.current_duty_day();
  v_start timestamptz;
  v_in uuid[];
  v_ids uuid[];
  v_n int;
  v_written int := 0;
  v_removed int := 0;
begin
  perform private.assert_admin();
  -- 60 days = MAX_DAYS_AHEAD in src/app/admin/nobet/page.tsx
  if p_day is null or p_day < v_today or p_day > v_today + 60 then
    raise exception 'Nöbet listesi bugünden en fazla 60 gün sonrasına kadar girilebilir.' using errcode = '22023', hint = 'duty_day';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_in
    from unnest(coalesce(p_poi_ids, '{}'::uuid[])) x
   where x is not null;
  v_n := cardinality(v_in);
  if v_n > 100 then
    raise exception 'Bir güne en fazla 100 eczane girilebilir.' using errcode = '22023', hint = 'duty_count';
  end if;
  select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.poi p
   where p.id = any(v_in) and p.kind = 'pharmacy';
  if cardinality(v_ids) <> v_n then
    raise exception 'Listede eczane olmayan ya da silinmiş bir kayıt var. Sayfayı yenileyip tekrar dene.' using errcode = '22023', hint = 'duty_poi';
  end if;
  v_start := (p_day + time '08:30') at time zone 'Europe/Istanbul';

  -- The admin's list replaces the day's real rows; sample rows stay (duty_data_mode decides whether they show).
  delete from public.pharmacy_duty
   where duty_start = v_start and source <> 'demo' and poi_id <> all(v_ids);
  get diagnostics v_removed = row_count;
  insert into public.pharmacy_duty (poi_id, duty_start, duty_end, source, note, fetched_at)
  select x, v_start, v_start + interval '1 day', 'manual', null, now()
    from unnest(v_ids) x
  on conflict (poi_id, duty_start) do update
    set duty_end = excluded.duty_end, source = 'manual', note = null, fetched_at = excluded.fetched_at;
  get diagnostics v_written = row_count;

  insert into public.duty_import_runs (source, status, duty_day, fetched, matched, written, message, actor_id)
  values ('manual', 'manual', p_day, v_n, v_n, v_written,
          case when v_removed > 0 then v_removed || ' kayıt listeden çıkarıldı.' end, auth.uid());
  -- Details use keys /admin/denetim labels (date, note): pharmacy names, not a long id list.
  perform private.audit(null, 'duty.manual', 'duty', null,
    case when v_n = 0 then 'Nöbet listesi temizlendi: ' else 'Nöbet listesi girildi: ' end || to_char(p_day, 'DD.MM.YYYY')
      || case when v_n > 0 then ' (' || v_n || ' eczane)' else '' end
      || case when v_removed > 0 then ', ' || v_removed || ' kayıt çıkarıldı' else '' end,
    jsonb_build_object('date', to_char(p_day, 'DD.MM.YYYY'),
      'note', (select left(string_agg(p.name, ', ' order by p.name), 300) from public.poi p where p.id = any(v_ids))));
  return jsonb_build_object('count', v_n, 'written', v_written, 'removed', v_removed);
end $$;

-- ===========================================================================
-- 4. Importer: write a list and log the run (service role only; src/features/nearby/server/duty-import.ts)
-- ===========================================================================
create or replace function public.duty_import_record(
  p_source text,
  p_status text,
  p_day date,
  p_poi_ids uuid[] default '{}'::uuid[],
  p_fetched int default 0,
  p_unmatched jsonb default '[]'::jsonb,
  p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text := p_status;
  v_message text := p_message;
  v_start timestamptz;
  v_ids uuid[] := '{}'::uuid[];
  v_written int := 0;
  v_removed int := 0;
  v_run uuid;
begin
  if p_source is null or p_source !~ '^[a-z0-9_]{2,30}$' or p_source in ('demo', 'manual') then
    raise exception 'duty_import_record: invalid source %', p_source using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('ok', 'empty', 'stale', 'no_source', 'error') then
    raise exception 'duty_import_record: invalid status %', p_status using errcode = '22023';
  end if;
  if v_status = 'ok' then
    if p_day is null then
      raise exception 'duty_import_record: p_day is required' using errcode = '22023';
    end if;
    v_start := (p_day + time '08:30') at time zone 'Europe/Istanbul';
    select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_ids
      from public.poi p
     where p.id = any(coalesce(p_poi_ids, '{}'::uuid[])) and p.kind = 'pharmacy';
    if cardinality(v_ids) = 0 then
      v_status := 'empty';
    elsif exists (select 1 from public.pharmacy_duty where duty_start = v_start and source = 'manual') then
      -- The admin's list of the day wins.
      v_status := 'skipped';
      v_message := 'Bu gün için elle girilen liste var; aktarım yazmadı.';
    else
      delete from public.pharmacy_duty
       where duty_start = v_start and source = p_source and poi_id <> all(v_ids);
      get diagnostics v_removed = row_count;
      insert into public.pharmacy_duty (poi_id, duty_start, duty_end, source, note, fetched_at)
      select x, v_start, v_start + interval '1 day', p_source, null, now()
        from unnest(v_ids) x
      on conflict (poi_id, duty_start) do update
        set duty_end = excluded.duty_end, source = excluded.source, note = null, fetched_at = excluded.fetched_at
        where public.pharmacy_duty.source <> 'manual';
      get diagnostics v_written = row_count;
    end if;
  end if;
  insert into public.duty_import_runs (source, status, duty_day, fetched, matched, written, unmatched, message)
  values (p_source, v_status, p_day, greatest(coalesce(p_fetched, 0), 0), cardinality(v_ids), v_written,
          case when jsonb_typeof(p_unmatched) = 'array' then p_unmatched else '[]'::jsonb end, left(v_message, 500))
  returning id into v_run;
  return jsonb_build_object('run_id', v_run, 'status', v_status, 'written', v_written, 'removed', v_removed);
end $$;

-- ===========================================================================
-- 5. Scheduled import call (same pattern as private.purge_listings_webhook)
-- ===========================================================================
create or replace function private.duty_import_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  -- 'off' shows no list at all: no source credits are spent.
  if coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') = 'off' then
    return;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return;
  end if;
  -- Asynchronous: pg_net sends it after the cron transaction commits.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/cron/duty',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;

-- ===========================================================================
-- 6. 09:15 check: admin notice when the live list has nothing real on duty (once per duty day)
-- ===========================================================================
create or replace function private.duty_stale_check()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_day date := private.current_duty_day();
  v_start timestamptz := (private.current_duty_day() + time '08:30') at time zone 'Europe/Istanbul';
begin
  delete from public.duty_import_runs where created_at < now() - interval '90 days';
  if coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') <> 'live' then
    return;
  end if;
  if exists (
    select 1 from public.pharmacy_duty d
      join public.poi p on p.id = d.poi_id
     where d.source <> 'demo' and d.duty_start <= now() and d.duty_end > now() and not p.hidden
  ) then
    return;
  end if;
  if exists (select 1 from public.notifications where type = 'duty_stale' and created_at >= v_start) then
    return;
  end if;
  perform private.notify_admins('duty_stale', 'Bugünün nöbet listesi gelmedi',
    to_char(v_day, 'DD.MM.YYYY') || ' için sitede gerçek nöbet listesi yok. Listeyi Nöbet listesi ekranından elle girebilirsin.',
    '/admin/nobet');
end $$;

-- ===========================================================================
-- 7. Grants
-- ===========================================================================
revoke all on function public.admin_set_duty(date, uuid[]) from public, anon;
grant execute on function public.admin_set_duty(date, uuid[]) to authenticated;
revoke all on function public.duty_import_record(text, text, date, uuid[], int, jsonb, text) from public, anon, authenticated;
grant execute on function public.duty_import_record(text, text, date, uuid[], int, jsonb, text) to service_role;
revoke all on function private.duty_import_webhook() from public, anon, authenticated;
revoke all on function private.duty_stale_check() from public, anon, authenticated;

-- ===========================================================================
-- 8. Jobs (UTC; Europe/Istanbul is UTC+3): import 08:35, rechecks 09:10 / 12:10 / 18:10, check 09:15.
--    09:10 catches sources that publish the day's list at 09:00 (NosyAPI) before the 09:15 check.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('gebzem-duty-import', 'gebzem-duty-import-recheck', 'gebzem-duty-stale-check');
    perform cron.schedule('gebzem-duty-import', '35 5 * * *', 'select private.duty_import_webhook()');
    perform cron.schedule('gebzem-duty-import-recheck', '10 6,9,15 * * *', 'select private.duty_import_webhook()');
    perform cron.schedule('gebzem-duty-stale-check', '15 6 * * *', 'select private.duty_stale_check()');
  end if;
end $$;
