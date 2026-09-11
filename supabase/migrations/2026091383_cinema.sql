-- Gebzem: "Vizyondaki filmler" (home + /sinema). Programme of the cinema in Gebze Center AVM (Paribu Cineverse Gebze
-- Center), read from the operator's public pages by /api/cron/cinema (src/features/cinema). Additive and re-runnable.
--
-- Source (checked 2026-09-11): gebzecenter.com.tr/sinema-seanslari/ only links to the operator:
--   https://www.paribucineverse.com/sinemalar/gebze-center?tarih=DD-MM-YYYY  (one day; the date picker lists 3 days)
--   https://www.paribucineverse.com/gelecek-filmler                           ("Yakında", ld+json with release dates)
-- robots.txt allows both (only /biletleme/ and ?channel=mobile are disallowed, never requested). The operator's terms
-- forbid copying site images and texts, so posters stay on the operator's CDN (nothing is copied to R2).
--
-- 1) public.cinema_films: one row per film. source_key 'cineverse:<film slug>' is the same in the programme and in
--    the "Yakında" list; slug is our URL (/sinema/<slug>) and never changes once set.
-- 2) public.cinema_showtimes: sessions, source_key 'cineverse:session:<id>'. hall stays null (the source shows it only
--    on the ticketing pages).
-- 3) public.cinema_import_runs: one row per import (admins read it, newest 200 kept). 4 failed runs in a row (two days)
--    notify the admins once per streak (the source may block the Vercel region; pages can then be pushed by an admin).
-- 4) public.cinema_import(p_payload jsonb), service role only: upserts films and sessions, removes the future sessions
--    of the days the payload lists completely that the source no longer shows, purges sessions older than 2 days and
--    logs the run. A payload with "error" only logs the failed run (the stored programme stays).
-- 5) app_settings 'cinema_source': venue, operator page and the mall pin (admin editable; "enabled": false stops the
--    scheduled fetch and hides the home section). Seeded once, never overwritten.
-- 6) pg_cron job gebzem-cinema-refresh at 03:20 and 12:20 UTC (06:20 / 15:20 Istanbul) POSTs through pg_net to
--    /api/cron/cinema (header x-cron-secret = Vault 'gebzem_push_webhook_secret' = CRON_SECRET), like
--    gebzem-refresh-news (2026091343_news_cron.sql).
-- 1) and 2) are public read; nothing here is writable through the API (writes only as the service role).

set search_path = public, extensions;

create extension if not exists pg_net;

-- ===========================================================================
-- 1) Films
-- ===========================================================================
create table if not exists public.cinema_films (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cineverse',
  source_key text not null,
  slug text not null,
  title text not null,
  original_title text,
  poster_url text,
  duration_min integer,
  genres text[] not null default '{}',
  age_rating text,
  synopsis text,
  release_date date,
  trailer_url text,
  source_url text,
  directors text[] not null default '{}',
  actors text[] not null default '{}',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cinema_films_source_key_key unique (source_key),
  constraint cinema_films_slug_key unique (slug),
  constraint cinema_films_source_check check (source ~ '^[a-z0-9_-]{2,30}$'),
  constraint cinema_films_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  constraint cinema_films_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint cinema_films_text_check check (
    char_length(source_key) <= 200
    and coalesce(char_length(original_title), 0) <= 200
    and coalesce(char_length(age_rating), 0) <= 20
    and coalesce(char_length(synopsis), 0) <= 2000),
  constraint cinema_films_urls_check check (
    (poster_url is null or (poster_url ~ '^https://' and char_length(poster_url) <= 500))
    and (trailer_url is null or (trailer_url ~ '^https://' and char_length(trailer_url) <= 500))
    and (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 500))),
  constraint cinema_films_duration_check check (duration_min is null or duration_min between 1 and 600),
  constraint cinema_films_lists_check check (cardinality(genres) <= 6 and cardinality(directors) <= 6 and cardinality(actors) <= 12)
);

comment on table public.cinema_films is
  'Films of the Gebze Center AVM cinema programme (Paribu Cineverse Gebze Center) and its "Yakında" list, written by public.cinema_import (/api/cron/cinema). poster_url points at the operator CDN (not copied).';

create index if not exists cinema_films_release_idx on public.cinema_films (release_date);
create index if not exists cinema_films_last_seen_idx on public.cinema_films (last_seen_at);

