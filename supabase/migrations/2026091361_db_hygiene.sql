-- DB hygiene (audit follow-up). Re-runnable. Function bodies start from the live definitions (pg_get_functiondef).
--  a) EXECUTE on private helpers. anon / authenticated never call these directly, so the default PUBLIC grant goes:
--     assert_admin, audit, tr_label (only called from security-definer admin RPCs and audit triggers) and the trigger
--     functions audit_*, contact_messages_before_write, events_before_write (a firing trigger needs no EXECUTE).
--     The four *_impl functions run from security-invoker triggers as the writing role, and is_banned is used by RLS
--     policies, so anon / authenticated keep EXECUTE on those; only PUBLIC goes (service_role keeps it explicitly).
--  b) get_request_for_customer: a banned owner's firm stays in the customer's accepted list, without its phone.
--  c) listings_update_impl: draft/rejected -> pending_review and paused -> active respect listing_active_cap like a new
--     listing (2026091304). Admins are exempt. Latest body: 2026091304 / 2026091311 (live). renew_listing gets the same
--     cap for expired -> active (it is security definer, so the trigger does not enforce there).
--  d) business_photos, business_service_categories, business_service_areas and listing_media are written only through
--     security-definer RPCs (set_business_photos, set_business_service_scope, set_listing_media, apply_business) and
--     by the seeds (postgres). Owners lose direct insert / update / delete; admins keep it; reads are unchanged.

