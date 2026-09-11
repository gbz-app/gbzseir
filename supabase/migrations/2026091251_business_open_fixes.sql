-- Fixes after the multi-business review (2026091250_business_open.sql):
-- 1. apply_business is the only way to create a business (no direct inserts), so the 10-business cap holds; the
--    count is serialized per user; an owner with a suspended business cannot open a new one.
-- 2. Lead matching picks one business per owner deterministically, after the admin's hand-picks are applied.
-- 3. Owner notifications point at the right business (review, admin approve / reject).
-- Additive and re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Creating businesses
-- ---------------------------------------------------------------------------
drop policy if exists "owner insert" on public.businesses;
revoke insert on public.businesses from anon, authenticated;

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
  if v_vertical is not null and v_vertical not in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'diger') then
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

-- ---------------------------------------------------------------------------
-- 2. Lead matching: one business per owner, chosen without randomness, after the admin's picks (p_only)
-- ---------------------------------------------------------------------------
drop function if exists private.match_candidates(uuid);

create or replace function private.match_candidates(p_request_id uuid, p_only uuid[] default null)
returns table (business_id uuid, owner_id uuid, business_name text, area_match boolean, score numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with r as (
    select sr.*, sc.parent_id as cat_parent
      from public.service_requests sr
      join public.service_categories sc on sc.id = sr.category_id
     where sr.id = p_request_id
  ),
  c as (
    select b.id as business_id, b.owner_id, b.name as business_name,
           exists (select 1 from public.business_service_areas a
                    where a.business_id = b.id and a.neighbourhood_id = r.neighbourhood_id) as area_match,
           (case when exists (select 1 from public.business_service_areas a
                               where a.business_id = b.id and a.neighbourhood_id = r.neighbourhood_id) then 0.5 else 0 end)
           + 0.20 * (coalesce(b.rating_avg, 0) / 5.0)
           + 0.15 * (1.0 / (1 + (select count(*) from public.leads l2
                                  where l2.business_id = b.id and l2.created_at > now() - interval '7 days')))
           + 0.10 * (b.verification_level / 3.0) as base_score
      from r
      join public.businesses b on true
     where b.status = 'approved'
       and not b.vacation_mode
       and 'service' = any (b.kinds)
       and b.owner_id is distinct from r.customer_id
       and (p_only is null or b.id = any (p_only))
       and exists (select 1 from public.business_service_categories bc
                    where bc.business_id = b.id and bc.category_id in (r.category_id, r.cat_parent))
       -- An owner who already got a lead for this request (through any of their businesses) is skipped.
       and not exists (select 1 from public.leads l
                         join public.businesses b2 on b2.id = l.business_id
                        where l.request_id = r.id and b2.owner_id = b.owner_id)
  ),
  pick as (
    select distinct on (c.owner_id) c.*
      from c
     order by c.owner_id, c.area_match desc, c.base_score desc, c.business_id
  )
  select pick.business_id, pick.owner_id, pick.business_name, pick.area_match,
         (pick.base_score + 0.05 * random())::numeric as score
    from pick
$$;

-- Create leads for a request. p_only: restrict to these businesses (concierge pick).
create or replace function private.dispatch_request(p_request_id uuid, p_wave int default 1, p_only uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req public.service_requests;
  v_cat public.service_categories;
  v_nb text;
  v_has_area boolean;
  v_fallback boolean := false;
  v_count int := 0;
  v_total int;
  v_lead uuid;
  v_status text;
  rec record;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_req.status not in ('admin_review', 'open', 'no_match') then
    return jsonb_build_object('ok', false, 'reason', 'closed', 'status', v_req.status);
  end if;
  select * into v_cat from public.service_categories where id = v_req.category_id;
  select name into v_nb from public.neighbourhoods where id = v_req.neighbourhood_id;

  select coalesce(bool_or(c.area_match), false) into v_has_area
    from private.match_candidates(p_request_id, p_only) c;

  if not v_has_area and exists (select 1 from private.match_candidates(p_request_id, p_only)) then
    v_fallback := true;
  end if;

  for rec in
    select c.* from private.match_candidates(p_request_id, p_only) c
     where (p_only is not null or not v_has_area or c.area_match)
     order by c.score desc
     limit case when p_only is null then v_cat.notify_pool_size else 50 end
  loop
    v_lead := null;
    insert into public.leads (request_id, business_id, status, wave_no, match_score)
    values (v_req.id, rec.business_id, 'sent', coalesce(p_wave, 1), round(rec.score, 3))
    on conflict (request_id, business_id) do nothing
    returning id into v_lead;
    if v_lead is not null then
      v_count := v_count + 1;
      perform private.notify(rec.owner_id, 'lead_new',
        'Yeni hizmet talebi: ' || v_cat.name || ' - ' || coalesce(v_nb, 'Gebze'),
        rec.business_name || ' için yeni talep. İncele, ilgileniyorsan kabul et.',
        '/isletme/talepler/' || v_lead);
    end if;
  end loop;

  select count(*) into v_total from public.leads where request_id = v_req.id;
  v_status := case when v_total > 0 then
                     case when v_req.status in ('admin_review', 'no_match') then 'open' else v_req.status end
                   else 'no_match' end;
  update public.service_requests
     set status = v_status,
         dispatch_note = case when v_fallback then 'area_fallback' else dispatch_note end
   where id = v_req.id;

  if v_status = 'no_match' then
    perform private.notify_admins('request_no_match', 'Eşleşen firma yok: ' || v_cat.name,
      coalesce(v_nb, 'Gebze') || ' için uygun firma bulunamadı.', '/admin/talepler');
  end if;

  return jsonb_build_object('ok', true, 'lead_count', v_count, 'total_leads', v_total,
                            'fallback', v_fallback, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Notification links that open the right business (/isletme/sec switches the active one)
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(p_request_code text, p_business_id uuid, p_rating int, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.service_requests;
  v_id uuid;
  v_owner uuid;
  v_name text;
begin
  select * into v_r from public.service_requests where public_code = upper(btrim(p_request_code));
  if not found or v_r.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_r.status <> 'closed_hired' or v_r.hired_business_id is distinct from p_business_id then
    return jsonb_build_object('ok', false, 'reason', 'not_hired');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rating');
  end if;
  insert into public.reviews (business_id, request_id, author_id, rating, comment)
  values (p_business_id, v_r.id, auth.uid(), p_rating, nullif(left(btrim(coalesce(p_comment, '')), 1000), ''))
  on conflict (request_id, business_id)
    do update set rating = excluded.rating, comment = excluded.comment
  returning id into v_id;
  update public.businesses b
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where business_id = b.id), 0),
         rating_count = (select count(*) from public.reviews where business_id = b.id)
   where b.id = p_business_id
   returning owner_id, name into v_owner, v_name;
  perform private.notify(v_owner, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
    v_name || ' için bir müşterin değerlendirme yaptı.', '/isletme/sec?b=' || p_business_id || '&next=/isletme/yorumlar');
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $$;

create or replace function public.admin_review_business(p_business_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.businesses;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_approve then
    update public.businesses
       set status = 'approved', verification_level = greatest(verification_level, 1),
           approved_at = coalesce(approved_at, now()), rejection_reason = null
     where id = p_business_id returning * into v_b;
    if found then
      perform private.notify(v_b.owner_id, 'business_approved', 'İşletmen yayında!',
        v_b.name || ' yayında. İşletme panelinden yönetebilirsin.', '/isletme/sec?b=' || v_b.id);
    end if;
  else
    update public.businesses
       set status = 'rejected', rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_business_id returning * into v_b;
    if found then
      perform private.notify(v_b.owner_id, 'business_rejected', v_b.name || ' yayına alınmadı',
        coalesce(v_b.rejection_reason || ' ', '') || 'Bilgilerini düzeltip gönderdiğinde tekrar yayına girer.',
        '/isletme/basvuru?duzenle=' || v_b.id);
    end if;
  end if;
  if v_b.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'status', v_b.status);
end $$;

-- Old rejection notices pointed at the (now new-business) wizard: point them at the owner's unfinished business.
update public.notifications n
   set link = '/isletme/basvuru?duzenle=' || b.id
  from public.businesses b
 where n.type = 'business_rejected'
   and n.link = '/isletme/basvuru'
   and b.owner_id = n.user_id
   and b.status in ('pending', 'rejected')
   and (select count(*) from public.businesses b3 where b3.owner_id = n.user_id and b3.status in ('pending', 'rejected')) = 1;
