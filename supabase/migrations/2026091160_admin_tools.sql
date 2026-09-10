-- Gebzem ADMIN module (NN=60): admin-only helpers. Additive and re-runnable.
--   1. storage: admins may write curated media under media/admin/... (place photos)
--   2. admin_publish_flow(): atomic "Yeni sürüm olarak yayınla" for question flows
--   3. admin_request_candidates(): firms the matcher would pick (concierge hand-pick list)
--   4. admin_data_health(): aggregated counts for /admin/veri
--   5. admin_clear_demo_data(): guarded removal of rows marked as demo (never reference data)
--   6. profiles: an admin can never change their own role or status (no self-demotion)

-- ---------------------------------------------------------------------------
-- 1. Storage: media/admin/** for admins (public read already exists; admin delete already exists)
-- ---------------------------------------------------------------------------
drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin update" on storage.objects;
create policy "media admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'admin' and public.is_admin());
create policy "media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'admin' and public.is_admin())
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'admin' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Publish a new question-flow version (published versions are never edited)
-- ---------------------------------------------------------------------------
create or replace function public.admin_publish_flow(p_category_id uuid, p_schema jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
  v_id uuid;
  v_prev int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  -- Serialise concurrent publishes for the same category.
  perform 1 from public.service_categories where id = p_category_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_schema is null or jsonb_typeof(p_schema) <> 'object'
     or jsonb_typeof(p_schema -> 'steps') is distinct from 'array'
     or jsonb_array_length(p_schema -> 'steps') = 0 then
    raise exception 'Soru akışı en az bir adım içermeli.' using errcode = '22023', hint = 'invalid_schema';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.question_flows where category_id = p_category_id;
  update public.question_flows set published = false where category_id = p_category_id and published;
  get diagnostics v_prev = row_count;
  insert into public.question_flows (category_id, version, schema, published)
  values (p_category_id, v_version, p_schema - 'version', true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_version, 'unpublished', v_prev);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Candidate firms for a request (same scoring as dispatch; excludes firms that already have a lead)
-- ---------------------------------------------------------------------------
create or replace function public.admin_request_candidates(p_request_id uuid)
returns table (business_id uuid, business_name text, area_match boolean, score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return query
    select c.business_id, c.business_name, c.area_match, round(c.score, 3)
      from private.match_candidates(p_request_id) c
     order by c.area_match desc, c.score desc
     limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Data health summary
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
                      from (select source, count(*)::int as n from public.pharmacy_duty group by 1) s)),
    'news', jsonb_build_object(
      'sources', (select count(*) from public.news_sources),
      'active', (select count(*) from public.news_sources where active),
      'with_error', (select count(*) from public.news_sources where active and last_error is not null),
      'last_fetched_at', (select max(last_fetched_at) from public.news_sources),
      'items', (select count(*) from public.news_items),
      'latest_item_at', (select max(published_at) from public.news_items)),
    'demo', jsonb_build_object(
      'users', (select count(*) from public.profiles where is_demo and role <> 'admin'),
      'businesses', (select count(*) from public.businesses where is_demo),
      'listings', (select count(*) from public.listings where is_demo),
      'reviews', (select count(*) from public.reviews where is_demo),
      'announcements', (select count(*) from public.announcements where is_demo),
      'requests', (select count(*) from public.service_requests where is_demo),
      'duty', (select count(*) from public.pharmacy_duty where source = 'demo'),
      'poi', (select count(*) from public.poi where source = 'demo')),
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
-- 5. Remove demo rows (is_demo = true / source = 'demo'). Reference data is never touched.
--    Scopes: listings, reviews, announcements, requests, businesses, duty, poi, users.
--    'users' deletes non-admin demo auth users (cascades their remaining rows); the caller is never deleted.
--    Storage files of demo users must be removed by the caller first (Storage API).
-- ---------------------------------------------------------------------------
create or replace function public.admin_clear_demo_data(p_scopes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_n int;
  v_me uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'Temizlenecek veri türü seçilmedi.' using errcode = '22023', hint = 'no_scope';
  end if;
  if exists (select 1 from unnest(p_scopes) s
              where s not in ('listings', 'reviews', 'announcements', 'requests', 'businesses', 'duty', 'poi', 'users')) then
    raise exception 'Geçersiz veri türü.' using errcode = '22023', hint = 'invalid_scope';
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
  if 'businesses' = any (p_scopes) then
    -- Listings that belong to a demo business go with it (they are demo content as well).
    delete from public.listings where business_id in (select id from public.businesses where is_demo);
    delete from public.businesses where is_demo;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('businesses', v_n);
  end if;
  if 'duty' = any (p_scopes) then
    delete from public.pharmacy_duty where source = 'demo';
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('duty', v_n);
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
  return jsonb_build_object('ok', true, 'deleted', v_out);
end $$;

-- ---------------------------------------------------------------------------
-- 6. No self-demotion: an admin cannot change their own role or status through the API.
-- ---------------------------------------------------------------------------
create or replace function private.profiles_no_self_demote()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and new.id = auth.uid() and old.role = 'admin'
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Kendi yetkini ya da hesap durumunu değiştiremezsin.' using errcode = '42501', hint = 'self_demote';
  end if;
  return new;
end $$;
drop trigger if exists profiles_no_self_demote on public.profiles;
create trigger profiles_no_self_demote before update of role, status on public.profiles
  for each row execute function private.profiles_no_self_demote();

-- ---------------------------------------------------------------------------
-- Grants: admin RPCs are callable by signed-in users (each checks is_admin()).
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_publish_flow(uuid, jsonb) from public, anon;
revoke execute on function public.admin_request_candidates(uuid) from public, anon;
revoke execute on function public.admin_data_health() from public, anon;
revoke execute on function public.admin_clear_demo_data(text[]) from public, anon;
revoke execute on function private.profiles_no_self_demote() from public, anon, authenticated;
grant execute on function public.admin_publish_flow(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_request_candidates(uuid) to authenticated, service_role;
grant execute on function public.admin_data_health() to authenticated, service_role;
grant execute on function public.admin_clear_demo_data(text[]) to authenticated, service_role;
