-- "Engelli" (profiles.status = 'banned') is enforced in the database. Sign-in itself is blocked by the admin action
-- (Supabase Auth ban); this migration covers content and writes:
--  * private.is_banned(uid): helper, also used by RLS policies (so anon / authenticated may execute it).
--  * A banned user's businesses (with their menus, photos, rooms, services, events and reviews), listings and own
--    reviews are hidden from everyone but the user and admins. Nothing is deleted, so lifting the ban restores all.
--  * Ratings leave out reviews by banned users; they are recomputed when a ban is set or lifted.
--  * accept_lead, reply_review, submit_review, events insert and submit_contact_message refuse a banned caller whose old session
--    is still valid (submit_report already does, 2026091301). Dispatch skips firms of banned owners.
-- Builds on 2026091300 (submit_contact_message) and 2026091301. Re-runnable.

-- 1) Helper.
create or replace function private.is_banned(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_uid and status = 'banned')
$$;

revoke all on function private.is_banned(uuid) from public;
grant execute on function private.is_banned(uuid) to anon, authenticated, service_role;

-- 2) Public visibility. business_is_public() drives the read policies of every business child table
--    (menus, photos, rooms, services, service areas / categories), events and reviews.
create or replace function public.business_is_public(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
     where b.id = p_business_id and b.status = 'approved' and not private.is_banned(b.owner_id)
  )
$$;

revoke all on function public.business_is_public(uuid) from public;
grant execute on function public.business_is_public(uuid) to anon, authenticated, service_role;

drop policy if exists "public read approved" on public.businesses;
create policy "public read approved" on public.businesses for select to anon, authenticated
  using ((status = 'approved' and not private.is_banned(owner_id)) or owner_id = (select auth.uid()) or public.is_admin());

-- listing_media's public read checks listings in a subquery, so it follows this policy too.
drop policy if exists "public read published" on public.listings;
create policy "public read published" on public.listings for select to anon, authenticated
  using (status in ('active', 'sold', 'filled') and not private.is_banned(owner_id));

-- Reviews by a banned author are hidden too (the business owner cannot see or answer them either).
drop policy if exists "public read" on public.reviews;
create policy "public read" on public.reviews for select to anon, authenticated
  using ((not private.is_banned(author_id) and (public.business_is_public(business_id) or public.owns_business(business_id)))
         or author_id = (select auth.uid()) or public.is_admin());

-- Events: the public read policy already goes through business_is_public(); inserts also need an unbanned caller.
drop policy if exists "owner insert" on public.events;
create policy "owner insert" on public.events for insert to authenticated
  with check ((business_id is not null and public.owns_business(business_id) and public.business_is_public(business_id)
               and not private.is_banned((select auth.uid())))
              or public.is_admin());

-- 3) Ratings without banned authors.
create or replace function private.recompute_business_rating(p_business_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.businesses b
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r
                                 where r.business_id = b.id and not private.is_banned(r.author_id)), 0),
         rating_count = (select count(*) from public.reviews r
                          where r.business_id = b.id and not private.is_banned(r.author_id))
   where b.id = p_business_id
$$;

revoke all on function private.recompute_business_rating(uuid) from public, anon, authenticated;

-- Setting or lifting a ban recomputes the ratings of every business the user reviewed.
create or replace function private.profiles_ban_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if (old.status = 'banned') is distinct from (new.status = 'banned') then
    for v_business in select distinct r.business_id from public.reviews r where r.author_id = new.id loop
      perform private.recompute_business_rating(v_business);
    end loop;
  end if;
  return null;
end $$;

revoke all on function private.profiles_ban_changed() from public, anon, authenticated;

drop trigger if exists profiles_ban_changed on public.profiles;
create trigger profiles_ban_changed after update of status on public.profiles
  for each row when (old.status is distinct from new.status) execute function private.profiles_ban_changed();

