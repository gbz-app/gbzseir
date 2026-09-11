-- Tatil modu that actually works everywhere.
--
-- A business is ON VACATION when:  vacation_mode and (vacation_until is null or vacation_until > now()).
-- vacation_until is optional: the start (00:00 Europe/Istanbul) of the day the business is back. The panel's
-- "Dönüş tarihi" writes it; the daily job below switches the vacation off once that moment has come.
--
-- 1) businesses.vacation_until (owner-editable exactly like vacation_mode: RLS 'owner update', and it is not in
--    private.businesses_write_impl's protected-column list).
-- 2) A small BEFORE trigger that keeps the pair consistent (no return date without vacation; a passed return date
--    ends the vacation on the next write).
-- 3) private.end_expired_vacations() + pg_cron job 'gebzem-end-vacations' (daily 00:01 Istanbul).
-- 4) public.global_search: business objects also return vacation_mode (the ACTIVE state) and vacation_until.
--    Live body (pg_get_functiondef, 2026-09-11) kept identical apart from that one select line.

-- ---------------------------------------------------------------------------
-- 1) Column + grants
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists vacation_until timestamptz;

comment on column public.businesses.vacation_until is
  'Tatil modu return date: start (00:00 Europe/Istanbul) of the day the business is back. Null = open-ended. Only meaningful while vacation_mode is true.';

-- The table-level SELECT/UPDATE grants already cover the new column; explicit column grants keep it readable and
-- owner-editable even if those table grants are narrowed to column lists later.
grant select (vacation_until) on public.businesses to anon, authenticated;
grant update (vacation_until) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Keep vacation_mode / vacation_until consistent on every write
-- ---------------------------------------------------------------------------
create or replace function private.businesses_vacation_impl()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A return date that has already started ends the vacation.
  if new.vacation_until is not null and new.vacation_until <= now() then
    new.vacation_mode := false;
  end if;
  -- No return date without a vacation.
  if not coalesce(new.vacation_mode, false) then
    new.vacation_until := null;
  end if;
  return new;
end $$;

revoke all on function private.businesses_vacation_impl() from public, anon, authenticated;

drop trigger if exists businesses_vacation on public.businesses;
create trigger businesses_vacation
  before insert or update on public.businesses
  for each row execute function private.businesses_vacation_impl();

-- ---------------------------------------------------------------------------
-- 3) Daily job: switch off vacations whose return date has come
-- ---------------------------------------------------------------------------
create or replace function private.end_expired_vacations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.businesses
     set vacation_mode = false, vacation_until = null
   where vacation_mode
     and vacation_until is not null
     and vacation_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function private.end_expired_vacations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-end-vacations';
    -- pg_cron runs in GMT: 21:01 UTC = 00:01 Europe/Istanbul, right after a return date begins.
    perform cron.schedule('gebzem-end-vacations', '1 21 * * *', 'select private.end_expired_vacations()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) global_search: + vacation_mode (active state) and vacation_until in business objects
-- ---------------------------------------------------------------------------
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
         where p.kind in ('place', 'pharmacy', 'mosque') and not p.hidden and public.tr_match(p.search_norm, q.q)
         order by (p.kind = 'place') desc, extensions.similarity(p.search_norm, q.q) desc, p.name
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
