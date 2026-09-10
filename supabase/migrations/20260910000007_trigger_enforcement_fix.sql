-- Gebzem: FIX for owner-side column/status protection triggers.
-- Bug: the trigger functions were SECURITY DEFINER, so inside them current_user was always the owner
-- ('postgres') and the "direct API write by an end user" check (current_user in ('authenticated','anon'))
-- never matched: users could change their own role, self-approve listings, etc.
-- Fix: triggers are now thin SECURITY INVOKER wrappers that pass the real current_user to SECURITY DEFINER
-- implementations. Direct PostgREST writes run as 'authenticated'/'anon' -> enforced; writes performed inside
-- our SECURITY DEFINER RPCs, cron jobs and seed scripts run as 'postgres'/'service_role' -> trusted.
-- Re-runnable.
set search_path = public, extensions;

-- The wrappers (running as the caller) must be able to reach the implementation functions.
-- PostgREST does not expose schema "private", so this does not make anything callable over the API.
grant usage on schema private to anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
revoke execute on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create or replace function private.profiles_protect_impl(p_new public.profiles, p_old public.profiles, p_caller text)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_caller in ('authenticated', 'anon') and not public.is_admin() then
    p_new.id := p_old.id;
    p_new.phone := p_old.phone;
    p_new.role := p_old.role;
    p_new.status := p_old.status;
    p_new.trusted_publisher := p_old.trusted_publisher;
    p_new.is_demo := p_old.is_demo;
    p_new.created_at := p_old.created_at;
  end if;
  p_new.updated_at := now();
  return p_new;
end $$;

create or replace function private.profiles_protect()
returns trigger
language plpgsql
security invoker
as $$
begin
  new := private.profiles_protect_impl(new, old, current_user::text);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create or replace function private.businesses_write_impl(p_new public.businesses, p_old public.businesses, p_op text, p_caller text)
returns public.businesses
language plpgsql
security definer
set search_path = public, extensions
as $$
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
end $$;

create or replace function private.businesses_before_write()
returns trigger
language plpgsql
security invoker
as $$
begin
  new := private.businesses_write_impl(new, old, tg_op, current_user::text);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- listings
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
      select id into v_biz from public.businesses where owner_id = p_new.owner_id and status = 'approved' limit 1;
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

create or replace function private.listings_before_insert()
returns trigger
language plpgsql
security invoker
as $$
begin
  new := private.listings_insert_impl(new, current_user::text);
  return new;
end $$;

create or replace function private.listings_before_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  new := private.listings_update_impl(new, old, current_user::text);
  return new;
end $$;

-- Only the implementation functions are callable by API roles (needed by the invoker wrappers).
grant execute on function
  private.profiles_protect_impl(public.profiles, public.profiles, text),
  private.businesses_write_impl(public.businesses, public.businesses, text, text),
  private.listings_insert_impl(public.listings, text),
  private.listings_update_impl(public.listings, public.listings, text)
to anon, authenticated;
