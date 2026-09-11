-- Gebzem: news feeds are refreshed on a schedule instead of by page visits. Additive and re-runnable.
--
-- 1) news_sources.fail_count / failing_since: failed fetches in a row and when the streak began (both reset on success).
--    news_sources.permission_note: the admin's note on the publisher's usage permission. Not readable through the API
--    (column grants below); the admin page reads it with the service role.
-- 2) news_items.category: category inferred at fetch time (it also uses the feed's own label), so pages can build the
--    list from stored rows.
-- 3) public.news_record_fetch(): stores each feed's result (service role only). A source that keeps failing for more
--    than 3 days notifies the admins once per failing streak.
-- 4) pg_cron job gebzem-refresh-news (every 20 minutes) POSTs through pg_net to /api/cron/news, which fetches the feeds
--    and stores headlines + status. Secret = Vault 'gebzem_push_webhook_secret' (= CRON_SECRET on Vercel), same pattern
--    as gebzem-purge-listings (2026091314_listing_purge.sql). Pages fetch the feeds themselves only when this job has
--    not run for 45 minutes.

set search_path = public, extensions;

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1) + 2) Columns
-- ---------------------------------------------------------------------------
alter table public.news_sources add column if not exists fail_count integer not null default 0;
alter table public.news_sources add column if not exists failing_since timestamptz;
alter table public.news_sources add column if not exists permission_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'news_sources_fail_count_check' and conrelid = 'public.news_sources'::regclass) then
    alter table public.news_sources add constraint news_sources_fail_count_check check (fail_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'news_sources_permission_note_check' and conrelid = 'public.news_sources'::regclass) then
    alter table public.news_sources add constraint news_sources_permission_note_check
      check (permission_note is null or char_length(permission_note) <= 500);
  end if;
end $$;

-- Sources already failing before this migration: the streak starts now.
update public.news_sources
   set fail_count = greatest(fail_count, 1), failing_since = coalesce(failing_since, last_fetched_at, now())
 where last_error is not null and failing_since is null;

-- No check constraint on purpose: an unknown value is ignored by the reader (src/features/content/news/get-news.ts).
alter table public.news_items add column if not exists category text;

-- Column grants: permission_note is admin-only. Columns added to news_sources later must be granted here too.
revoke select on public.news_sources from anon, authenticated;
grant select (id, name, site_url, feed_url, active, last_fetched_at, last_error, fail_count, failing_since, created_at)
  on public.news_sources to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Feed results
-- ---------------------------------------------------------------------------
-- p_results: [{ "id": "<source uuid>", "error": "HTTP 403" | null }, ...]. Returns the number of sources updated.
create or replace function public.news_record_fetch(p_fetched_at timestamptz, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_old public.news_sources%rowtype;
  v_count integer := 0;
begin
  if p_fetched_at is null or jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Geçersiz akış sonucu.' using errcode = '22023';
  end if;

  for r in
    select x.id, nullif(left(btrim(x.error), 200), '') as error
      from jsonb_to_recordset(p_results) as x(id uuid, error text)
     where x.id is not null
  loop
    select * into v_old from public.news_sources s where s.id = r.id for update;
    -- Unknown source, or a newer result is already stored (the cron and a page fallback ran at the same time).
    if not found or v_old.last_fetched_at > p_fetched_at then
      continue;
    end if;

    update public.news_sources s
       set last_fetched_at = p_fetched_at,
           last_error = r.error,
           fail_count = case when r.error is null then 0 else s.fail_count + 1 end,
           failing_since = case when r.error is null then null else coalesce(s.failing_since, p_fetched_at) end
     where s.id = r.id;
    v_count := v_count + 1;

    -- This result crosses the 3-day mark (the previous one had not): tell the admins once per failing streak.
    -- No previous fetch time (backfilled streak): this is the first result, so it counts as crossing.
    if r.error is not null and v_old.failing_since is not null
       and v_old.failing_since <= p_fetched_at - interval '3 days'
       and (v_old.last_fetched_at is null or v_old.failing_since > v_old.last_fetched_at - interval '3 days') then
      perform private.notify_admins(
        'news_source_failing',
        'Haber kaynağı 3 gündür çalışmıyor: ' || v_old.name,
        'Son hata: ' || r.error || '. Akış adresini kontrol et, gerekirse kaynağı pasife al.',
        '/admin/haberler');
    end if;
  end loop;

  return v_count;
end $$;

revoke all on function public.news_record_fetch(timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.news_record_fetch(timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Scheduled fetch (same pattern as private.purge_listings_webhook)
-- ---------------------------------------------------------------------------
create or replace function private.news_refresh_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.news_sources where active) then
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
    url := 'https://gbzsehir.vercel.app/api/cron/news',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 30000);
end $$;

revoke all on function private.news_refresh_webhook() from public, anon, authenticated;

-- Every 20 minutes (= NEWS_REVALIDATE_SECONDS in src/features/content/news/get-news.ts)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-refresh-news';
    perform cron.schedule('gebzem-refresh-news', '*/20 * * * *', 'select private.news_refresh_webhook()');
  end if;
end $$;

notify pgrst, 'reload schema';
