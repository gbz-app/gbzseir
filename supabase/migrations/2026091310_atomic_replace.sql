-- Atomic replace: business photos, service categories/areas and listing media are replaced in one transaction
-- (delete + insert in one RPC), so a failed save keeps the old rows. Same owner/admin rules as the RLS policies,
-- same limits as the app (20 business photos, 10 listing photos). Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. set_business_photos: p_photos = [{ "url": "https://..." }, ...] in display order. Returns the saved count.
-- ---------------------------------------------------------------------------
create or replace function public.set_business_photos(p_business_id uuid, p_photos jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if not (public.owns_business(p_business_id) or public.is_admin()) then
    raise exception 'İşletme bulunamadı' using errcode = '42501', hint = 'not_owner';
  end if;
  if jsonb_typeof(v_photos) <> 'array' then
    raise exception 'Geçersiz fotoğraf listesi' using errcode = '22023', hint = 'invalid_photos';
  end if;
  if jsonb_array_length(v_photos) > 20 then
    raise exception 'En fazla 20 fotoğraf ekleyebilirsin' using errcode = 'P0001', hint = 'too_many_photos';
  end if;
  if exists (select 1 from jsonb_array_elements(v_photos) e
              where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'url') is distinct from 'string'
                 or (e ->> 'url') !~ '^https://' or char_length(e ->> 'url') > 1000) then
    raise exception 'Geçersiz fotoğraf adresi' using errcode = '22023', hint = 'invalid_url';
  end if;

  -- One save at a time per business.
  perform 1 from public.businesses where id = p_business_id for update;

  delete from public.business_photos where business_id = p_business_id;
  insert into public.business_photos (business_id, url, sort)
  select p_business_id, e.value ->> 'url', (e.ordinality - 1)::int
    from jsonb_array_elements(v_photos) with ordinality e;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.set_business_photos(uuid, jsonb) from public, anon;
grant execute on function public.set_business_photos(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. set_business_service_scope: replaces the service categories and areas of a business (unknown ids are
--    skipped, as in apply_business). Returns { categories, areas } counts.
-- ---------------------------------------------------------------------------
create or replace function public.set_business_service_scope(p_business_id uuid, p_category_ids uuid[], p_neighbourhood_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categories int;
  v_areas int;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if not (public.owns_business(p_business_id) or public.is_admin()) then
    raise exception 'İşletme bulunamadı' using errcode = '42501', hint = 'not_owner';
  end if;

  -- One save at a time per business.
  perform 1 from public.businesses where id = p_business_id for update;

  delete from public.business_service_categories where business_id = p_business_id;
  insert into public.business_service_categories (business_id, category_id)
  select p_business_id, c.id from public.service_categories c where c.id = any (coalesce(p_category_ids, '{}'))
  on conflict do nothing;
  get diagnostics v_categories = row_count;

  delete from public.business_service_areas where business_id = p_business_id;
  insert into public.business_service_areas (business_id, neighbourhood_id)
  select p_business_id, n.id from public.neighbourhoods n where n.id = any (coalesce(p_neighbourhood_ids, '{}'))
  on conflict do nothing;
  get diagnostics v_areas = row_count;

  return jsonb_build_object('categories', v_categories, 'areas', v_areas);
end $$;

revoke all on function public.set_business_service_scope(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_business_service_scope(uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. set_listing_media: p_media = [{ "url": "https://...", "thumb_url": "https://..." | null }, ...] in display
--    order (first = cover). Returns the saved count.
-- ---------------------------------------------------------------------------
create or replace function public.set_listing_media(p_listing_id uuid, p_media jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if not (public.owns_listing(p_listing_id) or public.is_admin()) then
    raise exception 'İlan bulunamadı' using errcode = '42501', hint = 'not_owner';
  end if;
  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Geçersiz fotoğraf listesi' using errcode = '22023', hint = 'invalid_media';
  end if;
  if jsonb_array_length(v_media) > 10 then
    raise exception 'En fazla 10 fotoğraf ekleyebilirsin' using errcode = 'P0001', hint = 'too_many_photos';
  end if;
  if exists (select 1 from jsonb_array_elements(v_media) e
              where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'url') is distinct from 'string'
                 or (e ->> 'url') !~ '^https://' or char_length(e ->> 'url') > 1000
                 or (jsonb_typeof(e -> 'thumb_url') = 'string'
                     and ((e ->> 'thumb_url') !~ '^https://' or char_length(e ->> 'thumb_url') > 1000))
                 or coalesce(jsonb_typeof(e -> 'thumb_url'), 'null') not in ('string', 'null')) then
    raise exception 'Geçersiz fotoğraf adresi' using errcode = '22023', hint = 'invalid_url';
  end if;

  -- One save at a time per listing.
  perform 1 from public.listings where id = p_listing_id for update;

  delete from public.listing_media where listing_id = p_listing_id;
  insert into public.listing_media (listing_id, url, thumb_url, sort)
  select p_listing_id, e.value ->> 'url', e.value ->> 'thumb_url', (e.ordinality - 1)::int
    from jsonb_array_elements(v_media) with ordinality e;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.set_listing_media(uuid, jsonb) from public, anon;
grant execute on function public.set_listing_media(uuid, jsonb) to authenticated;
