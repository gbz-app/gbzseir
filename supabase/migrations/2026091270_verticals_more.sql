-- New business types: saglik (Sağlık), dugun (Düğün), egitim (Eğitim). Additive and re-runnable.
alter table public.businesses drop constraint if exists businesses_vertical_check;
alter table public.businesses add constraint businesses_vertical_check
  check (vertical is null or vertical in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'etkinlik', 'diger'));

-- apply_business: same as 2026091251_business_open_fixes.sql, with the new types accepted.
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
