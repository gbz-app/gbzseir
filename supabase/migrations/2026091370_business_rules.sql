-- Business rules (2026-09-11).
--
-- a) "Personel arıyorum" is gone: every approved business can post job ads (listings_insert_impl only checks
--    status = 'approved', unchanged). 'employer' is stripped from businesses.kinds and from apply_business input.
--    The kinds check constraint keeps 'employer' so older clients do not fail.
-- b) One business per account: app_settings 'business_max_per_owner' (default 1) + profiles.extra_business_slots
--    (admin-granted, protected from self-edit). apply_business raises hint 'business_limit' when the caller already
--    owns that many businesses (every status counts; there is no 'deleted' status). Existing owners above the limit
--    keep their businesses; only NEW businesses are refused.
--    public.my_business_quota() tells the app {count, limit, can_add}; public.admin_grant_business_slot() gives
--    (or takes back) extra slots, audits and notifies.
-- c) İşletme türü kilitli: private.businesses_write_impl refuses vertical / kinds changes from API callers that are
--    not admins (hint 'vertical_locked'); apply_business keeps the stored type when an unfinished business is
--    resubmitted. The one live row with vertical NULL (kinds {service}) is backfilled to 'hizmet'.
--    public.admin_set_business_vertical() is the only way to change a type (admin, audited, owner notified).
--
-- Replaced functions keep their signature, SECURITY DEFINER, search_path and ACL (CREATE OR REPLACE keeps the ACL).
-- Bodies are the live pg_get_functiondef output (2026-09-11) with only the marked changes.
-- businesses.vacation_until and the businesses_vacation trigger (2026091366) are not touched.


-- ---------------------------------------------------------------------------------------------------------------------
-- b) profiles.extra_business_slots + protection
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists extra_business_slots integer not null default 0;
alter table public.profiles drop constraint if exists profiles_extra_business_slots_check;
alter table public.profiles add constraint profiles_extra_business_slots_check check (extra_business_slots between 0 and 50);

comment on column public.profiles.extra_business_slots is
  'Businesses this account may open on top of app_settings.business_max_per_owner. Set only by admins (admin_grant_business_slot).';

-- Live body + extra_business_slots in the protected list.
CREATE OR REPLACE FUNCTION private.profiles_protect_impl(p_new profiles, p_old profiles, p_caller text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if p_caller in ('authenticated', 'anon') and not public.is_admin() then
    p_new.id := p_old.id;
    p_new.phone := p_old.phone;
    p_new.role := p_old.role;
    p_new.status := p_old.status;
    p_new.trusted_publisher := p_old.trusted_publisher;
    p_new.is_demo := p_old.is_demo;
    p_new.created_at := p_old.created_at;
    p_new.extra_business_slots := p_old.extra_business_slots;
  end if;
  p_new.updated_at := now();
  return p_new;
end $function$;


-- ---------------------------------------------------------------------------------------------------------------------
-- b) app setting (label first, so the audit row of the insert reads well)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.audit_setting_label(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(case p_key
    when 'feature_business_applications' then 'Yeni işletme başvuruları'
    when 'business_max_per_owner' then 'Hesap başına işletme sayısı'
    when 'maintenance_banner' then 'Duyuru bandı'
    when 'support_phone' then 'Destek telefonu'
    when 'support_email' then 'Destek e-postası'
    when 'listing_days' then 'İlan yayın süresi (gün)'
    when 'first_listings_moderated' then 'Onaya düşen ilk ilan sayısı'
    when 'listing_daily_cap' then 'Günlük ilan sınırı'
    when 'listing_active_cap' then 'Açık ilan sınırı'
    when 'max_providers_default' then 'Bir talebe en fazla firma'
    when 'request_redispatch_hours' then 'Yanıtsız talebi yeniden gönderme (saat)'
    when 'analytics_retention_days' then 'Analitik saklama süresi (gün)'
    when 'audit_retention_days' then 'İşlem kaydı saklama süresi (gün)'
    when 'duty_data_mode' then 'Nöbet listesi verisi'
    when 'otp_demo_mode' then 'Demo giriş modu'
  end, p_key)
$function$;

insert into public.app_settings (key, value) values ('business_max_per_owner', '1'::jsonb)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------------------------------------------------
-- a) + c) data cleanup (runs as the migration role: the write guard does not apply)
-- ---------------------------------------------------------------------------------------------------------------------
-- The one employer-only row (demo, vertical diger) gets the kind its vertical implies, so kinds never becomes empty.
update public.businesses
   set kinds = case when vertical = 'hizmet' then array['service'] else array['shop'] end
 where kinds <@ array['employer'];

