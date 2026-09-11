-- Search page (stage 45): anonymous search statistics, popular searches, popular places, more poi kinds in global search.
-- a) public.search_terms_daily (term, day, hits): only the aggregate is stored, no user id, session or ip.
--    private.search_term_marks: per-caller-per-day dedupe (hashed user id or the daily ip hash), dropped after 2 days.
-- b) public.log_search(p_term): anon + authenticated. Normalises, drops phone numbers, e-mails and links, counts one
--    caller once per term per day and at most 30 terms per caller per day.
-- c) public.popular_searches(p_limit): top terms of the last 14 days (hits >= 3, 2+ callers on one day), then the
--    admin-curated app_settings 'popular_searches' list (seeded below).
-- d) public.popular_places(p_limit): most viewed firm and gezilecek yer pages of the last 30 days (aggregates of
--    analytics_page_views), filled up with curated places and businesses.
-- e) global_search: the pois group also finds bus stops, taxi stands and ATMs (live body otherwise unchanged,
--    vacation fields included).
-- f) private.cleanup_analytics: also drops old marks and search terms (analytics_retention_days).
-- Re-runnable.


-- a) tables ---------------------------------------------------------------------------------------------------------------
create table if not exists public.search_terms_daily (
  term text not null check (char_length(term) between 2 and 60),
  day date not null,
  hits int not null default 0 check (hits >= 0),
  primary key (term, day)
);
create index if not exists search_terms_daily_day_idx on public.search_terms_daily (day);
comment on table public.search_terms_daily is
  'Anonymous search statistics: how many callers searched a term on a day. No user id, session or ip (KVKK). Written only by log_search.';

alter table public.search_terms_daily enable row level security;
-- Supabase default privileges grant new public tables to anon/authenticated: take them back. Reads go through the
-- SECURITY DEFINER RPCs below; the admin policy only documents who may read it if a grant is ever added.
revoke all on table public.search_terms_daily from public, anon, authenticated;
drop policy if exists "admin read" on public.search_terms_daily;
create policy "admin read" on public.search_terms_daily
  for select to authenticated
  using (public.is_admin());

create table if not exists private.search_term_marks (
  day date not null,
  caller text not null,
  term text not null,
  primary key (day, caller, term)
);
comment on table private.search_term_marks is
  'Per-caller-per-day dedupe for log_search (caller = sha256 of the user id + day, or the daily ip hash). Kept 2 days.';
alter table private.search_term_marks enable row level security;
revoke all on table private.search_term_marks from public, anon, authenticated;


