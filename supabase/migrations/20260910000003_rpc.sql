-- Gebzem: RPC functions (PostgREST: supabase.rpc('<name>', {...})).
-- Re-runnable (CREATE OR REPLACE). Grants are (re)applied at the end of the file.
set search_path = public, extensions;

-- ===========================================================================
-- Internal helpers (schema private: not callable through the API)
-- ===========================================================================

create or replace function private.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link
   where p_user is not null;
$$;

create or replace function private.notify_admins(p_type text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link
    from public.profiles
   where role = 'admin' and status = 'active';
$$;

-- Daily-salted SHA-256 of the caller IP (from PostgREST request headers). Never stores the raw IP.
create or replace function private.request_ip_hash()
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  h json;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return null;
  end if;
  ip := coalesce(nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
                 nullif(btrim(h ->> 'x-real-ip'), ''),
                 nullif(btrim(h ->> 'cf-connecting-ip'), ''));
  if ip is null then
    return null;
  end if;
  return encode(extensions.digest(ip || '|' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD') || '|gebzem', 'sha256'), 'hex');
end $$;

-- "1250" -> "1.250 TL"
create or replace function private.format_try(p numeric)
returns text
language sql
immutable
as $$
  select case when p is null then null
              else replace(to_char(round(p), 'FM999,999,999,999'), ',', '.') || ' TL' end
$$;

-- Current duty day (Europe/Istanbul, switches at 08:30).
create or replace function private.current_duty_day()
returns date
language sql
stable
as $$
  select ((now() at time zone 'Europe/Istanbul') - interval '8 hours 30 minutes')::date
$$;

-- Validate answers against a flow schema (same rules as src/core/flow.ts validateAnswers).
-- Returns the ids of steps that are missing/invalid and the cleaned answers (visible steps only).
create or replace function private.validate_answers(p_schema jsonb, p_answers jsonb, out errors text[], out cleaned jsonb)
language plpgsql
stable
as $$
declare
  s jsonb;
  v jsonb;
  dep jsonb;
  visible boolean;
  visible_ids text[] := '{}';
  opts text[];
  vals text[];
  n numeric;
  d date;
  today date := (now() at time zone 'Europe/Istanbul')::date;
  sid text;
begin
  errors := '{}';
  cleaned := '{}'::jsonb;
  p_answers := coalesce(p_answers, '{}'::jsonb);
  if jsonb_typeof(p_answers) <> 'object' then
    errors := array['answers'];
    return;
  end if;
  for s in select value from jsonb_array_elements(coalesce(p_schema -> 'steps', '[]'::jsonb)) loop
    sid := s ->> 'id';
    visible := true;
    if jsonb_typeof(s -> 'showIf') = 'object' then
      if not ((s -> 'showIf' ->> 'step') = any (visible_ids)) then
        visible := false;
      else
        dep := p_answers -> (s -> 'showIf' ->> 'step');
        if dep is null or jsonb_typeof(dep) = 'null' then
          visible := false;
        elsif jsonb_typeof(dep) = 'array' then
          visible := exists (select 1 from jsonb_array_elements_text(dep) a
                              where a in (select jsonb_array_elements_text(s -> 'showIf' -> 'in')));
        else
          visible := (dep #>> '{}') in (select jsonb_array_elements_text(s -> 'showIf' -> 'in'));
        end if;
      end if;
    end if;
    continue when not visible;
    visible_ids := visible_ids || sid;

    v := p_answers -> sid;
    if v is null or jsonb_typeof(v) = 'null' or v = '[]'::jsonb
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      if coalesce((s ->> 'required')::boolean, false) then
        errors := errors || sid;
      end if;
      continue;
    end if;

    opts := array(select o ->> 'value' from jsonb_array_elements(coalesce(s -> 'options', '[]'::jsonb)) o);
    case s ->> 'type'
      when 'single' then
        if jsonb_typeof(v) not in ('string', 'number')
           or (cardinality(opts) > 0 and not ((v #>> '{}') = any (opts))) then
          errors := errors || sid;
          continue;
        end if;
        v := to_jsonb(v #>> '{}');
      when 'multi' then
        if jsonb_typeof(v) <> 'array' then
          errors := errors || sid;
          continue;
        end if;
        vals := array(select jsonb_array_elements_text(v));
        if (cardinality(opts) > 0 and not (vals <@ opts))
           or (s ? 'min' and cardinality(vals) < (s ->> 'min')::int)
           or (s ? 'max' and cardinality(vals) > (s ->> 'max')::int) then
          errors := errors || sid;
          continue;
        end if;
      when 'number' then
        begin
          n := (v #>> '{}')::numeric;
        exception when others then
          errors := errors || sid;
          continue;
        end;
        if (s ? 'min' and n < (s ->> 'min')::numeric) or (s ? 'max' and n > (s ->> 'max')::numeric) then
          errors := errors || sid;
          continue;
        end if;
        v := to_jsonb(n);
      when 'text' then
        if jsonb_typeof(v) <> 'string' then
          errors := errors || sid;
          continue;
        end if;
        v := to_jsonb(left(btrim(v #>> '{}'), 1000));
        if (s ? 'min' and char_length(v #>> '{}') < (s ->> 'min')::int)
           or (s ? 'max' and char_length(v #>> '{}') > (s ->> 'max')::int) then
          errors := errors || sid;
          continue;
        end if;
      when 'date' then
        begin
          d := (v #>> '{}')::date;
        exception when others then
          errors := errors || sid;
          continue;
        end;
        if (s ? 'min' and d < today + (s ->> 'min')::int) or (s ? 'max' and d > today + (s ->> 'max')::int) then
          errors := errors || sid;
          continue;
        end if;
        v := to_jsonb(to_char(d, 'YYYY-MM-DD'));
      else
        null;
    end case;
    cleaned := cleaned || jsonb_build_object(sid, v);
  end loop;
end $$;

-- Answers with question titles and option labels resolved, in flow order.
-- [{id, title, type, value, display}]
create or replace function private.resolve_answers(p_schema jsonb, p_answers jsonb)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s ->> 'id',
           'title', s ->> 'title',
           'type', s ->> 'type',
           'value', p_answers -> (s ->> 'id'),
           'display',
             case
               when jsonb_typeof(p_answers -> (s ->> 'id')) = 'array' then
                 (select string_agg(coalesce(
                           (select o ->> 'label' from jsonb_array_elements(coalesce(s -> 'options', '[]'::jsonb)) o
                             where o ->> 'value' = v.x limit 1), v.x), ', ')
                    from jsonb_array_elements_text(p_answers -> (s ->> 'id')) as v(x))
               when s ->> 'type' = 'number' then
                 (p_answers ->> (s ->> 'id')) || coalesce(' ' || (s ->> 'unit'), '')
               else
                 coalesce((select o ->> 'label' from jsonb_array_elements(coalesce(s -> 'options', '[]'::jsonb)) o
                            where o ->> 'value' = (p_answers ->> (s ->> 'id')) limit 1),
                          p_answers ->> (s ->> 'id'))
             end)
           order by t.ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_schema -> 'steps', '[]'::jsonb)) with ordinality as t(s, ord)
   where coalesce(p_answers, '{}'::jsonb) ? (s ->> 'id')
$$;

-- Random public code, e.g. "K7M2QX9A" (no 0/O/1/I).
create or replace function private.new_public_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.service_requests where public_code = code);
  end loop;
  return code;
end $$;

-- Candidate businesses for a request (not yet having a lead).
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
  )
  select b.id, b.owner_id, b.name,
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
     and not exists (select 1 from public.leads l where l.request_id = r.id and l.business_id = b.id)
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
    from private.match_candidates(p_request_id) c
   where p_only is null or c.business_id = any (p_only);

  if not v_has_area and exists (select 1 from private.match_candidates(p_request_id) c
                                 where p_only is null or c.business_id = any (p_only)) then
    v_fallback := true;
  end if;

  for rec in
    select c.* from private.match_candidates(p_request_id) c
     where (p_only is null or c.business_id = any (p_only))
       and (p_only is not null or not v_has_area or c.area_match)
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
        'Talebi incele, ilgileniyorsan kabul et.',
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

-- ===========================================================================
-- Nearby / POI
-- ===========================================================================

-- Nearest POIs of a kind ('pharmacy','mosque','bus_stop','place'; null = all kinds).
-- Without coordinates: ordered by name, distance_m null.
create or replace function public.nearby_pois(
  p_kind text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m int default 5000,
  p_limit int default 50)
returns table (
  id uuid, kind text, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  details jsonb, source text, license text, updated_at timestamptz, distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  )
  select p.id, p.kind, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         p.details, p.source, p.license, p.updated_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.poi p
    cross join pt
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where (p_kind is null or p.kind = p_kind)
     and (pt.g is null or extensions.st_dwithin(p.location, pt.g, greatest(1, least(coalesce(p_radius_m, 5000), 50000))))
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- Pharmacies on duty right now (never returns an expired window).
create or replace function public.duty_pharmacies_now(
  p_lat double precision default null,
  p_lng double precision default null)
returns table (
  duty_id uuid, poi_id uuid, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  duty_start timestamptz, duty_end timestamptz, source text, note text, fetched_at timestamptz,
  distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  )
  select d.id, p.id, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         d.duty_start, d.duty_end, d.source, d.note, d.fetched_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where now() >= d.duty_start and now() < d.duty_end
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$$;

-- Duty pharmacies of a duty day (the day's window is p_date 08:30 -> p_date+1 08:30, Europe/Istanbul).
create or replace function public.duty_pharmacies_for_day(
  p_date date,
  p_lat double precision default null,
  p_lng double precision default null)
returns table (
  duty_id uuid, poi_id uuid, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  duty_start timestamptz, duty_end timestamptz, source text, note text, fetched_at timestamptz,
  distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  ),
  win as (
    select (p_date + time '08:30') at time zone 'Europe/Istanbul' as s,
           ((p_date + 1) + time '08:30') at time zone 'Europe/Istanbul' as e
  )
  select d.id, p.id, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         d.duty_start, d.duty_end, d.source, d.note, d.fetched_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    cross join win
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where d.duty_start < win.e and d.duty_end > win.s
     and d.duty_end > now()
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$$;

-- Neighbourhood containing a point (polygon), else the nearest centre within 6 km.
create or replace function public.neighbourhood_for_point(p_lat double precision, p_lng double precision)
returns table (id uuid, name text, slug text, district text, method text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with pt as (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as g)
  (
    select n.id, n.name, n.slug, n.district, 'polygon'::text
      from private.neighbourhood_boundaries b
      join public.neighbourhoods n on n.id = b.neighbourhood_id, pt
     where extensions.st_contains(b.boundary, pt.g)
     limit 1
  )
  union all
  (
    select n.id, n.name, n.slug, n.district, 'nearest'::text
      from public.neighbourhoods n, pt
     where n.center is not null
       and extensions.st_dwithin(n.center, pt.g::extensions.geography, 6000)
       and not exists (select 1 from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, pt.g))
     order by extensions.st_distance(n.center, pt.g::extensions.geography)
     limit 1
  )
$$;

-- ===========================================================================
-- Auth: demo OTP (prototype only)
-- ===========================================================================

-- Supabase Auth "Send SMS" hook (Postgres function variant). Stores the OTP instead of sending an SMS.
create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
  v_code text := event -> 'sms' ->> 'otp';
begin
  if v_phone <> '' and v_code is not null then
    insert into public.demo_otp (phone, code) values (v_phone, v_code);
  end if;
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return '{}'::jsonb;
end $$;

-- Latest OTP (< 5 min) for a phone, only in demo mode and never for admin phones.
create or replace function public.get_demo_otp(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := private.phone_digits(p_phone);
  v_code text;
begin
  if coalesce((select value from public.app_settings where key = 'otp_demo_mode'), 'false'::jsonb) <> 'true'::jsonb then
    return null;
  end if;
  if v_digits = '' or exists (select 1 from public.profiles where phone = '+' || v_digits and role = 'admin') then
    return null;
  end if;
  select code into v_code
    from public.demo_otp
   where phone = v_digits and created_at > now() - interval '5 minutes'
   order by created_at desc
   limit 1;
  return v_code;
end $$;

-- ===========================================================================
-- Contact events / phone reveal / listing helpers
-- ===========================================================================

-- Log a contact (call tap, phone reveal, directions). Call before navigating to tel:.
create or replace function public.log_contact_event(p_subject_type text, p_subject_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_subject_type not in ('listing', 'job', 'business', 'poi', 'lead')
     or p_event not in ('phone_reveal', 'call_click', 'directions') or p_subject_id is null then
    raise exception 'Geçersiz olay' using errcode = '22023';
  end if;
  insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
  values (auth.uid(), p_subject_type, p_subject_id, p_event, private.request_ip_hash());
  if p_event = 'call_click' and p_subject_type in ('listing', 'job') then
    update public.listings set call_count = call_count + 1 where id = p_subject_id;
  end if;
end $$;

-- Phone number behind "Numarayı göster". Job listings: no limit. 2. el: 30/day (members), 5/day per IP (guests).
-- Returns {ok:true, phone, display_name} | {ok:false, reason:'not_found'|'rate_limited'|'login_required'|'no_phone'}
create or replace function public.reveal_listing_phone(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.listings;
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_n int;
  v_phone text;
  v_name text;
  v_is_owner boolean;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_is_owner := v_uid is not null and v_uid = v_l.owner_id;
  if v_l.status <> 'active' and not v_is_owner and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_l.type = 'classified' and not v_is_owner and not public.is_admin() then
    if v_uid is not null then
      select count(*) into v_n from public.contact_events
       where user_id = v_uid and event = 'phone_reveal' and created_at > now() - interval '24 hours';
      if v_n >= 30 then
        return jsonb_build_object('ok', false, 'reason', 'rate_limited');
      end if;
    else
      if v_ip is null then
        return jsonb_build_object('ok', false, 'reason', 'login_required');
      end if;
      select count(*) into v_n from public.contact_events
       where user_id is null and ip_hash = v_ip and event = 'phone_reveal' and created_at > now() - interval '24 hours';
      if v_n >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'login_required');
      end if;
    end if;
  end if;

  if v_l.business_id is not null then
    select phone, name into v_phone, v_name from public.businesses where id = v_l.business_id;
  end if;
  if v_phone is null then
    select phone, public.short_name(full_name) into v_phone, v_name from public.profiles where id = v_l.owner_id;
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_phone');
  end if;

  if not v_is_owner then
    insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
    values (v_uid, case when v_l.type = 'job' then 'job' else 'listing' end, v_l.id, 'phone_reveal', v_ip);
  end if;
  return jsonb_build_object('ok', true, 'phone', v_phone, 'display_name', v_name);
end $$;

create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listings set view_count = view_count + 1
   where id = p_listing_id and status = 'active' and owner_id is distinct from auth.uid();
$$;

-- Extend a published listing by listing_days (30). Expired -> active again.
create or replace function public.renew_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.listings;
  v_days int := private.app_setting_int('listing_days', 30);
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found or (v_l.owner_id <> auth.uid() and not public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_l.status not in ('active', 'paused', 'expired') or v_l.published_at is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_l.status);
  end if;
  update public.listings
     set expires_at = now() + make_interval(days => v_days),
         status = case when status = 'expired' then 'active' else status end
   where id = p_listing_id
   returning * into v_l;
  return jsonb_build_object('ok', true, 'status', v_l.status, 'expires_at', v_l.expires_at);
end $$;

-- Every word of q (normalised) occurs in norm.
create or replace function public.tr_match(p_norm text, p_q text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_q, '') <> '' and not exists (
    select 1 from unnest(string_to_array(p_q, ' ')) w
     where w <> '' and position(w in coalesce(p_norm, '')) = 0)
$$;

-- Listing feed/search (active, not expired). Returns listings rows, so PostgREST embedding works:
--   supabase.rpc('search_listings', {...}).select('*, listing_media(*), neighbourhoods(name)').range(0, 19)
-- p_sort: 'newest' (default) | 'price_asc' | 'price_desc'
create or replace function public.search_listings(
  p_type text default 'classified',
  p_q text default null,
  p_category_id uuid default null,
  p_neighbourhood_id uuid default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_work_type text default null,
  p_sort text default 'newest')
returns setof public.listings
language sql
stable
set search_path = public, extensions
as $$
  select l.*
    from public.listings l
   where l.status = 'active'
     and l.expires_at > now()
     and (p_type is null or l.type = p_type)
     and (p_category_id is null or l.category_id = p_category_id
          or l.category_id in (select c.id from public.listing_categories c where c.parent_id = p_category_id))
     and (p_neighbourhood_id is null or l.neighbourhood_id = p_neighbourhood_id)
     and (p_min_price is null or l.price_try >= p_min_price)
     and (p_max_price is null or l.price_try <= p_max_price)
     and (p_work_type is null or l.job_work_type = p_work_type)
     and (coalesce(btrim(p_q), '') = ''
          or public.tr_match(l.search_norm, public.tr_norm(p_q))
          or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, public.tr_norm(p_q)))
   order by
     case when p_sort = 'price_asc' then l.price_try end asc nulls last,
     case when p_sort = 'price_desc' then l.price_try end desc nulls last,
     l.published_at desc nulls last,
     l.id
$$;

-- Global search. Returns {listings:[...], businesses:[...], services:[...], pois:[...]}
create or replace function public.global_search(p_q text, p_limit int default 5)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with q as (select public.tr_norm(p_q) as q, greatest(1, least(coalesce(p_limit, 5), 20)) as lim)
  select case when char_length((select q from q)) < 2 then
    jsonb_build_object('listings', '[]'::jsonb, 'businesses', '[]'::jsonb, 'services', '[]'::jsonb, 'pois', '[]'::jsonb)
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
         where p.kind in ('place', 'pharmacy', 'mosque') and public.tr_match(p.search_norm, q.q)
         order by (p.kind = 'place') desc, extensions.similarity(p.search_norm, q.q) desc, p.name
         limit (select lim from q)) x), '[]'::jsonb)
  ) end
$$;

-- ===========================================================================
-- Services (customer side)
-- ===========================================================================

-- Create a service request. Returns {id, public_code, status, lead_count}.
-- Errors (raise, hint): login_required, category_not_found, neighbourhood_required, invalid_when,
-- invalid_answers (message lists the step ids), rate_limited, account_banned.
create or replace function public.submit_service_request(
  p_category_id uuid,
  p_answers jsonb,
  p_neighbourhood_id uuid,
  p_address_note text default null,
  p_when_type text default 'esnek',
  p_when_date date default null,
  p_note text default null,
  p_photos text[] default '{}',
  p_hide_phone boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cat public.service_categories;
  v_flow public.question_flows;
  v_errors text[];
  v_clean jsonb;
  v_code text;
  v_id uuid;
  v_dispatch jsonb;
  v_status text;
  v_nb text;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if v_uid is null then
    raise exception 'Talep göndermek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.status = 'banned' then
    raise exception 'Hesabın askıya alınmış' using errcode = '42501', hint = 'account_banned';
  end if;
  select * into v_cat from public.service_categories where id = p_category_id and active;
  if not found then
    raise exception 'Hizmet kategorisi bulunamadı' using errcode = 'P0001', hint = 'category_not_found';
  end if;
  select name into v_nb from public.neighbourhoods where id = p_neighbourhood_id;
  if v_nb is null then
    raise exception 'Mahalle seçmelisin' using errcode = 'P0001', hint = 'neighbourhood_required';
  end if;
  if p_when_type is null or p_when_type not in ('acil', 'bu_hafta', 'tarih', 'esnek')
     or (p_when_type = 'tarih' and (p_when_date is null or p_when_date < v_today or p_when_date > v_today + 180)) then
    raise exception 'Geçerli bir zaman seçmelisin' using errcode = 'P0001', hint = 'invalid_when';
  end if;
  if (select count(*) from public.service_requests
       where customer_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Bugün çok fazla talep gönderdin, lütfen daha sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select * into v_flow from public.question_flows
   where category_id = p_category_id and published
   order by version desc limit 1;
  if found then
    select errors, cleaned into v_errors, v_clean from private.validate_answers(v_flow.schema, p_answers);
    if cardinality(v_errors) > 0 then
      raise exception 'Eksik veya geçersiz cevap: %', array_to_string(v_errors, ', ')
        using errcode = 'P0001', hint = 'invalid_answers';
    end if;
  else
    v_clean := coalesce(p_answers, '{}'::jsonb);
  end if;

  v_code := private.new_public_code();
  insert into public.service_requests (
    public_code, customer_id, category_id, flow_id, answers, neighbourhood_id, address_note,
    when_type, when_date, note, photos, hide_phone, status, max_providers)
  values (
    v_code, v_uid, p_category_id, v_flow.id, v_clean, p_neighbourhood_id,
    nullif(left(btrim(coalesce(p_address_note, '')), 200), ''),
    p_when_type, case when p_when_type = 'tarih' then p_when_date end,
    nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    coalesce((coalesce(p_photos, '{}'::text[]))[1:6], '{}'::text[]),
    coalesce(p_hide_phone, false),
    case when v_cat.auto_dispatch then 'open' else 'admin_review' end,
    v_cat.max_providers)
  returning id into v_id;

  if v_cat.auto_dispatch then
    v_dispatch := private.dispatch_request(v_id, 1, null);
  else
    perform private.notify_admins('request_review', 'Onay bekleyen talep: ' || v_cat.name,
      v_nb || ' - kod ' || v_code, '/admin/talepler');
  end if;

  select status into v_status from public.service_requests where id = v_id;
  perform private.notify(v_uid, 'request_created', 'Talebin alındı',
    v_cat.name || ' talebin uygun firmalara iletilecek. Kabul eden firmaları bu sayfada göreceksin.',
    '/talep/' || v_code);

  return jsonb_build_object('id', v_id, 'public_code', v_code, 'status', v_status,
                            'lead_count', coalesce((v_dispatch ->> 'lead_count')::int, 0));
end $$;

-- Request page for its customer (or admin). Returns null when not found / not yours.
create or replace function public.get_request_for_customer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_r public.service_requests;
  v_cat public.service_categories;
  v_parent public.service_categories;
  v_schema jsonb;
  v_nb public.neighbourhoods;
  v_review public.reviews;
begin
  select * into v_r from public.service_requests where public_code = upper(btrim(p_code));
  if not found or (v_r.customer_id is distinct from auth.uid() and not public.is_admin()) then
    return null;
  end if;
  select * into v_cat from public.service_categories where id = v_r.category_id;
  select * into v_parent from public.service_categories where id = v_cat.parent_id;
  select schema into v_schema from public.question_flows where id = v_r.flow_id;
  select * into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
  if v_r.hired_business_id is not null then
    select * into v_review from public.reviews where request_id = v_r.id and business_id = v_r.hired_business_id;
  end if;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_r.id,
      'public_code', v_r.public_code,
      'status', v_r.status,
      'category', jsonb_build_object('id', v_cat.id, 'name', v_cat.name, 'slug', v_cat.slug, 'icon', v_cat.icon,
                                     'parent_name', v_parent.name, 'parent_slug', v_parent.slug),
      'neighbourhood', case when v_nb.id is null then null else
                         jsonb_build_object('id', v_nb.id, 'name', v_nb.name, 'district', v_nb.district) end,
      'address_note', v_r.address_note,
      'when_type', v_r.when_type,
      'when_date', v_r.when_date,
      'note', v_r.note,
      'photos', to_jsonb(v_r.photos),
      'hide_phone', v_r.hide_phone,
      'answers', private.resolve_answers(v_schema, v_r.answers),
      'accepted_count', v_r.accepted_count,
      'max_providers', v_r.max_providers,
      'sent_count', (select count(*) from public.leads where request_id = v_r.id),
      'hired_business_id', v_r.hired_business_id,
      'created_at', v_r.created_at,
      'closed_at', v_r.closed_at),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lead_id', l.id,
               'status', l.status,
               'offer_price_try', l.offer_price_try,
               'offer_note', l.offer_note,
               'accepted_at', l.accepted_at,
               'business', jsonb_build_object(
                 'id', b.id, 'name', b.name, 'slug', b.slug, 'logo_url', b.logo_url,
                 'rating_avg', b.rating_avg, 'rating_count', b.rating_count,
                 'verification_level', b.verification_level, 'phone', b.phone,
                 'category_label', b.category_label))
             order by l.accepted_at)
        from public.leads l
        join public.businesses b on b.id = l.business_id
       where l.request_id = v_r.id and l.status = 'accepted'), '[]'::jsonb),
    'review', case when v_review.id is null then null else
                jsonb_build_object('id', v_review.id, 'rating', v_review.rating, 'comment', v_review.comment,
                                   'reply', v_review.reply, 'created_at', v_review.created_at) end
  );
end $$;

-- Customer removes an accepted firm (frees the slot; a filled request re-opens).
create or replace function public.customer_remove_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.leads;
  v_r public.service_requests;
begin
  select * into v_l from public.leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_r from public.service_requests where id = v_l.request_id for update;
  if v_r.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_l.status <> 'accepted' or v_r.status not in ('open', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;
  update public.leads set status = 'removed_by_customer' where id = v_l.id;
  update public.service_requests
     set accepted_count = greatest(accepted_count - 1, 0),
         status = case when status = 'filled' then 'open' else status end
   where id = v_r.id;
  if v_r.status = 'filled' then
    update public.leads set status = 'seen' where request_id = v_r.id and status = 'closed_full';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Close a request: hired a firm (must be an accepted one) or cancelled (p_hired_business_id null).
create or replace function public.close_request(p_code text, p_hired_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.service_requests;
  v_lead uuid;
  v_owner uuid;
  v_status text;
begin
  select * into v_r from public.service_requests where public_code = upper(btrim(p_code)) for update;
  if not found or v_r.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_r.status not in ('admin_review', 'open', 'filled', 'no_match') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_r.status);
  end if;
  if p_hired_business_id is not null then
    select l.id, b.owner_id into v_lead, v_owner
      from public.leads l join public.businesses b on b.id = l.business_id
     where l.request_id = v_r.id and l.business_id = p_hired_business_id and l.status = 'accepted';
    if v_lead is null then
      return jsonb_build_object('ok', false, 'reason', 'not_accepted');
    end if;
    v_status := 'closed_hired';
  else
    v_status := 'closed_cancelled';
  end if;
  update public.service_requests
     set status = v_status, hired_business_id = p_hired_business_id, closed_at = now()
   where id = v_r.id;
  update public.leads set status = 'closed_full' where request_id = v_r.id and status in ('sent', 'seen');
  if v_status = 'closed_hired' then
    perform private.notify(v_owner, 'request_hired', 'Müşteri seninle çalışmaya karar verdi',
      'Talep kapandı ve işi sana verdi. Başarılar!', '/isletme/talepler/' || v_lead);
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- Review the hired firm of a closed_hired request (re-submitting updates the review).
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
   returning owner_id into v_owner;
  perform private.notify(v_owner, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
    'Bir müşterin seni değerlendirdi.', '/isletme/yorumlar');
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $$;

-- ===========================================================================
-- Services (business side)
-- ===========================================================================

-- Lead detail for the business owner. Customer phone only after acceptance (and if not hidden).
-- Marks 'sent' -> 'seen'.
create or replace function public.get_lead_detail(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.leads;
  v_b public.businesses;
  v_r public.service_requests;
  v_cat public.service_categories;
  v_parent public.service_categories;
  v_nb public.neighbourhoods;
  v_schema jsonb;
  v_cust public.profiles;
  v_acc boolean;
begin
  select * into v_l from public.leads where id = p_lead_id;
  if not found then
    return null;
  end if;
  select * into v_b from public.businesses where id = v_l.business_id;
  if v_b.owner_id is distinct from auth.uid() and not public.is_admin() then
    return null;
  end if;
  select * into v_r from public.service_requests where id = v_l.request_id;
  select * into v_cat from public.service_categories where id = v_r.category_id;
  select * into v_parent from public.service_categories where id = v_cat.parent_id;
  select * into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
  select schema into v_schema from public.question_flows where id = v_r.flow_id;
  select * into v_cust from public.profiles where id = v_r.customer_id;

  if v_l.status = 'sent' and v_b.owner_id = auth.uid() then
    update public.leads set status = 'seen', seen_at = now() where id = v_l.id returning * into v_l;
  end if;
  v_acc := v_l.status = 'accepted';

  return jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_l.id, 'business_id', v_l.business_id, 'status', v_l.status,
      'offer_price_try', v_l.offer_price_try, 'offer_note', v_l.offer_note,
      'wave_no', v_l.wave_no, 'seen_at', v_l.seen_at, 'accepted_at', v_l.accepted_at, 'created_at', v_l.created_at),
    'request', jsonb_build_object(
      'id', v_r.id,
      'status', v_r.status,
      'category', jsonb_build_object('id', v_cat.id, 'name', v_cat.name, 'slug', v_cat.slug, 'icon', v_cat.icon,
                                     'parent_name', v_parent.name),
      'neighbourhood', case when v_nb.id is null then null else
                         jsonb_build_object('id', v_nb.id, 'name', v_nb.name, 'district', v_nb.district,
                                            'lat', v_nb.lat, 'lng', v_nb.lng) end,
      'when_type', v_r.when_type,
      'when_date', v_r.when_date,
      'note', v_r.note,
      'photos', to_jsonb(v_r.photos),
      'answers', private.resolve_answers(v_schema, v_r.answers),
      'accepted_count', v_r.accepted_count,
      'max_providers', v_r.max_providers,
      'address_note', case when v_acc then v_r.address_note end,
      'created_at', v_r.created_at),
    'customer', jsonb_build_object(
      'display_name', case when v_acc then coalesce(v_cust.full_name, public.short_name(v_cust.full_name))
                           else public.short_name(v_cust.full_name) end,
      'phone', case when v_acc and not v_r.hide_phone then v_cust.phone end,
      'hide_phone', v_r.hide_phone),
    'can_accept', v_l.status in ('sent', 'seen') and v_r.status = 'open' and v_r.accepted_count < v_r.max_providers
  );
end $$;

-- ATOMIC accept ("İlgileniyorum / Kabul et"). Max max_providers firms per request.
-- Returns {ok:true, customer_name, customer_phone|null, hide_phone, accepted_count, max_providers}
--      or {ok:false, reason:'full'|'closed'|'removed'|'declined'|'business_not_approved'|'not_found'}
create or replace function public.accept_lead(p_lead_id uuid, p_offer_price numeric default null, p_offer_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.leads;
  v_b public.businesses;
  v_r public.service_requests;
  v_cust public.profiles;
  v_note text := nullif(btrim(coalesce(p_offer_note, '')), '');
begin
  select * into v_l from public.leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_b from public.businesses where id = v_l.business_id;
  if v_b.owner_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_b.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'business_not_approved');
  end if;

  if v_l.status = 'accepted' then
    select * into v_r from public.service_requests where id = v_l.request_id;
    select * into v_cust from public.profiles where id = v_r.customer_id;
    return jsonb_build_object('ok', true, 'already', true,
      'customer_name', coalesce(v_cust.full_name, 'Müşteri'),
      'customer_phone', case when v_r.hide_phone then null else v_cust.phone end,
      'hide_phone', v_r.hide_phone, 'accepted_count', v_r.accepted_count, 'max_providers', v_r.max_providers);
  end if;
  if v_l.status not in ('sent', 'seen') then
    return jsonb_build_object('ok', false, 'reason',
      case v_l.status when 'closed_full' then 'full' when 'removed_by_customer' then 'removed'
                      when 'declined' then 'declined' else 'closed' end);
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'Not en fazla 280 karakter olabilir' using errcode = 'P0001', hint = 'note_too_long';
  end if;
  if p_offer_price is not null and (p_offer_price < 0 or p_offer_price > 10000000) then
    raise exception 'Geçersiz fiyat' using errcode = 'P0001', hint = 'invalid_price';
  end if;

  -- The atomic slot grab.
  update public.service_requests
     set accepted_count = accepted_count + 1
   where id = v_l.request_id and status = 'open' and accepted_count < max_providers
  returning * into v_r;

  if not found then
    select * into v_r from public.service_requests where id = v_l.request_id;
    update public.leads set status = 'closed_full' where id = v_l.id;
    return jsonb_build_object('ok', false, 'reason',
      case when v_r.status in ('open', 'filled') then 'full' else 'closed' end);
  end if;

  update public.leads
     set status = 'accepted', accepted_at = now(), offer_price_try = p_offer_price, offer_note = v_note
   where id = v_l.id;
  update public.businesses set leads_accepted_count = leads_accepted_count + 1 where id = v_b.id;

  if v_r.accepted_count >= v_r.max_providers then
    update public.service_requests set status = 'filled' where id = v_r.id;
    update public.leads set status = 'closed_full' where request_id = v_r.id and status in ('sent', 'seen');
  end if;

  select * into v_cust from public.profiles where id = v_r.customer_id;
  perform private.notify(v_r.customer_id, 'lead_accepted', v_b.name || ' talebinle ilgilendi',
    case when p_offer_price is not null then 'Tahmini fiyat: ' || private.format_try(p_offer_price) || '. '
         else '' end || 'Firmayı arayabilir veya profilini inceleyebilirsin.',
    '/talep/' || v_r.public_code);

  if not v_r.hide_phone then
    insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
    values (auth.uid(), 'lead', v_l.id, 'phone_reveal', private.request_ip_hash());
  end if;

  return jsonb_build_object('ok', true,
    'customer_name', coalesce(v_cust.full_name, 'Müşteri'),
    'customer_phone', case when v_r.hide_phone then null else v_cust.phone end,
    'hide_phone', v_r.hide_phone,
    'accepted_count', v_r.accepted_count,
    'max_providers', v_r.max_providers);
end $$;

create or replace function public.decline_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.leads l set status = 'declined'
   where l.id = p_lead_id and l.status in ('sent', 'seen')
     and exists (select 1 from public.businesses b where b.id = l.business_id and b.owner_id = auth.uid());
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

-- Business owner replies to a review (once; editing allowed).
create or replace function public.reply_review(p_review_id uuid, p_reply text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.reviews r
     set reply = nullif(left(btrim(coalesce(p_reply, '')), 1000), ''), replied_at = now()
   where r.id = p_review_id
     and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = auth.uid());
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

-- ===========================================================================
-- Business application
-- ===========================================================================

-- Create (or re-submit a pending/rejected) business application. Returns {ok, business_id, slug, status}
-- or {ok:false, reason:'already_exists'|'invalid_kinds'|'invalid_phone'|'categories_required'}.
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
  p_cover_url text default null)
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
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'İşletme adı 2-80 karakter olmalı' using errcode = 'P0001', hint = 'invalid_name';
  end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['service', 'shop', 'employer']) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kinds');
  end if;
  v_phone := coalesce(private.phone_e164(p_phone), (select phone from public.profiles where id = v_uid));
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if 'service' = any (p_kinds) and cardinality(coalesce(p_service_category_ids, '{}')) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'categories_required');
  end if;

  select * into v_existing from public.businesses where owner_id = v_uid;
  if found and v_existing.status not in ('pending', 'rejected') then
    return jsonb_build_object('ok', false, 'reason', 'already_exists', 'business_id', v_existing.id, 'status', v_existing.status);
  end if;

  if found then
    update public.businesses
       set name = btrim(p_name), kinds = p_kinds, phone = v_phone, category_label = p_category_label,
           description = p_description, address = p_address, neighbourhood_id = p_neighbourhood_id,
           working_hours = coalesce(p_working_hours, '{}'::jsonb),
           location = case when p_lat is null or p_lng is null then null
                           else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end,
           logo_url = coalesce(p_logo_url, logo_url), cover_url = coalesce(p_cover_url, cover_url),
           status = 'pending', rejection_reason = null
     where id = v_existing.id
     returning id, slug into v_id, v_slug;
  else
    insert into public.businesses (owner_id, name, kinds, phone, category_label, description, address,
                                   neighbourhood_id, working_hours, location, logo_url, cover_url, status)
    values (v_uid, btrim(p_name), p_kinds, v_phone, p_category_label, p_description, p_address,
            p_neighbourhood_id, coalesce(p_working_hours, '{}'::jsonb),
            case when p_lat is null or p_lng is null then null
                 else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end,
            p_logo_url, p_cover_url, 'pending')
    returning id, slug into v_id, v_slug;
  end if;

  delete from public.business_service_categories where business_id = v_id;
  insert into public.business_service_categories (business_id, category_id)
  select v_id, c.id from public.service_categories c where c.id = any (coalesce(p_service_category_ids, '{}'))
  on conflict do nothing;

  v_areas := coalesce(p_service_area_ids, '{}');
  if cardinality(v_areas) = 0 and p_neighbourhood_id is not null then
    v_areas := array[p_neighbourhood_id];
  end if;
  delete from public.business_service_areas where business_id = v_id;
  insert into public.business_service_areas (business_id, neighbourhood_id)
  select v_id, n.id from public.neighbourhoods n where n.id = any (v_areas)
  on conflict do nothing;

  perform private.notify_admins('business_application', 'Yeni işletme başvurusu: ' || btrim(p_name),
    'Başvuruyu inceleyip onaylayabilirsin.', '/admin/isletmeler');
  return jsonb_build_object('ok', true, 'business_id', v_id, 'slug', v_slug, 'status', 'pending');
end $$;

-- ===========================================================================
-- Admin
-- ===========================================================================

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
        v_b.name || ' onaylandı. Artık işletme panelini kullanabilirsin.', '/isletme');
    end if;
  else
    update public.businesses
       set status = 'rejected', rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_business_id returning * into v_b;
    if found then
      perform private.notify(v_b.owner_id, 'business_rejected', 'İşletme başvurun onaylanmadı',
        coalesce(v_b.rejection_reason, 'Bilgilerini kontrol edip tekrar başvurabilirsin.'), '/isletme/basvuru');
    end if;
  end if;
  if v_b.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'status', v_b.status);
end $$;

create or replace function public.admin_review_listing(p_listing_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.listings;
  v_days int := private.app_setting_int('listing_days', 30);
  v_published int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_approve then
    update public.listings
       set status = 'active', published_at = coalesce(published_at, now()),
           expires_at = now() + make_interval(days => v_days), rejection_reason = null
     where id = p_listing_id and status <> 'deleted' returning * into v_l;
    if found then
      select count(*) into v_published from public.listings where owner_id = v_l.owner_id and published_at is not null;
      if v_published >= private.app_setting_int('first_listings_moderated', 3) then
        update public.profiles set trusted_publisher = true where id = v_l.owner_id and not trusted_publisher;
      end if;
      perform private.notify(v_l.owner_id, 'listing_approved', 'İlanın yayında', v_l.title,
        case when v_l.type = 'job' then '/is-ilani/' else '/ilan/' end || v_l.id);
    end if;
  else
    update public.listings
       set status = 'rejected', rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_listing_id and status <> 'deleted' returning * into v_l;
    if found then
      perform private.notify(v_l.owner_id, 'listing_rejected', 'İlanın yayınlanmadı',
        v_l.title || coalesce(': ' || v_l.rejection_reason, ''),
        case when v_l.type = 'job' then '/profil/is-ilanlarim' else '/profil/ilanlarim' end);
    end if;
  end if;
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'status', v_l.status);
end $$;

-- Admin: "Eşleştir ve gönder". p_business_ids: optional explicit firms (concierge pick).
create or replace function public.dispatch_request(p_request_id uuid, p_wave int default 1, p_business_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return private.dispatch_request(p_request_id, p_wave, p_business_ids);
end $$;

-- ===========================================================================
-- Account / notifications
-- ===========================================================================

-- Mark notifications read (null = all). Returns the number updated.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Delete the caller's account: anonymise requests, delete listings/business, then the auth user.
-- Contact events stay (user_id -> null, IP only as daily hash).
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501';
  end if;
  update public.leads set status = 'closed_full'
   where status in ('sent', 'seen')
     and request_id in (select id from public.service_requests where customer_id = v_uid);
  update public.service_requests
     set note = null, address_note = null, photos = '{}',
         status = case when status in ('admin_review', 'open', 'filled', 'no_match') then 'closed_cancelled' else status end,
         closed_at = coalesce(closed_at, now())
   where customer_id = v_uid;
  update public.listings set status = 'deleted' where owner_id = v_uid;
  update public.profiles
     set full_name = null, email = null, avatar_url = null, phone = null, marketing_consent = false
   where id = v_uid;
  delete from auth.users where id = v_uid;  -- cascades: profile, listings, business, favorites, notifications ...
  return jsonb_build_object('ok', true);
end $$;

-- ===========================================================================
-- Cron jobs
-- ===========================================================================

-- Expire listings past expires_at and stale service requests (14 days). Returns expired listing count.
create or replace function public.expire_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.listings set status = 'expired'
   where status in ('active', 'paused') and expires_at < now();
  get diagnostics v_n = row_count;

  update public.service_requests set status = 'expired', closed_at = now()
   where status in ('admin_review', 'open', 'no_match') and created_at < now() - interval '14 days';
  update public.leads set status = 'closed_full'
   where status in ('sent', 'seen')
     and request_id in (select id from public.service_requests where status = 'expired');
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return v_n;
end $$;

-- Keep DEMO duty data for yesterday..today+60 (one pharmacy per city sector per day, 08:30 -> 08:30).
-- Returns the number of inserted duty rows.
create or replace function public.roll_demo_duty()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today date := private.current_duty_day();
  v_day date;
  v_start timestamptz;
  v_n int := 0;
  v_k int;
begin
  delete from public.pharmacy_duty where source = 'demo' and duty_end < now() - interval '7 days';
  for v_day in select generate_series(v_today - 1, v_today + 60, interval '1 day')::date loop
    v_start := (v_day + time '08:30') at time zone 'Europe/Istanbul';
    continue when exists (select 1 from public.pharmacy_duty where source = 'demo' and duty_start = v_start);
    insert into public.pharmacy_duty (poi_id, duty_start, duty_end, source, note, fetched_at)
    select x.id, v_start, v_start + interval '1 day', 'demo', 'Örnek veri - gerçek nöbet listesi değildir', now()
      from (
        select p.id,
               row_number() over (partition by p.sector order by md5(p.id::text || v_day::text)) as rn
          from (
            select poi.id,
                   floor((atan2(poi.lat - 40.8027, poi.lng - 29.4307) + pi()) / (2 * pi() / 6))::int as sector
              from public.poi
             where poi.kind = 'pharmacy'
          ) p
      ) x
     where x.rn = 1
    on conflict (poi_id, duty_start) do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Used by policies / views / generated values (must be callable by API roles).
grant execute on function
  public.tr_norm(text), public.tr_slug(text), public.short_name(text), public.tr_match(text, text),
  public.is_admin(), public.owns_business(uuid), public.business_is_public(uuid), public.owns_listing(uuid)
to anon, authenticated;

-- Public RPCs (guests allowed).
grant execute on function
  public.nearby_pois(text, double precision, double precision, int, int),
  public.duty_pharmacies_now(double precision, double precision),
  public.duty_pharmacies_for_day(date, double precision, double precision),
  public.neighbourhood_for_point(double precision, double precision),
  public.get_demo_otp(text),
  public.log_contact_event(text, uuid, text),
  public.reveal_listing_phone(uuid),
  public.increment_listing_view(uuid),
  public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text),
  public.global_search(text, int)
to anon, authenticated;

-- Signed-in RPCs.
grant execute on function
  public.renew_listing(uuid),
  public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean),
  public.get_request_for_customer(text),
  public.customer_remove_lead(uuid),
  public.close_request(text, uuid),
  public.submit_review(text, uuid, int, text),
  public.get_lead_detail(uuid),
  public.accept_lead(uuid, numeric, text),
  public.decline_lead(uuid),
  public.reply_review(uuid, text),
  public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text),
  public.admin_review_business(uuid, boolean, text),
  public.admin_review_listing(uuid, boolean, text),
  public.dispatch_request(uuid, int, uuid[]),
  public.mark_notifications_read(uuid[]),
  public.delete_my_account()
to authenticated;

-- Cron-only.
revoke execute on function public.expire_listings(), public.roll_demo_duty() from anon, authenticated;

-- Auth hook: only the auth server may call it.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.send_sms_hook(jsonb) from anon, authenticated, public;
grant insert, select, delete on table public.demo_otp to supabase_auth_admin;