update public.businesses
   set kinds = array_remove(kinds, 'employer')
 where 'employer' = any (kinds);

-- Same mapping as resolveVertical() / apply_business (live: 1 row, kinds {service} -> hizmet).
update public.businesses
   set vertical = case when 'service' = any (kinds) then 'hizmet' when 'shop' = any (kinds) then 'magaza' else 'diger' end
 where vertical is null;


-- ---------------------------------------------------------------------------------------------------------------------
-- c) type lock in the write guard
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.businesses_write_impl(p_new businesses, p_old businesses, p_op text, p_caller text)
 RETURNS businesses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_enforce boolean := p_caller in ('authenticated', 'anon') and not public.is_admin();
  v_base text;
  v_slug text;
  i int := 1;
begin
  if p_op = 'INSERT' then
    if v_enforce then
      p_new.owner_id := auth.uid();
      p_new.status := 'pending';
      p_new.verification_level := 0;
      p_new.rating_avg := 0;
      p_new.rating_count := 0;
      p_new.leads_accepted_count := 0;
      p_new.approved_at := null;
      p_new.rejection_reason := null;
      p_new.is_demo := false;
      p_new.slug := null;
    end if;
    if p_new.slug is null or p_new.slug = '' then
      v_base := coalesce(nullif(public.tr_slug(p_new.name), ''), 'isletme');
      v_slug := v_base;
      while exists (select 1 from public.businesses where slug = v_slug) loop
        i := i + 1;
        v_slug := v_base || '-' || i;
      end loop;
      p_new.slug := v_slug;
    end if;
  else
    if v_enforce then
      -- 2026091370: the business type is locked; admins change it with admin_set_business_vertical.
      -- 'employer' is legacy and ignored in the comparison (the stored kinds are always kept).
      if p_new.vertical is distinct from p_old.vertical
         or not (coalesce(array_remove(p_new.kinds, 'employer'), '{}') @> coalesce(array_remove(p_old.kinds, 'employer'), '{}')
                 and coalesce(array_remove(p_new.kinds, 'employer'), '{}') <@ coalesce(array_remove(p_old.kinds, 'employer'), '{}')) then
        raise exception 'İşletme türü değiştirilemez. Değiştirmek için destek ekibine yaz.' using errcode = 'P0001', hint = 'vertical_locked';
      end if;
      p_new.kinds := p_old.kinds;
      p_new.id := p_old.id;
      p_new.owner_id := p_old.owner_id;
      p_new.status := p_old.status;
      p_new.verification_level := p_old.verification_level;
      p_new.rating_avg := p_old.rating_avg;
      p_new.rating_count := p_old.rating_count;
      p_new.leads_accepted_count := p_old.leads_accepted_count;
      p_new.approved_at := p_old.approved_at;
      p_new.rejection_reason := p_old.rejection_reason;
      p_new.is_demo := p_old.is_demo;
      p_new.created_at := p_old.created_at;
      p_new.slug := p_old.slug;
      -- A rejected application that is edited goes back to review.
      if p_old.status = 'rejected' then
        p_new.status := 'pending';
        p_new.rejection_reason := null;
      end if;
    end if;
    p_new.updated_at := now();
  end if;
  p_new.phone := coalesce(private.phone_e164(p_new.phone), case when p_new.phone ~ '^\+\d{10,15}$' then p_new.phone end);
  p_new.search_norm := public.tr_norm(p_new.name || ' ' || coalesce(p_new.category_label, '') || ' ' || coalesce(p_new.description, ''));
  return p_new;
