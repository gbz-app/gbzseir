-- Security pack: admin RPCs closed to anon, business-applications switch enforced in apply_business,
-- listing caps (new per 24 h and open listings), public_profiles limited to users with public content. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Admin RPCs: signed-in users only (each also checks is_admin()), like the other admin RPCs.
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.admin_online_now() from public, anon;
revoke execute on function public.admin_analytics(int) from public, anon;
revoke execute on function public.admin_user_overview(uuid) from public, anon;
revoke execute on function public.admin_finance_summary(date, date) from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_online_now() to authenticated;
grant execute on function public.admin_analytics(int) to authenticated;
grant execute on function public.admin_user_overview(uuid) to authenticated;
grant execute on function public.admin_finance_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Listing caps (0 turns a cap off).
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('listing_daily_cap', '10'::jsonb),
  ('listing_active_cap', '50'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. apply_business: same as 2026091270_verticals_more.sql, plus new businesses only while
--    feature_business_applications is on (admins always; finishing a pending/rejected one stays allowed, as in the UI).
-- ---------------------------------------------------------------------------
create or replace function public.apply_business(
  p_name text,
  p_kinds text[],
  p_phone text default null,
  p_category_label text default null,
  p_description text default null,
  p_address text default null,
  p_neighbourhood_id uuid default null,
  p_service_category_ids uuid[] default '{}',
  p_service_area_ids uuid[] default '{}',
  p_working_hours jsonb default '{}',
  p_lat double precision default null,
  p_lng double precision default null,
  p_logo_url text default null,
  p_cover_url text default null,
  p_vertical text default null,
  p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.businesses;
  v_phone text;
  v_id uuid;
  v_slug text;
  v_areas uuid[];
  v_kinds text[] := coalesce(p_kinds, '{}');
  v_vertical text := nullif(btrim(coalesce(p_vertical, '')), '');
  v_location extensions.geography;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status = 'banned') then
    raise exception 'Hesabın engelli olduğu için işletme açamazsın' using errcode = '42501', hint = 'banned';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'İşletme adı 2-80 karakter olmalı' using errcode = 'P0001', hint = 'invalid_name';
  end if;
  if v_vertical is not null and v_vertical not in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'diger') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_vertical');
  end if;
  -- Kinds follow the vertical when not given: service firms get leads, everything else is a place customers visit.
  if cardinality(v_kinds) = 0 and v_vertical is not null then
    v_kinds := case when v_vertical = 'hizmet' then array['service'] else array['shop'] end;
  end if;
  if cardinality(v_kinds) = 0 or not (v_kinds <@ array['service', 'shop', 'employer']) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kinds');
  end if;
  v_vertical := coalesce(v_vertical, case when 'service' = any (v_kinds) then 'hizmet' when 'shop' = any (v_kinds) then 'magaza' else 'diger' end);
  v_phone := coalesce(private.phone_e164(p_phone), (select phone from public.profiles where id = v_uid));
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if 'service' = any (v_kinds) and cardinality(coalesce(p_service_category_ids, '{}')) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'categories_required');
  end if;
  v_location := case when p_lat is null or p_lng is null then null
                     else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end;

  if p_business_id is not null then
    select * into v_existing from public.businesses where id = p_business_id and owner_id = v_uid for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if v_existing.status not in ('pending', 'rejected') then
      return jsonb_build_object('ok', false, 'reason', 'not_editable', 'status', v_existing.status);
    end if;
    update public.businesses
       set name = btrim(p_name), kinds = v_kinds, vertical = v_vertical, phone = v_phone, category_label = p_category_label,
           description = p_description, address = p_address, neighbourhood_id = p_neighbourhood_id,
           working_hours = coalesce(p_working_hours, '{}'::jsonb), location = v_location, logo_url = p_logo_url,
           cover_url = coalesce(p_cover_url, cover_url), status = 'approved', approved_at = now(), rejection_reason = null
     where id = v_existing.id
     returning id, slug into v_id, v_slug;
    delete from public.business_service_categories where business_id = v_id;
    delete from public.business_service_areas where business_id = v_id;
  else
    -- Admin switch "Yeni işletme başvuruları" (missing key = closed, like the app default).
    if not public.is_admin()
       and not coalesce((select value = 'true'::jsonb from public.app_settings where key = 'feature_business_applications'), false) then
      raise exception 'Şu an yeni işletme başvurusu alınmıyor' using errcode = 'P0001', hint = 'applications_closed';
    end if;
    -- One new business at a time per user, so parallel calls cannot pass the cap.
    perform pg_advisory_xact_lock(hashtext('apply_business:' || v_uid::text));
    if exists (select 1 from public.businesses where owner_id = v_uid and status = 'suspended') then
      return jsonb_build_object('ok', false, 'reason', 'suspended');
    end if;
    select count(*) into v_count from public.businesses where owner_id = v_uid;
    if v_count >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too_many');
    end if;
    insert into public.businesses (owner_id, name, kinds, vertical, phone, category_label, description, address,
                                   neighbourhood_id, working_hours, location, logo_url, cover_url, status, approved_at)
    values (v_uid, btrim(p_name), v_kinds, v_vertical, v_phone, p_category_label, p_description, p_address,
            p_neighbourhood_id, coalesce(p_working_hours, '{}'::jsonb), v_location, p_logo_url, p_cover_url, 'approved', now())
    returning id, slug into v_id, v_slug;
  end if;

  insert into public.business_service_categories (business_id, category_id)
  select v_id, c.id from public.service_categories c where c.id = any (coalesce(p_service_category_ids, '{}'))
  on conflict do nothing;

  v_areas := coalesce(p_service_area_ids, '{}');
  if cardinality(v_areas) = 0 and p_neighbourhood_id is not null then
    v_areas := array[p_neighbourhood_id];
  end if;
  insert into public.business_service_areas (business_id, neighbourhood_id)
  select v_id, n.id from public.neighbourhoods n where n.id = any (v_areas)
  on conflict do nothing;

  perform private.notify_admins('business_application', 'Yeni işletme yayında: ' || btrim(p_name),
    'İşletme sayfası açıldı. Uygunsuz bir durum varsa askıya alabilirsin.', '/admin/isletmeler');
  return jsonb_build_object('ok', true, 'business_id', v_id, 'slug', v_slug, 'status', 'approved');
