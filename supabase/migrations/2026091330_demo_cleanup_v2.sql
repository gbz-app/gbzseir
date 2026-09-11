-- Demo cleanup v2 (audit step 18). Re-runnable.
--   1. admin_clear_demo_data(): new scopes events, finance, news_articles, demo_admin.
--      'businesses' also removes demo events and finance rows (their FKs are ON DELETE SET NULL).
--      'duty' also stops the demo roll: duty_data_mode 'demo' becomes 'off' ('live' stays) and the
--      gebzem-roll-demo-duty cron job is unscheduled.
--      'demo_admin' removes demo admin accounts, only while a real (non-demo, active) admin exists.
--   2. admin_data_health(): demo counts for events, finance, news_articles and demo admins,
--      real_admins, and whether the demo duty job is still scheduled.
-- Demo photos under media/demo/ are removed by the caller (Storage API) after the 'businesses' scope.

-- ---------------------------------------------------------------------------
-- 1. Remove demo rows (is_demo = true / source = 'demo'). Reference data is never touched.
--    'users' deletes non-admin demo auth users; 'demo_admin' deletes demo admins. The caller is never deleted.
-- ---------------------------------------------------------------------------
create or replace function public.admin_clear_demo_data(p_scopes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_n int;
  v_me uuid := auth.uid();
  v_job bigint;
  v_stopped boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'Temizlenecek veri türü seçilmedi.' using errcode = '22023', hint = 'no_scope';
  end if;
  if exists (select 1 from unnest(p_scopes) s
              where s is null
                 or s not in ('listings', 'reviews', 'announcements', 'requests', 'businesses', 'events', 'finance',
                              'news_articles', 'duty', 'poi', 'users', 'demo_admin')) then
    raise exception 'Geçersiz veri türü.' using errcode = '22023', hint = 'invalid_scope';
  end if;
  -- Checked before anything is deleted: the panel must keep at least one real admin.
  if 'demo_admin' = any (p_scopes)
     and not exists (select 1 from public.profiles where role = 'admin' and not is_demo and status = 'active') then
    raise exception 'Örnek yönetici hesabı, gerçek bir yönetici hesabı olmadan silinemez.' using errcode = '22023', hint = 'no_real_admin';
  end if;

  if 'listings' = any (p_scopes) then
    delete from public.listings where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('listings', v_n);
  end if;
  if 'reviews' = any (p_scopes) then
    delete from public.reviews where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('reviews', v_n);
  end if;
  if 'announcements' = any (p_scopes) then
    delete from public.announcements where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('announcements', v_n);
  end if;
  if 'requests' = any (p_scopes) then
    delete from public.service_requests where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('requests', v_n);
  end if;
  -- Demo events and finance rows go with the demo businesses (otherwise they stay behind without a business).
  if 'events' = any (p_scopes) or 'businesses' = any (p_scopes) then
    delete from public.events where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('events', v_n);
  end if;
  if 'finance' = any (p_scopes) or 'businesses' = any (p_scopes) then
    delete from public.finance_entries where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('finance', v_n);
  end if;
  if 'businesses' = any (p_scopes) then
    -- Listings that belong to a demo business go with it (they are demo content as well) and count as listings.
    delete from public.listings where business_id in (select id from public.businesses where is_demo);
    get diagnostics v_n = row_count;
    if v_n > 0 or 'listings' = any (p_scopes) then
      v_out := v_out || jsonb_build_object('listings', coalesce((v_out ->> 'listings')::int, 0) + v_n);
    end if;
    delete from public.businesses where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('businesses', v_n);
  end if;
  if 'news_articles' = any (p_scopes) then
    delete from public.news_articles where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('news_articles', v_n);
  end if;
  if 'duty' = any (p_scopes) then
    delete from public.pharmacy_duty where source = 'demo';
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('duty', v_n);
    -- Stop the demo roll: 'demo' (or a missing key) becomes 'off'; 'live' and 'off' stay as they are.
    insert into public.app_settings (key, value, updated_at) values ('duty_data_mode', '"off"'::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
      where public.app_settings.value = '"demo"'::jsonb;
    for v_job in select jobid from cron.job where jobname = 'gebzem-roll-demo-duty' loop
      perform cron.unschedule(v_job);
      v_stopped := true;
    end loop;
    v_extra := v_extra || jsonb_build_object(
      'duty_mode', (select value #>> '{}' from public.app_settings where key = 'duty_data_mode'),
      'duty_cron_stopped', v_stopped);
  end if;
  if 'poi' = any (p_scopes) then
    delete from public.poi where source = 'demo';
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('poi', v_n);
  end if;
  if 'users' = any (p_scopes) then
    delete from auth.users
     where id in (select id from public.profiles where is_demo and role <> 'admin')
       and id is distinct from v_me;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('users', v_n);
  end if;
  if 'demo_admin' = any (p_scopes) then
    delete from auth.users
     where id in (select id from public.profiles where is_demo and role = 'admin')
       and id is distinct from v_me;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('demo_admin', v_n);
  end if;
  return jsonb_build_object('ok', true, 'deleted', v_out) || v_extra;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Data health summary (same as 2026091160_admin_tools.sql, plus the new demo counts)
-- ---------------------------------------------------------------------------
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
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grants (unchanged): admin RPCs are callable by signed-in users (each checks is_admin()).
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_data_health() from public, anon;
revoke execute on function public.admin_clear_demo_data(text[]) from public, anon;
grant execute on function public.admin_data_health() to authenticated, service_role;
grant execute on function public.admin_clear_demo_data(text[]) to authenticated, service_role;