end $function$;


-- ---------------------------------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function private.business_vertical_label(p_vertical text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_vertical
    when 'yemek' then 'Yemek' when 'restoran' then 'Restoran' when 'kafe' then 'Kafe' when 'otel' then 'Otel'
    when 'hizmet' then 'Hizmet' when 'magaza' then 'Mağaza' when 'saglik' then 'Sağlık' when 'dugun' then 'Düğün'
    when 'egitim' then 'Eğitim' when 'etkinlik' then 'Etkinlik' when 'diger' then 'Diğer'
    else coalesce(p_vertical, 'Belirsiz')
  end
$$;
revoke all on function private.business_vertical_label(text) from public, anon, authenticated;

-- How many businesses the user may own in total (setting + admin-granted slots).
create or replace function private.business_limit_for(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, private.app_setting_int('business_max_per_owner', 1))
       + coalesce((select p.extra_business_slots from public.profiles p where p.id = p_uid), 0)
$$;
revoke all on function private.business_limit_for(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------------------------------------------------
-- a) b) c) apply_business (live body; changes marked 2026091370)
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_business(p_name text, p_kinds text[], p_phone text DEFAULT NULL::text, p_category_label text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_neighbourhood_id uuid DEFAULT NULL::uuid, p_service_category_ids uuid[] DEFAULT '{}'::uuid[], p_service_area_ids uuid[] DEFAULT '{}'::uuid[], p_working_hours jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_logo_url text DEFAULT NULL::text, p_cover_url text DEFAULT NULL::text, p_vertical text DEFAULT NULL::text, p_business_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.businesses;
  v_phone text;
  v_id uuid;
  v_slug text;
  v_areas uuid[];
  -- 2026091370: 'employer' ("Personel arıyorum") is no longer a kind; older clients may still send it.
  v_kinds text[] := array_remove(coalesce(p_kinds, '{}'), 'employer');
  v_vertical text := nullif(btrim(coalesce(p_vertical, '')), '');
  v_location extensions.geography;
  v_count int;
  v_limit int;
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
    -- 2026091370: the type of an existing business is locked (only admin_set_business_vertical changes it).
    if v_existing.vertical is not null then
      v_vertical := v_existing.vertical;
      v_kinds := case when v_vertical = 'hizmet' then array['service'] else array['shop'] end;
      if 'service' = any (v_kinds) and cardinality(coalesce(p_service_category_ids, '{}')) = 0 then
        return jsonb_build_object('ok', false, 'reason', 'categories_required');
      end if;
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
    -- 2026091370: businesses per account = app_settings.business_max_per_owner (default 1) + admin-granted slots.
    -- Admins are limited too (they can grant themselves a slot), so the flow can be tested with any account.
    select count(*) into v_count from public.businesses where owner_id = v_uid;
    v_limit := private.business_limit_for(v_uid);
    if v_count >= v_limit then
      raise exception 'Bir hesapla en fazla % işletme açabilirsin. Yeni işletme için destek ekibimize yaz, hesabına ekleyelim.', v_limit
        using errcode = 'P0001', hint = 'business_limit';
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
end $function$;


-- ---------------------------------------------------------------------------------------------------------------------
-- b) the caller's quota (entry points of "Yeni işletme ekle")
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.my_business_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_limit int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  select count(*) into v_count from public.businesses b where b.owner_id = v_uid;
  v_limit := private.business_limit_for(v_uid);
  return jsonb_build_object('count', v_count, 'limit', v_limit, 'can_add', v_count < v_limit);
end $$;
revoke all on function public.my_business_quota() from public, anon;
grant execute on function public.my_business_quota() to authenticated;


