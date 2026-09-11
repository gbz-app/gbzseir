-- Kocaeli districts, phase B (the app drops mahalle): the read RPCs the UI and the admin panel still need district data
-- from. ADDITIVE: every existing key and column stays (neighbourhood fields go in phase C), so the deployed app and admin
-- keep working unchanged.
--
-- Already done in 2026091380_kocaeli_districts.sql (checked against the live definitions, nothing to change here):
--   * public.popular_places returns district_id and district_name after neighbourhood_name.
--   * public.global_search carries district_id and district_name in every group that has a place (listings, businesses,
--     pois, events, doctors; 2026091385 kept them). 'services' and 'articles' have no location.
--
--  1) public.admin_user_overview (latest live body, 2026091230_admin_core.sql):
--     * profile.district = name of the home district (profiles.district_id; the row itself already has district_id).
--     * districts = the user's own rows per district: [{id, name, listings, businesses, requests, events}], most rows
--       first; id / name null = rows without a district.
--  2) public.admin_data_health (latest live body, 2026091330_demo_cleanup_v2.sql):
--     * districts.rows = one entry per district (districts.sort order, inactive ones included): {id, name, active,
--       boundary (polygon loaded), businesses, listings, events, poi, requests, users}. All rows are counted (any status,
--       demo included); users = profiles with that home district.
--     * districts.missing = rows without district_id per table (should stay 0; zz_fill_district fills them).
--     * districts.users_without_district = profiles without a home district (optional, so not an error).
--  Same signatures, same jsonb return type and same grants (CREATE OR REPLACE keeps the ACL; restated below).
-- Re-runnable.

-- 1) User overview ----------------------------------------------------------------------------------------------------
create or replace function public.admin_user_overview(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_admin();
  if not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'search_norm' || jsonb_build_object(
        'neighbourhood', (select name from public.neighbourhoods where id = p.neighbourhood_id),
        'district', (select name from public.districts where id = p.district_id),
        'last_sign_in_at', (select last_sign_in_at from auth.users where id = p.id))
      from public.profiles p where p.id = p_user),
    'counts', jsonb_build_object(
      'listings', (select count(*) from public.listings where owner_id = p_user),
      'listings_active', (select count(*) from public.listings where owner_id = p_user and status = 'active'),
      'reviews', (select count(*) from public.reviews where author_id = p_user),
      'requests', (select count(*) from public.service_requests where customer_id = p_user),
      'favorites', (select count(*) from public.favorites where user_id = p_user),
      'reports_made', (select count(*) from public.reports where reporter_id = p_user),
      'reports_against', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p_user),
      'support_messages', (select count(*) from public.contact_messages where user_id = p_user)),
    -- Where the user's content is: their listings, businesses, service requests and events per district.
    'districts', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.district_id, 'name', d.name, 'listings', g.listings, 'businesses', g.businesses,
        'requests', g.requests, 'events', g.events) order by g.total desc, d.sort nulls last), '[]'::jsonb)
      from (select x.district_id,
                   count(*) filter (where x.k = 'listing')::int as listings,
                   count(*) filter (where x.k = 'business')::int as businesses,
                   count(*) filter (where x.k = 'request')::int as requests,
                   count(*) filter (where x.k = 'event')::int as events,
                   count(*)::int as total
              from (select district_id, 'listing'::text as k from public.listings where owner_id = p_user
                    union all
                    select district_id, 'business' from public.businesses where owner_id = p_user
                    union all
                    select district_id, 'request' from public.service_requests where customer_id = p_user
                    union all
                    select district_id, 'event' from public.events where created_by = p_user) x
             group by x.district_id) g
      left join public.districts d on d.id = g.district_id),
    'businesses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status, 'vertical', vertical)), '[]'::jsonb)
      from public.businesses where owner_id = p_user),
    'usage', (select jsonb_build_object(
        'sessions', count(*),
        'page_views', coalesce(sum(page_views), 0),
        'total_s', coalesce(sum(extract(epoch from last_seen_at - started_at))::int, 0),
        'avg_s', coalesce(round(avg(extract(epoch from last_seen_at - started_at)))::int, 0),
        'last_seen_at', max(last_seen_at),
        'devices', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(device, 'bilinmiyor') k, count(*)::int n from public.analytics_sessions where user_id = p_user group by 1) d))
      from public.analytics_sessions where user_id = p_user),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', left(id::text, 8), 'started_at', started_at, 'last_seen_at', last_seen_at,
        'page_views', page_views, 'device', device, 'os', os, 'browser', browser, 'standalone', standalone) order by started_at desc), '[]'::jsonb)
      from (select * from public.analytics_sessions where user_id = p_user order by started_at desc limit 20) s),
    'page_views', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'at', created_at, 'duration_s', duration_s) order by created_at desc), '[]'::jsonb)
      from (select * from public.analytics_page_views where user_id = p_user order by created_at desc limit 60) v),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]'::jsonb)
      from (select path, count(*)::int n from public.analytics_page_views where user_id = p_user group by 1 order by 2 desc limit 8) t),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'action', action, 'summary', summary, 'actor', actor_id, 'details', details) order by created_at desc), '[]'::jsonb)
      from (select * from public.audit_log where user_id = p_user order by created_at desc limit 100) a)
  );
end $$;

-- Same ACL as live: signed-in users (the body checks the admin role) and service_role.
revoke all on function public.admin_user_overview(uuid) from public, anon;
grant execute on function public.admin_user_overview(uuid) to authenticated, service_role;