drop trigger if exists set_updated_at on public.cinema_films;
create trigger set_updated_at before update on public.cinema_films for each row execute function private.set_updated_at();

-- ===========================================================================
-- 2) Showtimes
-- ===========================================================================
create table if not exists public.cinema_showtimes (
  id bigint generated by default as identity primary key,
  film_id uuid not null references public.cinema_films (id) on delete cascade,
  source_key text not null,
  starts_at timestamptz not null,
  format text,
  language text,
  hall text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cinema_showtimes_source_key_key unique (source_key),
  constraint cinema_showtimes_language_check check (language is null or language in ('dublaj', 'altyazi')),
  constraint cinema_showtimes_text_check check (
    char_length(source_key) <= 300 and coalesce(char_length(format), 0) <= 40 and coalesce(char_length(hall), 0) <= 60)
);

comment on table public.cinema_showtimes is
  'Sessions of public.cinema_films (starts_at in UTC; the source lists sessions before 05:00 under the previous day). format: 2D, 3D, IMAX ...; language: dublaj | altyazi | null.';

create index if not exists cinema_showtimes_starts_idx on public.cinema_showtimes (starts_at);
create index if not exists cinema_showtimes_film_idx on public.cinema_showtimes (film_id, starts_at);

drop trigger if exists set_updated_at on public.cinema_showtimes;
create trigger set_updated_at before update on public.cinema_showtimes for each row execute function private.set_updated_at();

-- ===========================================================================
-- 3) Import runs
-- ===========================================================================
create table if not exists public.cinema_import_runs (
  id bigint generated by default as identity primary key,
  source text not null,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  dates date[] not null default '{}',
  films integer not null default 0,
  showtimes integer not null default 0,
  removed integer not null default 0,
  error text,
  warnings jsonb not null default '[]'::jsonb,
  constraint cinema_import_runs_error_check check (error is null or char_length(error) <= 300)
);

create index if not exists cinema_import_runs_ran_idx on public.cinema_import_runs (source, ran_at desc);

-- ===========================================================================
-- RLS and grants
-- ===========================================================================
alter table public.cinema_films enable row level security;
alter table public.cinema_showtimes enable row level security;
alter table public.cinema_import_runs enable row level security;

drop policy if exists "public read" on public.cinema_films;
create policy "public read" on public.cinema_films for select to anon, authenticated using (true);
drop policy if exists "public read" on public.cinema_showtimes;
create policy "public read" on public.cinema_showtimes for select to anon, authenticated using (true);
drop policy if exists "admin read" on public.cinema_import_runs;
create policy "admin read" on public.cinema_import_runs for select to authenticated using (public.is_admin());

revoke all on table public.cinema_films, public.cinema_showtimes, public.cinema_import_runs from anon, authenticated;
grant select on table public.cinema_films, public.cinema_showtimes to anon, authenticated;
grant select on table public.cinema_import_runs to authenticated;
grant all on table public.cinema_films, public.cinema_showtimes, public.cinema_import_runs to service_role;

