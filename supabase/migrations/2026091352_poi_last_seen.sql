-- Regular POI re-sync (audit step 34). Additive and re-runnable.
--  * poi.last_seen_at: when a KBB / OSM pull last listed the row (backfilled from updated_at, i.e. the seed runs).
--  * poi.missing_since: set when a sync hides a row because its source no longer lists it; cleared whenever the row is
--    visible again. A sync-hidden row that comes back is shown again. Rows an admin hid (missing_since null) stay hidden.
--  * private.poi_before_write: latest body from 2026091335_poi_admin.sql (lock), plus: missing_since only on hidden rows,
--    and updated_at only moves when the content changed (a sync that only stamps last_seen_at keeps it).
--  * public.data_sync_runs: one row per real sync run and per admin request (/admin/veri). Kept 2 years.
--  * public.poi_sync_apply(...): service role only. Writes one pull (src/features/nearby/server/poi-sync.ts and
--    scripts/db/seed-poi.mjs, seed-taxi.mjs, seed-atm.mjs): upsert on (source, source_ref) + last_seen_at, then hides the
--    unlocked rows of each complete (source, kind) group that the pull no longer lists. Never deletes. A guard skips the
--    hiding when a pull looks truncated. p_dry_run runs the same statements and rolls them back.
--  * public.admin_poi_sync_now(p_dry_run): "Şimdi eşitle" / "Önizle" on /admin/veri. The admin site has no service role
--    key (2026091360_admin_without_service_key.sql), so it records a 'running' request and queues the public app's
--    /api/cron/poi-sync through pg_net; the route fills that row with the result, which the admin page polls.
--  * pg_cron gebzem-poi-sync (2nd of each month, 01:23 UTC) POSTs through pg_net to /api/cron/poi-sync
--    (Vault 'gebzem_push_webhook_secret' = CRON_SECRET, same pattern as 2026091314_listing_purge.sql).

set search_path = public, extensions;

create extension if not exists pg_net;

-- ===========================================================================
-- 1. Columns
-- ===========================================================================
alter table public.poi add column if not exists last_seen_at timestamptz;
alter table public.poi add column if not exists missing_since timestamptz;

comment on column public.poi.last_seen_at is 'Last time a KBB / OSM pull listed this row (poi_sync_apply).';
comment on column public.poi.missing_since is 'Hidden by a sync because the source no longer lists it; null once visible again.';

-- ===========================================================================
-- 2. Trigger: same as 2026091335_poi_admin.sql, plus missing_since and a content-only updated_at
-- ===========================================================================
create or replace function private.poi_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op = 'UPDATE' and old.locked and new.locked and not public.is_admin() then
    new.name := old.name;
    new.address := old.address;
    new.phone := old.phone;
    new.location := old.location;
    new.neighbourhood_id := old.neighbourhood_id;
    new.hidden := old.hidden;
    if jsonb_typeof(old.details) = 'object' and jsonb_typeof(new.details) = 'object' then
      new.details := new.details || coalesce((
        select jsonb_object_agg(e.key, e.value) from jsonb_each(old.details) e
         where e.key in ('category', 'description', 'hours', 'fee', 'curated', 'photos')), '{}'::jsonb);
    end if;
  end if;
  -- missing_since marks sync-hidden rows only.
  if not new.hidden then
    new.missing_since := null;
  end if;
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(new.address, '') || ' ' || coalesce(new.details ->> 'category', ''));
  -- Sync bookkeeping alone (last_seen_at) is not a content change.
  if tg_op = 'UPDATE'
     and (new.kind, new.name, new.slug, new.address, new.phone, new.neighbourhood_id, new.details, new.source,
          new.source_ref, new.license, new.hidden, new.locked)
         is not distinct from
         (old.kind, old.name, old.slug, old.address, old.phone, old.neighbourhood_id, old.details, old.source,
          old.source_ref, old.license, old.hidden, old.locked)
     and new.location::text is not distinct from old.location::text then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;

revoke all on function private.poi_before_write() from public, anon, authenticated;