-- b) log_search --------------------------------------------------------------------------------------------------------------
create or replace function public.log_search(p_term text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_term text;
  v_caller text;
  v_n int;
begin
  -- Turkish lower case: İ -> i and I -> ı first (en_US lower('İ') would add a combining dot), then one space.
  v_term := lower(translate(left(coalesce(p_term, ''), 200), 'İI', 'iı'));
  v_term := btrim(regexp_replace(regexp_replace(v_term, '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_term) < 2 or char_length(v_term) > 60 then
    return;
  end if;
  -- Phone and TC numbers (7+ digits in total), e-mails and links are never stored.
  if char_length(regexp_replace(v_term, '[^0-9]', '', 'g')) >= 7
     or position('@' in v_term) > 0
     or v_term ~ '(://|www\.|https?:)' then
    return;
  end if;
  -- Letters, digits and a few separators only (no emoji, markup or symbols in the popular list).
  if v_term !~ '^[[:alnum:]][[:alnum:] .,&/+''-]*$' then
    return;
  end if;
  -- Nobody to count it against, or a banned account: drop it.
  if v_uid is null and v_ip is null then
    return;
  end if;
  if v_uid is not null and private.is_banned(v_uid) then
    return;
  end if;

  v_caller := case
    when v_uid is not null then 'u:' || encode(extensions.digest(v_uid::text || '|' || v_day::text || '|gebzem-search', 'sha256'), 'hex')
    else 'ip:' || v_ip
  end;

  -- One lock per caller: parallel calls cannot overshoot the daily cap.
  perform pg_advisory_xact_lock(hashtext('search:' || v_caller));
  select count(*) into v_n from private.search_term_marks where day = v_day and caller = v_caller;
  if v_n >= 30 then
    return;
  end if;

  insert into private.search_term_marks (day, caller, term) values (v_day, v_caller, v_term)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return; -- this caller already counted this term today
  end if;

  insert into public.search_terms_daily as t (term, day, hits) values (v_term, v_day, 1)
  on conflict (term, day) do update set hits = t.hits + 1;
end $$;
revoke all on function public.log_search(text) from public, anon, authenticated;
grant execute on function public.log_search(text) to anon, authenticated;


-- c) popular_searches ---------------------------------------------------------------------------------------------------------
-- Logged terms need 3+ hits in 14 days AND 2+ different callers on the same day (one person repeating a search on
-- several days never surfaces it). The admin list fills the rest, in its own order; duplicates (tr_norm) collapse.
-- app_settings 'popular_searches_hidden' (Admin > Ayarlar > Arama): logged terms containing one of these words /
-- phrases (whole words, tr_norm) are never shown.
create or replace function public.popular_searches(p_limit int default 8)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with lim as (select greatest(1, least(coalesce(p_limit, 8), 20)) as n),
  hidden as (
    select public.tr_norm(e.value) as norm
      from public.app_settings s
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) as e(value)
     where s.key = 'popular_searches_hidden'
       and char_length(public.tr_norm(e.value)) >= 2
  ),
  logged as (
    select t.term, sum(t.hits)::bigint as hits
      from public.search_terms_daily t
     where t.day >= (now() at time zone 'Europe/Istanbul')::date - 13
       and not exists (
         select 1 from hidden h
          where position(' ' || h.norm || ' ' in ' ' || public.tr_norm(t.term) || ' ') > 0)
     group by t.term
    having sum(t.hits) >= 3 and max(t.hits) >= 2
  ),
  curated as (
    select btrim(e.value) as term, e.ord
      from public.app_settings s
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) with ordinality as e(value, ord)
     where s.key = 'popular_searches'
       and char_length(btrim(e.value)) between 2 and 60
  ),
  merged as (
    select l.term, 0 as src, l.hits as score, 0::bigint as ord from logged l
    union all
    select c.term, 1, 0::bigint, c.ord from curated c
  ),
  dedup as (
    select distinct on (public.tr_norm(m.term)) m.term, m.src, m.score, m.ord
      from merged m
     order by public.tr_norm(m.term), m.src, m.score desc, m.ord
  ),
  top as (
    select d.term, d.src, d.score, d.ord from dedup d
     order by d.src, d.score desc, d.ord, d.term
     limit (select n from lim)
  )
  select coalesce(array_agg(top.term order by top.src, top.score desc, top.ord, top.term), '{}'::text[]) from top
$$;
revoke all on function public.popular_searches(int) from public, anon, authenticated;
grant execute on function public.popular_searches(int) to anon, authenticated;


-- d) popular_places -------------------------------------------------------------------------------------------------------
-- Ranking: distinct sessions that opened /firma/<slug> or /gezilecek-yerler/<slug> in the last 30 days (the owner's own
-- visits to their business do not count; 2+ sessions needed to rank). Everything else follows in fallback order:
-- curated places / businesses with a cover first, alternating the two kinds. Returns no counts.
create or replace function public.popular_places(p_limit int default 10)
returns table (
  kind text,
  id uuid,
  slug text,
  name text,
  category text,
  label text,
  image_url text,
  neighbourhood_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with lim as (select greatest(1, least(coalesce(p_limit, 10), 20)) as n),
  recent as (
    select v.path, v.user_id, coalesce(v.session_id::text, v.id::text) as sess
      from public.analytics_page_views v
     where v.created_at > now() - interval '30 days'
       and v.path ~ '^/(firma|gezilecek-yerler)/[a-z0-9-]+$'
  ),
  biz_views as (
    select b.id, count(distinct r.sess) as n
      from recent r
      join public.businesses b on r.path = '/firma/' || b.slug
     where r.user_id is distinct from b.owner_id
     group by b.id
  ),
  place_views as (
    select p.id, count(distinct r.sess) as n
      from recent r
      join public.poi p on p.kind = 'place' and r.path = '/gezilecek-yerler/' || p.slug
     group by p.id
  ),
  cand as (
    select 'business'::text as kind, b.id, b.slug, b.name, b.vertical as category, b.category_label as label,
           coalesce(b.cover_url, b.logo_url) as image_url, n.name as neighbourhood_name,
           coalesce(bv.n, 0) as views,
           row_number() over (order by (b.cover_url is null), b.is_demo, b.verification_level desc,
                                       b.rating_count desc, b.rating_avg desc nulls last, b.name) as fb
      from public.businesses b
      left join biz_views bv on bv.id = b.id
      left join public.neighbourhoods n on n.id = b.neighbourhood_id
     where b.status = 'approved' and not private.is_banned(b.owner_id)
    union all
    select 'place'::text, p.id, p.slug, p.name, p.details ->> 'category', null::text,
           p.details #>> '{photos,0,url}', n.name,
           coalesce(pv.n, 0),
           -- coalesce: a place without the key would compare as null and sort first in "desc".
           row_number() over (order by coalesce((p.details -> 'curated') = 'true'::jsonb, false) desc,
                                       (p.details #>> '{photos,0,url}') is null, p.name)
      from public.poi p
      left join place_views pv on pv.id = p.id
      left join public.neighbourhoods n on n.id = p.neighbourhood_id
     where p.kind = 'place' and not p.hidden
  )
  select c.kind, c.id, c.slug, c.name, c.category, c.label, c.image_url, c.neighbourhood_name
    from cand c
   order by case when c.views >= 2 then c.views else 0 end desc, c.fb, c.kind desc
   limit (select n from lim)
$$;
revoke all on function public.popular_places(int) from public, anon, authenticated;
grant execute on function public.popular_places(int) to anon, authenticated;


-- e) global_search: pois group also finds bus stops, taxi stands and ATMs ----------------------------------------------------
-- Live body (md5 612144422c40cfe4847678a0b39f3350, with the vacation fields) with only the pois group changed: the new
-- kinds rank after places / pharmacies / mosques so a name search still shows those first.
CREATE OR REPLACE FUNCTION public.global_search(p_q text, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (select public.tr_norm(p_q) as q, greatest(1, least(coalesce(p_limit, 5), 20)) as lim)
  select case when char_length((select q from q)) < 2 then
    jsonb_build_object('listings', '[]'::jsonb, 'businesses', '[]'::jsonb, 'services', '[]'::jsonb, 'pois', '[]'::jsonb,
                       'events', '[]'::jsonb, 'articles', '[]'::jsonb)
  else jsonb_build_object(
    'listings', coalesce((
      select jsonb_agg(x) from (
        select l.id, l.type, l.title, l.price_try, l.published_at, l.job_location_label,
               c.name as category_name, n.name as neighbourhood_name,
               (select m.thumb_url from public.listing_media m where m.listing_id = l.id order by m.sort limit 1) as thumb_url
          from public.listings l
          left join public.listing_categories c on c.id = l.category_id
          left join public.neighbourhoods n on n.id = l.neighbourhood_id, q
         where l.status = 'active' and l.expires_at > now()
           and (public.tr_match(l.search_norm, q.q) or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, q.q))
         order by extensions.similarity(l.search_norm, q.q) desc, l.published_at desc
         limit (select lim from q)) x), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(x) from (
        select b.id, b.slug, b.name, b.category_label, b.logo_url, b.rating_avg, b.rating_count, b.verification_level, b.kinds,
               n.name as neighbourhood_name,
               (b.vacation_mode and (b.vacation_until is null or b.vacation_until > now())) as vacation_mode, b.vacation_until
          from public.businesses b
          left join public.neighbourhoods n on n.id = b.neighbourhood_id, q
         where b.status = 'approved' and public.tr_match(b.search_norm, q.q)
         order by extensions.similarity(b.search_norm, q.q) desc, b.rating_avg desc
         limit (select lim from q)) x), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(x) from (
        select s.id, s.slug, s.name, s.icon, s.parent_id, pc.name as parent_name, pc.slug as parent_slug
          from public.service_categories s
          left join public.service_categories pc on pc.id = s.parent_id, q
         where s.active and public.tr_match(s.search_norm, q.q)
         order by (s.parent_id is not null) desc, extensions.similarity(s.search_norm, q.q) desc, s.sort
         limit (select lim from q)) x), '[]'::jsonb),
    'pois', coalesce((
      select jsonb_agg(x) from (
        select p.id, p.kind, p.slug, p.name, p.address, p.lat, p.lng, n.name as neighbourhood_name,
               p.details ->> 'category' as category
          from public.poi p
          left join public.neighbourhoods n on n.id = p.neighbourhood_id, q
         where p.kind in ('place', 'pharmacy', 'mosque', 'bus_stop', 'taxi', 'atm') and not p.hidden
           and public.tr_match(p.search_norm, q.q)
         order by (p.kind = 'place') desc, (p.kind in ('bus_stop', 'taxi', 'atm')),
                  extensions.similarity(p.search_norm, q.q) desc, p.name
         limit (select lim from q)) x), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(x) from (
        select e.id, e.slug, e.title, e.category, e.starts_at, e.ends_at, e.venue_name, e.cover_url, e.is_demo,
               n.name as neighbourhood_name
          from public.events e
          cross join q
          cross join lateral (
            select public.tr_norm(e.title || ' ' || coalesce(e.venue_name, '') || ' ' || e.category) as norm) t
          left join public.neighbourhoods n on n.id = e.neighbourhood_id
         where e.status = 'published' and e.slug is not null
           and (e.ends_at >= now() or (e.ends_at is null and e.starts_at >= now() - interval '3 hours'))
           and (e.business_id is null or public.business_is_public(e.business_id))
           and public.tr_match(t.norm, q.q)
         order by extensions.similarity(t.norm, q.q) desc, e.starts_at
         limit (select lim from q)) x), '[]'::jsonb),
    'articles', coalesce((
      select jsonb_agg(x) from (
        select a.id, a.slug, a.title, a.summary, a.category, a.cover_url, a.published_at
          from public.news_articles a
          cross join q
          cross join lateral (select public.tr_norm(a.title || ' ' || coalesce(a.summary, '')) as norm) t
         where a.status = 'published' and a.published_at is not null and a.published_at <= now()
           and public.tr_match(t.norm, q.q)
         order by extensions.similarity(t.norm, q.q) desc, a.published_at desc
         limit (select lim from q)) x), '[]'::jsonb)
  ) end