-- ===========================================================================
-- 4) Import
-- ===========================================================================
-- p_payload (built by buildImportPayload in src/features/cinema/server/parse.ts):
--   { source: 'cineverse', dates: ['YYYY-MM-DD'...], error: text | null, warnings: [text],
--     films: [{ source_key, slug, title, original_title, poster_url, duration_min, genres[], age_rating, synopsis,
--               release_date, trailer_url, source_url, directors[], actors[] }],
--     showtimes: [{ source_key, film_key, starts_at, format, language, hall }] }
-- Returns { ok, films, showtimes, removed, purged }.
create or replace function public.cinema_import(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(p_payload->>'source', ''), 'cineverse');
  v_error text := nullif(left(btrim(coalesce(p_payload->>'error', '')), 300), '');
  v_warnings jsonb := case when jsonb_typeof(p_payload->'warnings') = 'array' then p_payload->'warnings' else '[]'::jsonb end;
  v_dates date[] := '{}';
  v_films integer := 0;
  v_showtimes integer := 0;
  v_removed integer := 0;
  v_purged integer := 0;
  v_streak integer := 0;
  v_slug text;
  f record;
  r record;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or v_source !~ '^[a-z0-9_-]{2,30}$' then
    raise exception 'Geçersiz sinema verisi.' using errcode = '22023';
  end if;

  if v_error is null then
    if jsonb_typeof(p_payload->'films') is distinct from 'array'
       or jsonb_typeof(p_payload->'showtimes') is distinct from 'array'
       or jsonb_typeof(coalesce(p_payload->'dates', '[]'::jsonb)) is distinct from 'array' then
      raise exception 'Geçersiz sinema verisi.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payload->'films') > 200 or jsonb_array_length(p_payload->'showtimes') > 6000 then
      raise exception 'Sinema verisi çok büyük.' using errcode = '22023';
    end if;

    select coalesce(array_agg(distinct d.value::date), '{}')
      into v_dates
      from jsonb_array_elements_text(coalesce(p_payload->'dates', '[]'::jsonb)) as d(value)
     where d.value ~ '^\d{4}-\d{2}-\d{2}$';

    -- Films: new values win, missing ones keep what is stored (the "Yakında" list has no age rating, for example).
    for f in
      select *
        from jsonb_to_recordset(p_payload->'films') as x(
          source_key text, slug text, title text, original_title text, poster_url text, duration_min integer,
          genres text[], age_rating text, synopsis text, release_date date, trailer_url text, source_url text,
          directors text[], actors text[])
    loop
      continue when f.source_key is null or char_length(f.source_key) > 200 or nullif(btrim(f.title), '') is null;

      v_slug := left(btrim(regexp_replace(lower(coalesce(f.slug, '')), '[^a-z0-9]+', '-', 'g'), '-'), 80);
      v_slug := btrim(v_slug, '-');
      if v_slug = '' then
        v_slug := 'film-' || left(md5(f.source_key), 8);
      elsif exists (select 1 from public.cinema_films c where c.slug = v_slug and c.source_key <> f.source_key) then
        v_slug := v_slug || '-' || left(md5(f.source_key), 6);
      end if;

      insert into public.cinema_films as c (
        source, source_key, slug, title, original_title, poster_url, duration_min, genres, age_rating, synopsis,
        release_date, trailer_url, source_url, directors, actors, last_seen_at)
      values (
        v_source,
        f.source_key,
        v_slug,
        left(btrim(f.title), 200),
        nullif(left(btrim(coalesce(f.original_title, '')), 200), ''),
        case when f.poster_url ~ '^https://' and char_length(f.poster_url) <= 500 then f.poster_url end,
        case when f.duration_min between 1 and 600 then f.duration_min end,
        coalesce(f.genres[1:6], '{}'),
        nullif(left(btrim(coalesce(f.age_rating, '')), 20), ''),
        nullif(left(btrim(coalesce(f.synopsis, '')), 2000), ''),
        f.release_date,
        case when f.trailer_url ~ '^https://' and char_length(f.trailer_url) <= 500 then f.trailer_url end,
        case when f.source_url ~ '^https://' and char_length(f.source_url) <= 500 then f.source_url end,
        coalesce(f.directors[1:6], '{}'),
        coalesce(f.actors[1:12], '{}'),
        now())
      on conflict (source_key) do update set
        title = excluded.title,
        original_title = coalesce(excluded.original_title, c.original_title),
        poster_url = coalesce(excluded.poster_url, c.poster_url),
        duration_min = coalesce(excluded.duration_min, c.duration_min),
        genres = case when cardinality(excluded.genres) > 0 then excluded.genres else c.genres end,
        age_rating = coalesce(excluded.age_rating, c.age_rating),
        synopsis = coalesce(excluded.synopsis, c.synopsis),
        release_date = coalesce(excluded.release_date, c.release_date),
        trailer_url = coalesce(excluded.trailer_url, c.trailer_url),
        source_url = coalesce(excluded.source_url, c.source_url),
        directors = case when cardinality(excluded.directors) > 0 then excluded.directors else c.directors end,
        actors = case when cardinality(excluded.actors) > 0 then excluded.actors else c.actors end,
        last_seen_at = now();
      v_films := v_films + 1;
    end loop;

    -- Sessions of known films (one row per source_key).
    with s as (
      select distinct on (x.source_key)
             x.source_key, x.film_key, x.starts_at,
             nullif(left(btrim(coalesce(x.format, '')), 40), '') as format,
             case when x.language in ('dublaj', 'altyazi') then x.language end as language,
             nullif(left(btrim(coalesce(x.hall, '')), 60), '') as hall
        from jsonb_to_recordset(p_payload->'showtimes') as x(
          source_key text, film_key text, starts_at timestamptz, format text, language text, hall text)
       where x.source_key is not null and char_length(x.source_key) <= 300 and x.starts_at is not null
       order by x.source_key
    ), up as (
      insert into public.cinema_showtimes as t (film_id, source_key, starts_at, format, language, hall)
      select c.id, s.source_key, s.starts_at, s.format, s.language, s.hall
        from s
        join public.cinema_films c on c.source_key = s.film_key
      on conflict (source_key) do update set
        film_id = excluded.film_id,
        starts_at = excluded.starts_at,
        format = excluded.format,
        language = excluded.language,
        hall = coalesce(excluded.hall, t.hall)
      returning 1
    )
    select count(*) into v_showtimes from up;

    -- Future sessions of the complete days that the source no longer lists (a day runs 05:00-05:00 Istanbul).
    if cardinality(v_dates) > 0 then
      delete from public.cinema_showtimes t
       using public.cinema_films c
       where c.id = t.film_id
         and c.source = v_source
         and t.starts_at > now()
         and ((t.starts_at at time zone 'Europe/Istanbul') - interval '5 hours')::date = any (v_dates)
         and not exists (
           select 1 from jsonb_array_elements(p_payload->'showtimes') as e(value) where e.value->>'source_key' = t.source_key);
      get diagnostics v_removed = row_count;
    end if;

    delete from public.cinema_showtimes t where t.starts_at < now() - interval '2 days';
    get diagnostics v_purged = row_count;
  end if;

  insert into public.cinema_import_runs (source, ok, dates, films, showtimes, removed, error, warnings)
  values (v_source, v_error is null, v_dates, v_films, v_showtimes, v_removed, v_error, v_warnings);

  delete from public.cinema_import_runs x
   where x.id in (select y.id from public.cinema_import_runs y order by y.ran_at desc, y.id desc offset 200);

  -- Two days of failed runs in a row (4 runs): tell the admins once per streak.
  if v_error is not null then
    for r in
      select y.ok from public.cinema_import_runs y where y.source = v_source order by y.ran_at desc, y.id desc limit 10
    loop
      exit when r.ok;
      v_streak := v_streak + 1;
    end loop;
    if v_streak = 4 then
      perform private.notify_admins(
        'cinema_source_failing',
        'Sinema seansları 2 gündür alınamıyor',
        'Son hata: ' || v_error || '. Kaynak sunucuyu engelliyor olabilir; seansları Türkiye bağlantısından yükle.',
        '/admin');
    end if;
  end if;

  return jsonb_build_object('ok', v_error is null, 'films', v_films, 'showtimes', v_showtimes, 'removed', v_removed, 'purged', v_purged);