-- Seeded rows were last seen by their seed run.
update public.poi set last_seen_at = updated_at where last_seen_at is null and source in ('kbb', 'osm');

-- ===========================================================================
-- 3. Sync log
-- ===========================================================================
create table if not exists public.data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  -- requested (admin) or logged (cron / script)
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- what was synced ('poi' for now)
  dataset text not null,
  -- cron: pg_cron -> /api/cron/poi-sync · admin: "Şimdi eşitle" / "Önizle" on /admin/veri · script: scripts/db/seed-*.mjs
  triggered_by text not null,
  -- an admin preview ("Önizle"): nothing was written
  dry_run boolean not null default false,
  -- running: an admin request waiting for the public app · ok · partial: a source failed or a guard skipped the hiding ·
  -- error: nothing could be read, or the request got no answer
  status text not null,
  -- {totals: {...}, groups: [{source, kind, complete, fetched, added, updated, unchanged, restored, missing, hidden,
  --  locked, guarded}], errors: [{source, message}]}
  summary jsonb not null default '{}'::jsonb,
  message text,
  actor_id uuid references public.profiles(id) on delete set null
);

alter table public.data_sync_runs add column if not exists finished_at timestamptz;
alter table public.data_sync_runs add column if not exists dry_run boolean not null default false;

alter table public.data_sync_runs drop constraint if exists data_sync_runs_dataset_check;
alter table public.data_sync_runs add constraint data_sync_runs_dataset_check check (dataset in ('poi'));
alter table public.data_sync_runs drop constraint if exists data_sync_runs_triggered_by_check;
alter table public.data_sync_runs add constraint data_sync_runs_triggered_by_check check (triggered_by in ('cron', 'admin', 'script'));
alter table public.data_sync_runs drop constraint if exists data_sync_runs_status_check;
alter table public.data_sync_runs add constraint data_sync_runs_status_check check (status in ('running', 'ok', 'partial', 'error'));

create index if not exists data_sync_runs_dataset_created_idx on public.data_sync_runs (dataset, created_at desc);

comment on table public.data_sync_runs is 'Data source sync runs and admin sync requests (/admin/veri). Written by poi_sync_apply / admin_poi_sync_now; kept 2 years.';

alter table public.data_sync_runs enable row level security;
drop policy if exists "admin read" on public.data_sync_runs;
create policy "admin read" on public.data_sync_runs for select to authenticated using (public.is_admin());

-- Written only by poi_sync_apply, admin_poi_sync_now and the service role.
revoke all on public.data_sync_runs from anon, authenticated;
grant select on public.data_sync_runs to authenticated;
grant all on public.data_sync_runs to service_role;

