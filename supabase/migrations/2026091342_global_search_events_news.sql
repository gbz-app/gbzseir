-- Global search also finds events and our own news articles (audit step 28).
--  * 'events': published and not ended yet (no end time: kept for 3 hours after the start, same as /etkinlikler) and the
--    organizer business is public (approved, owner not banned).
--  * 'articles': published news_articles (published_at reached).
-- The other groups are the latest body from 2026091335_poi_admin.sql (poi.hidden filter kept). Still SECURITY INVOKER, so
-- RLS (banned owners, hidden poi) applies as before. Re-runnable.

-- Global search. Returns {listings:[...], businesses:[...], services:[...], pois:[...], events:[...], articles:[...]}
create or replace function public.global_search(p_q text, p_limit int default 5)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
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
               n.name as neighbourhood_name
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
$$;

-- Grants unchanged (public RPC for guests).
revoke execute on function public.global_search(text, int) from public;
grant execute on function public.global_search(text, int) to anon, authenticated, service_role;