end $$;

revoke all on function public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text, uuid) from public, anon;
grant execute on function public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. listings_insert_impl: same as 2026091250_business_open.sql, plus per-user caps for signed-in users
--    (app_settings listing_daily_cap: new listings per 24 h, listing_active_cap: active/pending/paused listings).
-- ---------------------------------------------------------------------------
create or replace function private.listings_insert_impl(p_new public.listings, p_caller text)
returns public.listings
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := p_caller in ('authenticated', 'anon') and not public.is_admin();
  v_cat public.listing_categories;
  v_biz uuid;
  v_days int := private.app_setting_int('listing_days', 30);
  v_daily_cap int;
  v_active_cap int;
begin
  if v_enforce then
    if auth.uid() is null then
      raise exception 'İlan vermek için giriş yapmalısın' using errcode = '42501';
    end if;
    -- One insert at a time per user, so parallel inserts cannot pass the caps.
    perform pg_advisory_xact_lock(hashtext('listings_insert:' || auth.uid()::text));
    v_daily_cap := private.app_setting_int('listing_daily_cap', 10);
    v_active_cap := private.app_setting_int('listing_active_cap', 50);
    if v_daily_cap > 0 and (select count(*) from public.listings
                             where owner_id = auth.uid() and created_at > now() - interval '24 hours') >= v_daily_cap then
      raise exception 'Son 24 saatte en fazla % ilan verebilirsin. Biraz sonra tekrar dene.', v_daily_cap
        using errcode = 'P0001', hint = 'listing_daily_cap';
    end if;
    if v_active_cap > 0 and (select count(*) from public.listings
                              where owner_id = auth.uid() and status in ('active', 'pending_review', 'paused')) >= v_active_cap then
      raise exception 'Aynı anda en fazla % açık ilanın olabilir (yayında, onay bekleyen ve durdurulmuş). Yeni ilan için eskilerinden birini sil ya da satıldı/doldu olarak işaretle.', v_active_cap
        using errcode = 'P0001', hint = 'listing_active_cap';
    end if;
    p_new.owner_id := auth.uid();
    -- The daily cap counts by created_at, so the client cannot backdate it.
    p_new.created_at := now();
    p_new.view_count := 0;
    p_new.call_count := 0;
    p_new.published_at := null;
    p_new.rejection_reason := null;
    p_new.is_demo := false;
    if p_new.status is distinct from 'draft' then
      p_new.status := 'pending_review';
    end if;
  end if;

  select * into v_cat from public.listing_categories where id = p_new.category_id;
  if not found then
    raise exception 'Kategori bulunamadı' using errcode = '23503';
  end if;
  if v_cat.is_banned then
    raise exception 'Bu kategoride ilan verilemez' using errcode = 'P0001', hint = 'banned_category';
  end if;
  if v_cat.type <> p_new.type then
    raise exception 'Kategori ilan türüyle uyuşmuyor' using errcode = 'P0001', hint = 'category_type_mismatch';
  end if;

  if p_new.type = 'job' then
    if p_new.business_id is not null and exists (
         select 1 from public.businesses where id = p_new.business_id and owner_id = p_new.owner_id and status = 'approved') then
      v_biz := p_new.business_id;
    else
      select id into v_biz from public.businesses
       where owner_id = p_new.owner_id and status = 'approved'
       order by created_at
       limit 1;
    end if;
    if v_biz is null then
      raise exception 'İş ilanı yalnız onaylı işletme hesabıyla verilebilir' using errcode = '42501', hint = 'business_required';
    end if;
    p_new.business_id := v_biz;
    p_new.price_try := null;
  else
    p_new.job_work_type := null;
    p_new.job_salary_min := null;
    p_new.job_salary_max := null;
    p_new.job_experience := null;
    p_new.job_benefits := '{}';
    p_new.job_location_label := null;
    if p_new.business_id is not null and not exists (
         select 1 from public.businesses where id = p_new.business_id and owner_id = p_new.owner_id and status = 'approved') then
      p_new.business_id := null;
    end if;
  end if;

  p_new.flags := private.listing_flags(p_new.title, p_new.description);

  if v_enforce and p_new.status = 'pending_review' then
    p_new.status := private.initial_listing_status(p_new.owner_id, p_new.flags);
  end if;

  if p_new.status = 'active' then
    p_new.published_at := coalesce(p_new.published_at, now());
    if v_enforce then
      p_new.expires_at := now() + make_interval(days => v_days);
    end if;
  end if;

  p_new := private.listings_search_fields(p_new);
  p_new.updated_at := now();
  return p_new;
end $$;

-- Called by the security-invoker trigger wrapper, so API roles keep execute (as in 20260910000007).
grant execute on function private.listings_insert_impl(public.listings, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. public_profiles: only users with public content (a published listing, an approved business or a review),
--    plus the caller's own row and every row for admins. Only the columns the app reads (seller card, review author).
-- ---------------------------------------------------------------------------
create index if not exists reviews_author_idx on public.reviews (author_id);

drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
select p.id,
       public.short_name(p.full_name) as display_name,
       p.created_at
  from public.profiles p
 where p.status <> 'banned'
   and (p.id = (select auth.uid())
        or (select public.is_admin())
        or exists (select 1 from public.listings l where l.owner_id = p.id and l.status in ('active', 'sold', 'filled'))
        or exists (select 1 from public.businesses b where b.owner_id = p.id and b.status = 'approved')
        or exists (select 1 from public.reviews r where r.author_id = p.id));
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;