-- ---------------------------------------------------------------------------------------------------------------------
-- b) admin: give (or take back) business slots
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_grant_business_slot(p_user uuid, p_slots integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_old int;
  v_new int;
  v_count int;
  v_limit int;
begin
  perform private.assert_admin();
  if p_slots is null or p_slots = 0 or p_slots < -10 or p_slots > 10 then
    raise exception 'Hak sayısı -10 ile 10 arasında olmalı.' using errcode = '22023', hint = 'invalid_slots';
  end if;
  select p.extra_business_slots into v_old from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_new := least(50, greatest(0, v_old + p_slots));
  select count(*) into v_count from public.businesses where owner_id = p_user;
  if v_new = v_old then
    v_limit := private.business_limit_for(p_user);
    return jsonb_build_object('ok', true, 'changed', false, 'extra', v_new, 'limit', v_limit, 'count', v_count);
  end if;

  update public.profiles set extra_business_slots = v_new where id = p_user;
  v_limit := private.business_limit_for(p_user);

  perform private.audit(p_user, 'business.slot', 'profile', p_user,
    case when v_new > v_old then 'İşletme ekleme hakkı verildi (+' || (v_new - v_old) || ')'
         else 'İşletme ekleme hakkı geri alındı (-' || (v_old - v_new) || ')' end
      || ': en fazla ' || v_limit || ' işletme',
    jsonb_build_object('from', v_old, 'to', v_new, 'limit', v_limit, 'count', v_count));

  if v_new > v_old then
    perform private.notify(p_user, 'business_slot', 'Yeni işletme ekleme hakkın açıldı',
      'Artık yeni bir işletme ekleyebilirsin. Bilgilerini gönderdiğin anda sayfan yayına girer.', '/isletme/basvuru');
  end if;
  return jsonb_build_object('ok', true, 'changed', true, 'extra', v_new, 'limit', v_limit, 'count', v_count);
end $$;
revoke all on function public.admin_grant_business_slot(uuid, integer) from public, anon;
grant execute on function public.admin_grant_business_slot(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------------------------------------------------
-- c) admin: change a business type (kinds follow, like apply_business)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_set_business_vertical(p_business uuid, p_vertical text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_b public.businesses;
  v_vertical text := nullif(btrim(coalesce(p_vertical, '')), '');
  v_kinds text[];
begin
  perform private.assert_admin();
  if v_vertical is null or v_vertical not in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'diger') then
    raise exception 'Geçerli bir işletme türü seç.' using errcode = '22023', hint = 'invalid_vertical';
  end if;
  select * into v_b from public.businesses where id = p_business for update;
  if not found then
    raise exception 'İşletme bulunamadı.' using errcode = 'P0002', hint = 'not_found';
  end if;
  -- Service firms receive leads; every other type is a place customers visit (same mapping as apply_business).
  v_kinds := case when v_vertical = 'hizmet' then array['service'] else array['shop'] end;
  if v_b.vertical is not distinct from v_vertical and v_b.kinds @> v_kinds and v_b.kinds <@ v_kinds then
    return jsonb_build_object('ok', true, 'changed', false, 'vertical', v_vertical, 'slug', v_b.slug);
  end if;

  update public.businesses set vertical = v_vertical, kinds = v_kinds where id = v_b.id;

  perform private.audit(v_b.owner_id, 'business.vertical', 'business', v_b.id,
    'İşletme türü değiştirildi: ' || private.business_vertical_label(v_b.vertical) || ' → ' || private.business_vertical_label(v_vertical),
    jsonb_build_object('from', v_b.vertical, 'to', v_vertical, 'kinds_from', to_jsonb(v_b.kinds), 'kinds_to', to_jsonb(v_kinds)));
  perform private.notify(v_b.owner_id, 'business_vertical', 'İşletme türün değişti',
    v_b.name || ' artık ' || private.business_vertical_label(v_vertical) || ' türünde. Panelinde bu türe uygun araçlar açıldı.',
    '/isletme/sec?b=' || v_b.id);
  return jsonb_build_object('ok', true, 'changed', true, 'vertical', v_vertical, 'previous', v_b.vertical, 'slug', v_b.slug);
end $$;
revoke all on function public.admin_set_business_vertical(uuid, text) from public, anon;
grant execute on function public.admin_set_business_vertical(uuid, text) to authenticated;
