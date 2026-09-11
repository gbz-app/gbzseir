-- Request photos private: service-request photos are stored in private-docs/<customer uid>/requests/ (paths, not URLs)
-- and served by /api/talep-foto as short-lived signed URLs to the customer, firms with a lead on the request and admins.
-- media keeps its public URLs (public bucket) but anon can no longer list it. Re-runnable.
-- private-docs already has owner insert/read/delete + admin read under "<auth.uid()>/..." (20260910000004_storage.sql),
-- which covers <uid>/requests/; matched firms never read the bucket directly (the route signs with the service role).

-- ---------------------------------------------------------------------------
-- 1. media: SELECT only for the owner's folder or admins (list / remove). Public object URLs need no policy.
-- ---------------------------------------------------------------------------
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media owner or admin read" on storage.objects;
create policy "media owner or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- 2. A stored request photo: "<customer uid>/requests/<uuid>.<ext>" (photo-store.ts).
-- ---------------------------------------------------------------------------
create or replace function private.is_request_photo_path(p_path text, p_customer_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_path ~ ('^' || p_customer_id::text || '/requests/[0-9A-Fa-f-]{36}\.(webp|jpe?g|png)$'), false);
$$;

revoke all on function private.is_request_photo_path(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who may see a request's photos: the customer, owners of a business with a lead on it (any lead status, as
--    get_lead_detail; not a banned owner whose old session is still valid), admins.
-- ---------------------------------------------------------------------------
create or replace function private.can_view_request_photo(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (select 1 from public.service_requests r where r.id = p_request_id and r.customer_id = auth.uid())
    or (exists (select 1 from public.leads l
                  join public.businesses b on b.id = l.business_id
                 where l.request_id = p_request_id and b.owner_id = auth.uid())
        and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'banned')));
$$;

revoke all on function private.can_view_request_photo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage paths of a request's photos for /api/talep-foto (null = not allowed / not found). Same positions as
--    service_requests.photos; an entry that is not the customer's own request photo comes back as null.
-- ---------------------------------------------------------------------------
create or replace function public.get_request_photo_paths(p_request_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r public.service_requests;
begin
  if not private.can_view_request_photo(p_request_id) then
    return null;
  end if;
  select * into v_r from public.service_requests where id = p_request_id;
  if not found then
    return null;
  end if;
  return array(
    select case when private.is_request_photo_path(u.p, v_r.customer_id) then u.p end
      from unnest(v_r.photos) with ordinality as u(p, ord)
     order by u.ord);
end $$;

revoke all on function public.get_request_photo_paths(uuid) from public, anon;
grant execute on function public.get_request_photo_paths(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. New photos must be private-docs paths in the customer's own requests folder (no public URLs, no other
--    folders). An old cached app that still sends media URLs gets a "refresh" message instead of public photos.
-- ---------------------------------------------------------------------------
create or replace function private.service_requests_photos_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(coalesce(new.photos, '{}'::text[])) as u(p)
              where not private.is_request_photo_path(u.p, new.customer_id)) then
    raise exception 'Fotoğraflar yüklenemedi. Sayfayı yenileyip tekrar dene.' using errcode = 'P0001', hint = 'invalid_photos';
  end if;
  return new;
end $$;

revoke all on function private.service_requests_photos_check() from public, anon, authenticated;

drop trigger if exists service_requests_photos_check on public.service_requests;
create trigger service_requests_photos_check
  before insert or update of photos on public.service_requests
  for each row execute function private.service_requests_photos_check();

-- ---------------------------------------------------------------------------
-- 6. Existing photos: files cannot be moved in SQL. When this ran there were none (no request had photos and media
--    held no */requests/* objects); if any show up, copy them to private-docs with the one-off move script and store
--    the paths. This only reports them.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows int;
begin
  select count(*) into v_rows
    from public.service_requests r
   where exists (select 1 from unnest(r.photos) as u(p) where not private.is_request_photo_path(u.p, r.customer_id));
  if v_rows > 0 then
    raise notice 'request photos: % request(s) still have photos outside private-docs/<uid>/requests/', v_rows;
  end if;
end $$;
