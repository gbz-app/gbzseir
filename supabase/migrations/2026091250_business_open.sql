-- İşletme hesapları: inceleme kaldırıldı (işletme anında yayında), bir kullanıcı birden fazla işletmeye sahip olabilir
-- (kafe + otel + hizmet firması), hizmet firmaları için fiyatlı hizmet listesi. Additive and re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Multiple businesses per owner
-- ---------------------------------------------------------------------------
alter table public.businesses drop constraint if exists businesses_owner_id_key;
create index if not exists businesses_owner_idx on public.businesses (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. No review step: new businesses go live immediately (admins can still suspend).
-- ---------------------------------------------------------------------------
update public.businesses
   set status = 'approved', approved_at = coalesce(approved_at, now()), rejection_reason = null
 where status = 'pending';

insert into public.app_settings (key, value) values ('feature_business_applications', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb, updated_at = now();

drop function if exists public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text);
drop function if exists public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text);

-- Opens a new business for the caller (live right away), or, with p_business_id, finishes one of the caller's own
-- pending / rejected businesses and puts it live. At most 10 businesses per user.
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
-- 3. Panel counters per business (an owner can have several)
-- ---------------------------------------------------------------------------
drop function if exists public.business_panel_stats();

create or replace function public.business_panel_stats(p_business_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_listing_ids uuid[];
  -- Calendar week (Monday 00:00) in Istanbul time.
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_prev_start timestamptz := (date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '7 days') at time zone 'Europe/Istanbul';
  v_calls_week int;
  v_calls_prev int;
  v_calls_total int;
  v_reveals_week int;
  v_directions_week int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;

  -- Only the caller's own businesses; the oldest one when no id is given.
  select b.id into v_biz
    from public.businesses b
   where b.owner_id = v_uid and (p_business_id is null or b.id = p_business_id)
   order by b.created_at
   limit 1;
  if v_biz is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_listing_ids := array(select l.id from public.listings l where l.business_id = v_biz);

  select count(*) filter (where e.event = 'call_click' and e.created_at >= v_week_start),
         count(*) filter (where e.event = 'call_click' and e.created_at >= v_prev_start and e.created_at < v_week_start),
         count(*) filter (where e.event = 'call_click'),
         count(*) filter (where e.event = 'phone_reveal' and e.created_at >= v_week_start),
         count(*) filter (where e.event = 'directions' and e.created_at >= v_week_start)
    into v_calls_week, v_calls_prev, v_calls_total, v_reveals_week, v_directions_week
    from public.contact_events e
   where (e.subject_type = 'business' and e.subject_id = v_biz)
      or (e.subject_type in ('listing', 'job') and e.subject_id = any (v_listing_ids));

  return jsonb_build_object(
    'ok', true,
    'business_id', v_biz,
    'week_start', v_week_start,
    'leads_week', (select count(*) from public.leads l where l.business_id = v_biz and l.created_at >= v_week_start),
    'leads_waiting', (select count(*)
                        from public.leads l
                        join public.service_requests r on r.id = l.request_id
                       where l.business_id = v_biz and l.status in ('sent', 'seen') and r.status = 'open'),
    'calls_week', v_calls_week,
    'calls_prev_week', v_calls_prev,
    'calls_total', v_calls_total,
    'phone_reveals_week', v_reveals_week,
    'directions_week', v_directions_week,
    'reviews_unreplied', (select count(*) from public.reviews v where v.business_id = v_biz and v.reply is null)
  );
end $$;

comment on function public.business_panel_stats(uuid) is
  'Business panel counters for one of the caller''s own businesses (p_business_id; oldest when null): leads this week / waiting, call clicks (business + its listings) this week / previous week / total, phone reveals and directions this week, unreplied reviews. {ok:false, reason:not_found} when the caller does not own it.';

revoke all on function public.business_panel_stats(uuid) from public, anon;
grant execute on function public.business_panel_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lead matching: one candidate per owner (an owner with two service firms in the same category gets one lead,
--    and none when one of their businesses already has a lead for the request).
-- ---------------------------------------------------------------------------
create or replace function private.match_candidates(p_request_id uuid)
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
           + 0.10 * (b.verification_level / 3.0)
           + 0.05 * random() as score
      from r
      join public.businesses b on true
     where b.status = 'approved'
       and not b.vacation_mode
       and 'service' = any (b.kinds)
       and b.owner_id is distinct from r.customer_id
       and exists (select 1 from public.business_service_categories bc
                    where bc.business_id = b.id and bc.category_id in (r.category_id, r.cat_parent))
       and not exists (select 1 from public.leads l
                         join public.businesses b2 on b2.id = l.business_id
                        where l.request_id = r.id and b2.owner_id = b.owner_id)
  )
  select distinct on (c.owner_id) c.business_id, c.owner_id, c.business_name, c.area_match, c.score
    from c
   order by c.owner_id, c.area_match desc, c.score desc
$$;

-- ---------------------------------------------------------------------------
-- 5. Job ads: when no (valid) business is given, attach the owner's OLDEST approved business (was arbitrary).
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
begin
  if v_enforce then
    if auth.uid() is null then
      raise exception 'İlan vermek için giriş yapmalısın' using errcode = '42501';
    end if;
    p_new.owner_id := auth.uid();
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

-- ---------------------------------------------------------------------------
-- 6. Service catalog (hizmet firmaları: fiyatlı hizmet listesi)
-- ---------------------------------------------------------------------------
create table if not exists public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  price_try numeric(10, 2) check (price_try is null or price_try >= 0),
  price_max_try numeric(10, 2) check (price_max_try is null or price_max_try >= 0),
  price_unit text not null default 'is' check (price_unit in ('is', 'saat', 'gun', 'm2', 'adet', 'kisi', 'ay')),
  duration_text text check (duration_text is null or char_length(duration_text) <= 40),
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_services_price_range check (price_max_try is null or price_try is null or price_max_try >= price_try)
);
create index if not exists business_services_business_idx on public.business_services (business_id, sort);

drop trigger if exists set_updated_at on public.business_services;
create trigger set_updated_at before update on public.business_services for each row execute function private.set_updated_at();

alter table public.business_services enable row level security;
drop policy if exists "public read" on public.business_services;
drop policy if exists "owner write" on public.business_services;
-- Hidden services (is_active = false) are visible to the owner and admins only.
create policy "public read" on public.business_services for select to anon, authenticated
  using ((is_active and public.business_is_public(business_id)) or public.owns_business(business_id) or public.is_admin());
create policy "owner write" on public.business_services for all to authenticated
  using (public.owns_business(business_id) or public.is_admin())
  with check (public.owns_business(business_id) or public.is_admin());
grant select on public.business_services to anon, authenticated;
grant insert, update, delete on public.business_services to authenticated;