-- ---------------------------------------------------------------------------
-- a) Private function EXECUTE
-- ---------------------------------------------------------------------------
revoke all on function private.assert_admin() from public, anon, authenticated;
revoke all on function private.audit(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.tr_label(text, text) from public, anon, authenticated;
revoke all on function private.audit_auth_login() from public, anon, authenticated;
revoke all on function private.audit_businesses() from public, anon, authenticated;
revoke all on function private.audit_finance() from public, anon, authenticated;
revoke all on function private.audit_listings() from public, anon, authenticated;
revoke all on function private.audit_misc() from public, anon, authenticated;
revoke all on function private.audit_profiles() from public, anon, authenticated;
revoke all on function private.contact_messages_before_write() from public, anon, authenticated;
revoke all on function private.events_before_write() from public, anon, authenticated;

-- Called by the security-invoker triggers businesses_before_write, listings_before_insert / _update and profiles_protect.
revoke all on function private.businesses_write_impl(public.businesses, public.businesses, text, text) from public;
grant execute on function private.businesses_write_impl(public.businesses, public.businesses, text, text) to anon, authenticated, service_role;
revoke all on function private.listings_insert_impl(public.listings, text) from public;
grant execute on function private.listings_insert_impl(public.listings, text) to anon, authenticated, service_role;
revoke all on function private.listings_update_impl(public.listings, public.listings, text) from public;
grant execute on function private.listings_update_impl(public.listings, public.listings, text) to anon, authenticated, service_role;
revoke all on function private.profiles_protect_impl(public.profiles, public.profiles, text) from public;
grant execute on function private.profiles_protect_impl(public.profiles, public.profiles, text) to anon, authenticated, service_role;

-- Used by RLS policies (2026091311); already without PUBLIC.
revoke all on function private.is_banned(uuid) from public;
grant execute on function private.is_banned(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- b) Customer request view: no phone for a banned owner's firm
-- ---------------------------------------------------------------------------
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
      'stalled_at', v_r.stalled_at,
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
                 'verification_level', b.verification_level,
                 -- A banned owner's firm stays listed, but cannot be called.
                 'phone', case when private.is_banned(b.owner_id) then null else b.phone end,
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

revoke all on function public.get_request_for_customer(text) from public, anon;
grant execute on function public.get_request_for_customer(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- c) Active-listing cap on status transitions
-- ---------------------------------------------------------------------------
create or replace function private.listings_update_impl(p_new public.listings, p_old public.listings, p_caller text)
returns public.listings
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := p_caller in ('authenticated', 'anon') and not public.is_admin();
  v_cat public.listing_categories;
  v_days int := private.app_setting_int('listing_days', 30);
  v_old_flags int := coalesce(array_length(p_old.flags, 1), 0);
  v_active_cap int;
begin
  if v_enforce then
    p_new.id := p_old.id;
    p_new.owner_id := p_old.owner_id;
    p_new.type := p_old.type;
    p_new.business_id := p_old.business_id;
    p_new.view_count := p_old.view_count;
    p_new.call_count := p_old.call_count;
    p_new.published_at := p_old.published_at;
    p_new.expires_at := p_old.expires_at;
    p_new.rejection_reason := p_old.rejection_reason;
    p_new.is_demo := p_old.is_demo;
    p_new.created_at := p_old.created_at;

    if p_old.status = 'deleted' then
      raise exception 'Silinmiş ilan düzenlenemez' using errcode = '42501';
    end if;

    if p_new.category_id is distinct from p_old.category_id then
      select * into v_cat from public.listing_categories where id = p_new.category_id;
      if not found or v_cat.is_banned or v_cat.type <> p_old.type then
        raise exception 'Bu kategoride ilan verilemez' using errcode = 'P0001', hint = 'banned_category';
      end if;
    end if;

    if p_new.status is distinct from p_old.status then
      if p_new.status = 'deleted' then
        null;
      elsif p_new.status = 'paused' and p_old.status = 'active' then
        null;
      elsif p_new.status = 'active' and p_old.status = 'paused' and p_old.expires_at > now() then
        null;
      elsif p_new.status = 'sold' and p_old.type = 'classified' and p_old.status in ('active', 'paused', 'expired') then
        null;
      elsif p_new.status = 'filled' and p_old.type = 'job' and p_old.status in ('active', 'paused', 'expired') then
        null;
      elsif p_new.status = 'draft' and p_old.status in ('draft', 'rejected') then
        null;
      elsif p_new.status = 'pending_review' and p_old.status in ('draft', 'rejected') then
        p_new.flags := private.listing_flags(p_new.title, p_new.description);
        p_new.status := private.initial_listing_status(p_old.owner_id, p_new.flags);
        p_new.rejection_reason := null;
        if p_new.status = 'active' then
          p_new.published_at := coalesce(p_old.published_at, now());
          p_new.expires_at := now() + make_interval(days => v_days);
        end if;
      else
        raise exception 'Bu durum değişikliği yapılamaz (% -> %)', p_old.status, p_new.status
          using errcode = '42501', hint = 'invalid_status_transition';
      end if;

      -- Into a status the active cap counts: same listing_active_cap as a new listing (the listing itself is not
      -- counted, so a paused listing within the cap can always resume). Same per-user lock as listings_insert_impl.
      if p_old.status in ('draft', 'rejected', 'paused') and p_new.status in ('active', 'pending_review') then
        perform pg_advisory_xact_lock(hashtext('listings_insert:' || p_old.owner_id::text));
        v_active_cap := private.app_setting_int('listing_active_cap', 50);
        if v_active_cap > 0 and (select count(*) from public.listings
                                  where owner_id = p_old.owner_id and id <> p_old.id
                                    and status in ('active', 'pending_review', 'paused')) >= v_active_cap then
          raise exception 'Aynı anda en fazla % açık ilanın olabilir (yayında, onay bekleyen ve durdurulmuş). Bu ilanı yayına almak için eskilerinden birini sil ya da satıldı/doldu olarak işaretle.', v_active_cap
            using errcode = 'P0001', hint = 'listing_active_cap';
        end if;
      end if;
    end if;
  end if;

  p_new.flags := private.listing_flags(p_new.title, p_new.description);
  -- Editing an active listing so that it gets new red flags sends it back to review.
  if v_enforce and p_new.status = 'active' and coalesce(array_length(p_new.flags, 1), 0) > v_old_flags then
    p_new.status := 'pending_review';
  end if;
  if p_new.status = 'active' and p_new.published_at is null then
    p_new.published_at := now();
  end if;

  p_new := private.listings_search_fields(p_new);
  p_new.updated_at := now();
  return p_new;
end $$;

revoke all on function private.listings_update_impl(public.listings, public.listings, text) from public;
grant execute on function private.listings_update_impl(public.listings, public.listings, text) to anon, authenticated, service_role;

-- renew_listing (security definer, so the trigger above does not enforce): expired -> active is the same move into
-- the active cap. Live body plus the cap block; admins exempt.
create or replace function public.renew_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.listings;
  v_days int := private.app_setting_int('listing_days', 30);
  v_active_cap int;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found or (v_l.owner_id <> auth.uid() and not public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_l.status not in ('active', 'paused', 'expired') or v_l.published_at is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_l.status);
  end if;
  if v_l.status = 'expired' and not public.is_admin() then
    perform pg_advisory_xact_lock(hashtext('listings_insert:' || v_l.owner_id::text));
    v_active_cap := private.app_setting_int('listing_active_cap', 50);
    if v_active_cap > 0 and (select count(*) from public.listings
                              where owner_id = v_l.owner_id and id <> v_l.id
                                and status in ('active', 'pending_review', 'paused')) >= v_active_cap then
      raise exception 'Aynı anda en fazla % açık ilanın olabilir (yayında, onay bekleyen ve durdurulmuş). Bu ilanı yeniden yayına almak için eskilerinden birini sil ya da satıldı/doldu olarak işaretle.', v_active_cap
        using errcode = 'P0001', hint = 'listing_active_cap';
    end if;
  end if;
  update public.listings
     set expires_at = now() + make_interval(days => v_days),
         status = case when status = 'expired' then 'active' else status end
   where id = p_listing_id
   returning * into v_l;
  return jsonb_build_object('ok', true, 'status', v_l.status, 'expires_at', v_l.expires_at);
end $$;

revoke all on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- d) Child tables written only through the RPCs: admins keep direct write
-- ---------------------------------------------------------------------------
drop policy if exists "owner write" on public.business_photos;
drop policy if exists "admin write" on public.business_photos;
create policy "admin write" on public.business_photos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "owner write" on public.business_service_categories;
drop policy if exists "admin write" on public.business_service_categories;
create policy "admin write" on public.business_service_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "owner write" on public.business_service_areas;
drop policy if exists "admin write" on public.business_service_areas;
create policy "admin write" on public.business_service_areas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "owner write" on public.listing_media;
drop policy if exists "admin write" on public.listing_media;
create policy "admin write" on public.listing_media for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