-- Review RPCs use the same rating rule (latest bodies: 2026091280_user_reviews / 20260910000003_rpc).
create or replace function public.submit_business_review(p_business_id uuid, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b public.businesses;
  v_id uuid;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');
begin
  if v_uid is null then
    raise exception 'Yorum yapmak için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status in ('banned', 'restricted')) then
    return jsonb_build_object('ok', false, 'reason', 'restricted');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rating');
  end if;
  select * into v_b from public.businesses where id = p_business_id;
  if not found or not public.business_is_public(v_b.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_b.owner_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own_business');
  end if;

  insert into public.reviews (business_id, author_id, rating, comment)
  values (p_business_id, v_uid, p_rating, v_comment)
  on conflict (business_id, author_id) where request_id is null
    do update set rating = excluded.rating, comment = excluded.comment
  returning id into v_id;

  perform private.recompute_business_rating(p_business_id);

  perform private.notify(v_b.owner_id, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
    v_b.name || ' için bir kullanıcı değerlendirme yaptı.', '/isletme/sec?b=' || v_b.id || '&next=/isletme/yorumlar');
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $$;

revoke all on function public.submit_business_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_business_review(uuid, integer, text) to authenticated, service_role;

create or replace function public.submit_review(p_request_code text, p_business_id uuid, p_rating integer, p_comment text default null)
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
  if private.is_banned(auth.uid()) then
    raise exception 'Hesabın engellendiği için değerlendirme yapamazsın' using errcode = '42501', hint = 'banned';
  end if;
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
  perform private.recompute_business_rating(p_business_id);
  select owner_id, name into v_owner, v_name from public.businesses where id = p_business_id;
  perform private.notify(v_owner, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
    v_name || ' için bir müşterin değerlendirme yaptı.', '/isletme/sec?b=' || p_business_id || '&next=/isletme/yorumlar');
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $$;

revoke all on function public.submit_review(text, uuid, integer, text) from public, anon;
grant execute on function public.submit_review(text, uuid, integer, text) to authenticated, service_role;

create or replace function public.delete_my_business_review(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  delete from public.reviews where business_id = p_business_id and author_id = v_uid and request_id is null;
  get diagnostics v_n = row_count;
  perform private.recompute_business_rating(p_business_id);
  return jsonb_build_object('ok', v_n > 0);
end $$;

revoke all on function public.delete_my_business_review(uuid) from public, anon;
grant execute on function public.delete_my_business_review(uuid) to authenticated, service_role;

-- 4) Writes of a banned caller (an access token stays valid up to 1 hour after the Auth ban).
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
  if private.is_banned(auth.uid()) then
    raise exception 'Hesabın engellendiği için bu işlemi yapamazsın' using errcode = '42501', hint = 'banned';
  end if;
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

revoke all on function public.accept_lead(uuid, numeric, text) from public, anon;
grant execute on function public.accept_lead(uuid, numeric, text) to authenticated, service_role;

create or replace function public.reply_review(p_review_id uuid, p_reply text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if private.is_banned(auth.uid()) then
    raise exception 'Hesabın engellendiği için yanıt veremezsin' using errcode = '42501', hint = 'banned';
  end if;
  update public.reviews r
     set reply = nullif(left(btrim(coalesce(p_reply, '')), 1000), ''), replied_at = now()
   where r.id = p_review_id
     and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = auth.uid());
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

revoke all on function public.reply_review(uuid, text) from public, anon;
grant execute on function public.reply_review(uuid, text) to authenticated, service_role;

-- submit_contact_message: body from 2026091300 plus the ban check. Banned users are refused while their old session
-- lasts; the guest form (with phone / e-mail) stays open to everyone.
create or replace function public.submit_contact_message(
  p_topic text,
  p_message text,
  p_subject text default null,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_business_name text default null,
  p_page_path text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_message text := btrim(coalesce(p_message, ''));
  v_ip text := private.request_ip_hash();
  v_recent int;
  v_id uuid;
begin
  if v_uid is not null and private.is_banned(v_uid) then
    raise exception 'Hesabın engellendiği için mesaj gönderemezsin' using errcode = '42501', hint = 'banned';
  end if;
  if p_topic is null or p_topic not in ('sikayet', 'teknik_destek', 'reklam', 'isletme', 'oneri', 'diger', 'bilgi_duzeltme') then
    raise exception 'Geçersiz konu' using errcode = '22023', hint = 'invalid_topic';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 2000 then
    raise exception 'Mesaj 10-2000 karakter olmalı' using errcode = '22023', hint = 'invalid_message';
  end if;
  -- Guests need a way to be reached, except for place corrections.
  if v_uid is null and v_phone is null and v_email is null and p_topic <> 'bilgi_duzeltme' then
    raise exception 'Sana ulaşabilmemiz için telefon ya da e-posta yaz' using errcode = '22023', hint = 'contact_required';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-posta adresi geçersiz' using errcode = '22023', hint = 'invalid_email';
  end if;
  if v_phone is not null then
    v_phone := coalesce(private.phone_e164(v_phone), v_phone);
    if char_length(v_phone) > 20 then
      raise exception 'Telefon numarası geçersiz' using errcode = '22023', hint = 'invalid_phone';
    end if;
  end if;

  -- Serialize per user (all guests share one lock) so parallel calls cannot race past the counts below.
  perform pg_advisory_xact_lock(hashtext('submit_contact_message:' || coalesce(v_uid::text, 'guest')));

  if v_uid is not null then
    -- 5 messages per hour per user.
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour' and user_id = v_uid;
    if v_recent >= 5 then
      raise exception 'Çok fazla mesaj gönderdin, biraz sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  else
    -- Guests: 5 per hour per IP hash or per phone / e-mail.
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour'
       and user_id is null
       and ((v_ip is not null and ip_hash = v_ip) or (v_phone is not null and phone = v_phone) or (v_email is not null and email = v_email));
    if v_recent >= 5 then
      raise exception 'Çok fazla mesaj gönderdin, biraz sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    -- Global guest cap (also covers requests without an IP hash).
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour' and user_id is null;
    if v_recent >= 60 then
      raise exception 'Şu an çok fazla mesaj geliyor, biraz sonra tekrar dene ya da giriş yapıp gönder' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  end if;

  insert into public.contact_messages (user_id, topic, subject, message, name, phone, email, business_name, page_path, user_agent, ip_hash)
  values (
    v_uid,
    p_topic,
    nullif(left(btrim(coalesce(p_subject, '')), 120), ''),
    v_message,
    nullif(left(btrim(coalesce(p_name, '')), 80), ''),
    v_phone,
    v_email,
    nullif(left(btrim(coalesce(p_business_name, '')), 120), ''),
    nullif(left(coalesce(p_page_path, ''), 300), ''),
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    v_ip
  )
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- 5) Hidden content stays hidden behind the RPCs that bypass RLS.
-- Phone of a banned owner's listing is not revealed (latest body: live definition).
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
  if (v_l.status <> 'active' or private.is_banned(v_l.owner_id)) and not v_is_owner and not public.is_admin() then
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

revoke all on function public.reveal_listing_phone(uuid) from public;
grant execute on function public.reveal_listing_phone(uuid) to anon, authenticated, service_role;

-- Service request dispatch skips firms of banned owners (latest body: 2026091251_business_open_fixes).
-- Only called from security-definer functions (dispatch_request, admin_request_candidates).
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
       and not private.is_banned(b.owner_id)
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

revoke all on function private.match_candidates(uuid, uuid[]) from public, anon, authenticated;