-- ===========================================================================
-- 4. Apply one pull (service role only)
-- ===========================================================================
-- p_rows:   [{kind, name, slug, address, phone, x, y, srid (4326 | 5254), details, source, source_ref, license}]
--           slug is used for new rows only; a row without the "phone" key keeps its stored phone.
-- p_groups: [{source: 'kbb' | 'osm', kind}] read completely by this pull: their rows missing from p_rows are hidden.
-- p_errors: [{source, message}] pulls that failed (logged; nothing of theirs is hidden).
-- p_run_id: the 'running' request of admin_poi_sync_now this pull answers. Its trigger, admin and preview flag come
--           from that row (never from the caller), and the result is written into it.
-- Earlier draft of this file (never applied) had p_actor in the last place: same types, other name.
drop function if exists public.poi_sync_apply(jsonb, jsonb, text, boolean, jsonb, uuid);
create or replace function public.poi_sync_apply(
  p_rows jsonb,
  p_groups jsonb default '[]'::jsonb,
  p_trigger text default 'script',
  p_dry_run boolean default false,
  p_errors jsonb default '[]'::jsonb,
  p_run_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_groups jsonb := coalesce(p_groups, '[]'::jsonb);
  v_errors jsonb := '[]'::jsonb;
  v_trigger text := p_trigger;
  v_dry boolean := coalesce(p_dry_run, false);
  v_request boolean := false;
  v_refs text[];
  v_bad int;
  v_stats jsonb := '{}'::jsonb;
  v_groups_out jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_summary jsonb;
  v_status text;
  v_message text;
  v_actor uuid;
  v_run uuid;
  v_any_guard boolean := false;
  g record;
  v_key text;
  v_fetched int;
  v_visible int;
  v_to_hide int;
  v_locked int;
  v_hidden int;
  v_guard boolean;
begin
  if p_trigger is null or p_trigger not in ('cron', 'admin', 'script') then
    raise exception 'poi_sync_apply: invalid trigger %', p_trigger using errcode = '22023';
  end if;
  if jsonb_typeof(v_rows) <> 'array' or jsonb_typeof(v_groups) <> 'array' then
    raise exception 'poi_sync_apply: p_rows and p_groups must be arrays' using errcode = '22023';
  end if;
  if jsonb_typeof(p_errors) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'source', left(coalesce(x.e ->> 'source', '-'), 60),
             'message', left(coalesce(x.e ->> 'message', '-'), 300))), '[]'::jsonb)
      into v_errors
      from (select t.e from jsonb_array_elements(p_errors) as t(e) where jsonb_typeof(t.e) = 'object' limit 20) x;
  end if;

  -- Rows
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) as t(e)
   where jsonb_typeof(e) <> 'object'
      or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm')
      or coalesce(e ->> 'source', '') not in ('kbb', 'osm', 'manual')
      or coalesce(btrim(e ->> 'name'), '') = '' or char_length(e ->> 'name') > 200
      or coalesce(e ->> 'source_ref', '') = '' or char_length(e ->> 'source_ref') > 200
      or coalesce(e ->> 'slug', '') = '' or char_length(e ->> 'slug') > 200
      or jsonb_typeof(e -> 'x') is distinct from 'number' or jsonb_typeof(e -> 'y') is distinct from 'number'
      or coalesce(e ->> 'srid', '4326') not in ('4326', '5254')
      or jsonb_typeof(coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb)) <> 'object';
  if v_bad > 0 then
    raise exception 'poi_sync_apply: % invalid row(s)', v_bad using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) as t(e) group by e ->> 'source', e ->> 'source_ref' having count(*) > 1) then
    raise exception 'poi_sync_apply: duplicate (source, source_ref) in p_rows' using errcode = '22023';
  end if;
  -- Around Gebze (same box as the admin editor).
  select count(*) into v_bad
    from (select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint((e ->> 'x')::float8, (e ->> 'y')::float8),
                   coalesce((e ->> 'srid')::int, 4326)), 4326) as g
            from jsonb_array_elements(v_rows) as t(e)) p
   where extensions.st_y(p.g) not between 40.5 and 41.2 or extensions.st_x(p.g) not between 29 and 30;
  if v_bad > 0 then
    raise exception 'poi_sync_apply: % row(s) outside the Gebze area', v_bad using errcode = '22023';
  end if;
  -- Groups: only source data can go missing (manual rows are never hidden by a sync).
  if exists (select 1 from jsonb_array_elements(v_groups) as t(e)
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'source', '') not in ('kbb', 'osm')
                 or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm')) then
    raise exception 'poi_sync_apply: invalid group' using errcode = '22023';
  end if;

  select coalesce(array_agg((e ->> 'source') || '|' || (e ->> 'source_ref')), '{}'::text[]) into v_refs
    from jsonb_array_elements(v_rows) as t(e);

  -- One sync at a time (cron, admin button, scripts).
  perform pg_advisory_xact_lock(hashtext('gebzem:poi_sync'));

  -- The admin request this pull answers (a request that already got its answer or timed out is ignored).
  if p_run_id is not null then
    select r.triggered_by, r.actor_id, v_dry or r.dry_run, true
      into v_trigger, v_actor, v_dry, v_request
      from public.data_sync_runs r
     where r.id = p_run_id and r.dataset = 'poi' and r.status = 'running'
     for update;
    if not found then
      v_request := false;
      v_trigger := p_trigger;
      v_actor := null;
      v_dry := coalesce(p_dry_run, false);
    end if;
  end if;

  begin
    -- 1) Upsert, with per (source, kind) counts of what it did.
    with r as (
      select e ->> 'kind' as kind, btrim(e ->> 'name') as name, e ->> 'slug' as slug,
             nullif(btrim(e ->> 'address'), '') as address,
             e ? 'phone' as has_phone, nullif(btrim(e ->> 'phone'), '') as phone,
             extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint((e ->> 'x')::float8, (e ->> 'y')::float8),
               coalesce((e ->> 'srid')::int, 4326)), 4326) as g,
             coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb) as details,
             e ->> 'source' as source, e ->> 'source_ref' as source_ref, nullif(e ->> 'license', '') as license, t.ord
        from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
    ),
    pre as (
      select q.id, q.source, q.source_ref, q.phone, q.updated_at, q.missing_since
        from public.poi q
        join r on r.source = q.source and r.source_ref = q.source_ref
    ),
    v as (
      select r.*,
             case when r.has_phone then r.phone else pre.phone end as phone_final,
             -- New rows: a taken slug gets a stable suffix.
             case when pre.id is null
                       and (exists (select 1 from public.poi q where q.slug = r.slug)
                            or row_number() over (partition by r.slug order by r.ord) > 1)
                  then left(r.slug, 180) || '-' || left(md5(r.source || ':' || r.source_ref), 6)
                  else r.slug end as slug_final
        from r
        left join pre on pre.source = r.source and pre.source_ref = r.source_ref
    ),
    up as (
      insert into public.poi as q (kind, name, slug, address, phone, location, neighbourhood_id, details, source, source_ref, license, last_seen_at)
      select v.kind, v.name, v.slug_final, v.address, v.phone_final, v.g::extensions.geography,
             coalesce(
               (select b.neighbourhood_id from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, v.g) limit 1),
               (select n.id from public.neighbourhoods n order by n.center operator(extensions.<->) v.g::extensions.geography limit 1)),
             v.details, v.source, v.source_ref, v.license, now()
        from v
      on conflict (source, source_ref) do update set
        kind = excluded.kind, name = excluded.name, address = excluded.address, phone = excluded.phone,
        location = excluded.location, neighbourhood_id = excluded.neighbourhood_id,
        details = q.details || excluded.details, license = excluded.license,
        last_seen_at = excluded.last_seen_at,
        -- Listed again after a sync hid it: show it (on a locked row the lock keeps the admin's choice).
        hidden = case when q.missing_since is not null then false else q.hidden end
      returning q.id, q.source, q.kind, (xmax = 0) as inserted, q.updated_at, q.hidden
    )
    select coalesce(jsonb_object_agg(x.k, x.st), '{}'::jsonb) into v_stats
      from (
        select up.source || '/' || up.kind as k,
               jsonb_build_object(
                 'fetched', count(*),
                 'added', count(*) filter (where up.inserted),
                 'restored', count(*) filter (where not up.inserted and pre.missing_since is not null and not up.hidden),
                 'updated', count(*) filter (where not up.inserted and up.updated_at is distinct from pre.updated_at
                                               and not (pre.missing_since is not null and not up.hidden)),
                 'unchanged', count(*) filter (where not up.inserted and up.updated_at is not distinct from pre.updated_at
                                                 and not (pre.missing_since is not null and not up.hidden))) as st
          from up
          left join pre on pre.id = up.id
         group by up.source, up.kind) x;

    -- 2) Complete groups: hide the unlocked visible rows the pull no longer lists.
    for g in
      select distinct t.e ->> 'source' as source, t.e ->> 'kind' as kind from jsonb_array_elements(v_groups) as t(e)
    loop
      v_key := g.source || '/' || g.kind;
      select count(*) into v_fetched
        from jsonb_array_elements(v_rows) as t(e)
       where e ->> 'source' = g.source and e ->> 'kind' = g.kind;
      select count(*) filter (where not q.hidden),
             count(*) filter (where not q.hidden and not q.locked and not ((q.source || '|' || q.source_ref) = any(v_refs))),
             count(*) filter (where not q.hidden and q.locked and not ((q.source || '|' || q.source_ref) = any(v_refs)))
        into v_visible, v_to_hide, v_locked
        from public.poi q
       where q.source = g.source and q.kind = g.kind;
      -- A pull that looks truncated hides nothing: under half of the visible rows, or more than 30% (min. 5) missing.
      v_guard := v_to_hide > 0 and (v_fetched * 2 < v_visible or v_to_hide > greatest(5, ceil(v_visible * 0.3)));
      v_hidden := 0;
      if v_to_hide > 0 and not v_guard then
        update public.poi q
           set hidden = true, missing_since = now()
         where q.source = g.source and q.kind = g.kind and not q.hidden and not q.locked
           and not ((q.source || '|' || q.source_ref) = any(v_refs));
        get diagnostics v_hidden = row_count;
      end if;
      v_any_guard := v_any_guard or v_guard;
      v_stats := jsonb_set(v_stats, array[v_key],
        coalesce(v_stats -> v_key, jsonb_build_object('fetched', 0, 'added', 0, 'restored', 0, 'updated', 0, 'unchanged', 0))
          || jsonb_build_object('complete', true, 'missing', v_to_hide + v_locked, 'hidden', v_hidden, 'locked', v_locked, 'guarded', v_guard));
    end loop;

    -- 3) Summary
    select coalesce(jsonb_agg(
             jsonb_build_object('source', split_part(s.key, '/', 1), 'kind', split_part(s.key, '/', 2),
                                'complete', false, 'missing', 0, 'hidden', 0, 'locked', 0, 'guarded', false)
               || s.value
             order by s.key), '[]'::jsonb)
      into v_groups_out
      from jsonb_each(v_stats) s;
    select jsonb_build_object(
             'fetched', coalesce(sum((x ->> 'fetched')::int), 0),
             'added', coalesce(sum((x ->> 'added')::int), 0),
             'updated', coalesce(sum((x ->> 'updated')::int), 0),
             'unchanged', coalesce(sum((x ->> 'unchanged')::int), 0),
             'restored', coalesce(sum((x ->> 'restored')::int), 0),
             'missing', coalesce(sum((x ->> 'missing')::int), 0),
             'hidden', coalesce(sum((x ->> 'hidden')::int), 0),
             'locked', coalesce(sum((x ->> 'locked')::int), 0))
      into v_totals
      from jsonb_array_elements(v_groups_out) as t(x);
    v_status := case
      when jsonb_array_length(v_rows) = 0 and jsonb_array_length(v_errors) > 0 then 'error'
      when jsonb_array_length(v_errors) > 0 or v_any_guard then 'partial'
      else 'ok' end;
    v_summary := jsonb_build_object('totals', v_totals, 'groups', v_groups_out, 'errors', v_errors);

    if v_dry then
      raise exception using errcode = 'GZDRY', message = 'poi_sync_apply dry run';
    end if;
  exception when sqlstate 'GZDRY' then
    null; -- dry run: every write above is rolled back, the summary stays
  end;

  select left(string_agg((t.e ->> 'source') || ': ' || (t.e ->> 'message'), '; '), 500) into v_message
    from jsonb_array_elements(v_errors) as t(e);
  delete from public.data_sync_runs where created_at < now() - interval '2 years';
  if v_request then
    -- The admin's request (a preview too) gets its answer.
    update public.data_sync_runs
       set status = v_status, summary = v_summary, message = v_message, finished_at = now()
     where id = p_run_id
    returning id into v_run;
  elsif not v_dry then
    insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, summary, message, finished_at)
    values ('poi', v_trigger, false, v_status, v_summary, v_message, now())
    returning id into v_run;
  end if;
  -- The admin's run in /admin/denetim (the row writes above have no session, so audit_content skips them).
  if v_actor is not null and not v_dry then
    insert into public.audit_log (actor_id, user_id, action, entity_type, entity_id, summary, details)
    values (v_actor, null, 'place.sync', 'place', null,
      'Yer verisi eşitlendi: ' || (v_totals ->> 'added') || ' yeni, ' || (v_totals ->> 'updated') || ' güncellendi, '
        || (v_totals ->> 'hidden') || ' gizlendi',
      jsonb_strip_nulls(jsonb_build_object('note', v_message)));
  end if;

  return v_summary || jsonb_build_object('run_id', v_run, 'dry_run', v_dry, 'status', v_status);