-- 2) Data health ------------------------------------------------------------------------------------------------------
create or replace function public.admin_data_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'poi', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.kind, x.source, x.license), '[]'::jsonb)
        from (select kind, source, coalesce(license, '') as license, count(*)::int as n, max(updated_at) as last_updated
                from public.poi group by 1, 2, 3) x),
    'places', jsonb_build_object(
      'total', (select count(*) from public.poi where kind = 'place'),
      'curated', (select count(*) from public.poi where kind = 'place' and coalesce((details ->> 'curated')::boolean, false)),
      'with_photos', (select count(*) from public.poi where kind = 'place' and jsonb_array_length(coalesce(details -> 'photos', '[]'::jsonb)) > 0)),
    'duty', jsonb_build_object(
      'total', (select count(*) from public.pharmacy_duty),
      'active_now', (select count(*) from public.pharmacy_duty where duty_start <= now() and duty_end > now()),
      'current_start', (select min(duty_start) from public.pharmacy_duty where duty_start <= now() and duty_end > now()),
      'current_end', (select max(duty_end) from public.pharmacy_duty where duty_start <= now() and duty_end > now()),
      'first_start', (select min(duty_start) from public.pharmacy_duty),
      'last_end', (select max(duty_end) from public.pharmacy_duty),
      'last_fetched_at', (select max(fetched_at) from public.pharmacy_duty),
      'by_source', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
                      from (select source, count(*)::int as n from public.pharmacy_duty group by 1) s),
      'mode', coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo'),
      'demo_job', exists (select 1 from cron.job where jobname = 'gebzem-roll-demo-duty' and active)),
    'news', jsonb_build_object(
      'sources', (select count(*) from public.news_sources),
      'active', (select count(*) from public.news_sources where active),
      'with_error', (select count(*) from public.news_sources where active and last_error is not null),
      'last_fetched_at', (select max(last_fetched_at) from public.news_sources),
      'items', (select count(*) from public.news_items),
      'latest_item_at', (select max(published_at) from public.news_items)),
    'demo', jsonb_build_object(
      'users', (select count(*) from public.profiles where is_demo and role <> 'admin'),
      'demo_admin', (select count(*) from public.profiles where is_demo and role = 'admin'),
      'businesses', (select count(*) from public.businesses where is_demo),
      'listings', (select count(*) from public.listings where is_demo),
      'reviews', (select count(*) from public.reviews where is_demo),
      'announcements', (select count(*) from public.announcements where is_demo),
      'requests', (select count(*) from public.service_requests where is_demo),
      'events', (select count(*) from public.events where is_demo),
      'finance', (select count(*) from public.finance_entries where is_demo),
      'news_articles', (select count(*) from public.news_articles where is_demo),
      'duty', (select count(*) from public.pharmacy_duty where source = 'demo'),
      'poi', (select count(*) from public.poi where source = 'demo')),
    'real_admins', (select count(*) from public.profiles where role = 'admin' and not is_demo and status = 'active'),
    'counts', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'businesses_approved', (select count(*) from public.businesses where status = 'approved'),
      'listings_active', (select count(*) from public.listings where status = 'active'),
      'requests', (select count(*) from public.service_requests),
      'neighbourhoods', (select count(*) from public.neighbourhoods),
      'neighbourhoods_without_center', (select count(*) from public.neighbourhoods where lat is null or lng is null),
      'service_categories', (select count(*) from public.service_categories),
      'sub_categories_without_flow', (
        select count(*) from public.service_categories c
         where c.parent_id is not null
           and not exists (select 1 from public.question_flows f where f.category_id = c.id and f.published)),
      'listing_categories', (select count(*) from public.listing_categories),
      'push_subscriptions', (select count(*) from public.push_subscriptions),
      'notifications_unsent', (select count(*) from public.notifications where push_sent_at is null)),
    -- 2026091386: rows per district (every status, demo included) and rows the district triggers missed.
    'districts', jsonb_build_object(
      'rows', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'name', d.name, 'active', d.active,
          'boundary', exists (select 1 from private.district_boundaries db where db.district_id = d.id),
          'businesses', coalesce(b.n, 0), 'listings', coalesce(l.n, 0), 'events', coalesce(e.n, 0),
          'poi', coalesce(p.n, 0), 'requests', coalesce(r.n, 0), 'users', coalesce(u.n, 0))
          order by d.sort, d.name), '[]'::jsonb)
        from public.districts d
        left join (select district_id, count(*)::int as n from public.businesses group by 1) b on b.district_id = d.id
        left join (select district_id, count(*)::int as n from public.listings group by 1) l on l.district_id = d.id
        left join (select district_id, count(*)::int as n from public.events group by 1) e on e.district_id = d.id
        left join (select district_id, count(*)::int as n from public.poi group by 1) p on p.district_id = d.id
        left join (select district_id, count(*)::int as n from public.service_requests group by 1) r on r.district_id = d.id
        left join (select district_id, count(*)::int as n from public.profiles group by 1) u on u.district_id = d.id),
      'missing', jsonb_build_object(
        'businesses', (select count(*) from public.businesses where district_id is null),
        'listings', (select count(*) from public.listings where district_id is null),
        'events', (select count(*) from public.events where district_id is null),
        'poi', (select count(*) from public.poi where district_id is null),
        'requests', (select count(*) from public.service_requests where district_id is null)),
      'users_without_district', (select count(*) from public.profiles where district_id is null)),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings)
  );
end $$;

-- Same ACL as live.
revoke all on function public.admin_data_health() from public, anon;
grant execute on function public.admin_data_health() to authenticated, service_role;

notify pgrst, 'reload schema';