end $$;

revoke all on function public.cinema_import(jsonb) from public, anon, authenticated;
grant execute on function public.cinema_import(jsonb) to service_role;

-- ===========================================================================
-- 5) Venue setting (seed once; admins may edit it)
-- ===========================================================================
insert into public.app_settings (key, value)
values ('cinema_source', jsonb_build_object(
  'enabled', true,
  'venue', 'Gebze Center AVM',
  'cinema', 'Paribu Cineverse Gebze Center',
  'operator', 'Paribu Cineverse',
  'url', 'https://www.paribucineverse.com/sinemalar/gebze-center',
  'place_slug', 'gebze-center-avm',
  'lat', 40.7954655,
  'lng', 29.4420625))
on conflict (key) do nothing;

-- ===========================================================================
-- 6) Scheduled fetch (same pattern as private.news_refresh_webhook)
-- ===========================================================================
create or replace function private.cinema_refresh_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if exists (select 1 from public.app_settings where key = 'cinema_source' and value->'enabled' = 'false'::jsonb) then
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
    url := 'https://gbzsehir.vercel.app/api/cron/cinema',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;

revoke all on function private.cinema_refresh_webhook() from public, anon, authenticated;

-- 06:20 and 15:20 Istanbul: new days appear in the morning, late sessions are added during the day.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-cinema-refresh';
    perform cron.schedule('gebzem-cinema-refresh', '20 3,12 * * *', 'select private.cinema_refresh_webhook()');
  end if;
end $$;

notify pgrst, 'reload schema';