end $$;

-- ===========================================================================
-- 5. Call the public app's route (monthly job and admin requests; same pattern as private.purge_listings_webhook)
-- ===========================================================================
-- Earlier draft of this file (never applied) had no argument; both would make "select private.poi_sync_webhook()" ambiguous.
drop function if exists private.poi_sync_webhook();
create or replace function private.poi_sync_webhook(p_body jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return false;
  end if;
  -- Asynchronous: pg_net sends it after the calling transaction commits. 300 s = maxDuration of the route.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/cron/poi-sync',
    body := coalesce(p_body, jsonb_build_object('source', 'pg_cron')),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 300000);
  return true;
end $$;

-- ===========================================================================
-- 6. "Şimdi eşitle" / "Önizle" (admin session; the admin site has no service role key)
--    started: true  -> run_id is the 'running' row the public app answers (usually within 1-2 minutes)
--    started: false -> reason 'pending' (an earlier request is still running: run_id / dry_run name it) |
--                      'no_secret' (Vault secret missing)
-- ===========================================================================
create or replace function public.admin_poi_sync_now(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dry boolean := coalesce(p_dry_run, false);
  v_run public.data_sync_runs;
  v_id uuid;
begin
  perform private.assert_admin();
  -- Parallel clicks run one after the other, so the pending check below sees the earlier request.
  perform pg_advisory_xact_lock(hashtext('admin_poi_sync_now'));

  -- A request without an answer after 10 minutes (the route allows 5) is given up.
  update public.data_sync_runs
     set status = 'error', message = 'Eşitleme yanıt vermedi (zaman aşımı).', finished_at = now()
   where dataset = 'poi' and status = 'running' and created_at < now() - interval '10 minutes';

  select * into v_run from public.data_sync_runs r
   where r.dataset = 'poi' and r.status = 'running'
   order by r.created_at desc
   limit 1;
  if found then
    return jsonb_build_object('started', false, 'reason', 'pending', 'run_id', v_run.id, 'dry_run', v_run.dry_run);
  end if;

  insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, actor_id)
  values ('poi', 'admin', v_dry, 'running', auth.uid())
  returning id into v_id;
  if not private.poi_sync_webhook(jsonb_build_object('source', 'admin', 'run_id', v_id, 'dry_run', v_dry)) then
    raise exception 'Eşitleme başlatılamadı: zamanlanmış görevin anahtarı tanımlı değil.' using errcode = 'P0001', hint = 'no_secret';
  end if;
  return jsonb_build_object('started', true, 'run_id', v_id, 'dry_run', v_dry);
end $$;

-- ===========================================================================
-- 7. Grants
-- ===========================================================================
revoke all on function public.poi_sync_apply(jsonb, jsonb, text, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.poi_sync_apply(jsonb, jsonb, text, boolean, jsonb, uuid) to service_role;
revoke all on function private.poi_sync_webhook(jsonb) from public, anon, authenticated;
revoke all on function public.admin_poi_sync_now(boolean) from public, anon;
grant execute on function public.admin_poi_sync_now(boolean) to authenticated;

-- ===========================================================================
-- 8. Job: 2nd of each month, 01:23 UTC (04:23 Europe/Istanbul, a quiet hour for Overpass)
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-poi-sync';
    perform cron.schedule('gebzem-poi-sync', '23 1 2 * *', 'select private.poi_sync_webhook()');
  end if;
end $$;

notify pgrst, 'reload schema';