$function$;
-- Grants unchanged (CREATE OR REPLACE keeps the ACL); restated for a fresh database.
revoke execute on function public.global_search(text, int) from public;
grant execute on function public.global_search(text, int) to anon, authenticated, service_role;


-- f) retention -------------------------------------------------------------------------------------------------------------
-- Live body plus the two search deletes at the end.
CREATE OR REPLACE FUNCTION private.cleanup_analytics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days int := private.app_setting_int('analytics_retention_days', 180);
begin
  delete from public.analytics_page_views where created_at < now() - make_interval(days => v_days);
  delete from public.analytics_sessions where last_seen_at < now() - make_interval(days => v_days);
  delete from public.contact_events where created_at < now() - make_interval(days => v_days);
  update public.analytics_sessions set ip_hash = null where ip_hash is not null and started_at < now() - interval '2 days';
  update public.app_installs set ip_hash = null where ip_hash is not null and created_at < now() - interval '2 days';
  update public.contact_events set ip_hash = null where ip_hash is not null and created_at < now() - interval '2 days';
  delete from private.listing_view_marks where view_day < (now() at time zone 'Europe/Istanbul')::date - 1;
  delete from private.search_term_marks where day < (now() at time zone 'Europe/Istanbul')::date - 1;
  delete from public.search_terms_daily where day < (now() at time zone 'Europe/Istanbul')::date - v_days;
end $function$;


-- Seed: the admin-editable popular searches (Admin > Ayarlar > Arama). Kept when the admin already set it.
insert into public.app_settings (key, value, updated_at)
values ('popular_searches',
        '["Nöbetçi eczane", "Döner", "Kuaför", "Tesisatçı", "Kafe", "Otel", "Taksi", "Halı saha", "Kahvaltı", "Oto yıkama"]'::jsonb,
        now())
on conflict (key) do nothing;
