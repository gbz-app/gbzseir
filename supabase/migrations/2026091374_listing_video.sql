-- Listing video (one optional clip per 2. el listing) and the media adapter (Cloudflare R2 next to Supabase Storage).
-- a) app_settings 'media_public_base': public base URL of the R2 bucket (https://pub-xxxx.r2.dev). The lead sets it;
--    null (default) = only Supabase media URLs are accepted anywhere.
-- b) private.media_public_base(), private.own_media_url(url, uid): one of OUR storage URLs under the user's own folder.
-- c) private.media_uploads + public.reserve_media_upload: every presigned upload (/api/media/upload-url) is recorded
--    first. Per user per 24 h: 100 files, 10 videos, 1 GiB (R2 has no storage RLS, so the cap lives here). Only keys
--    recorded here can become a listing video.
-- d) public.listing_videos: at most one video per listing (listing_id is the primary key), readable exactly when the
--    listing itself is readable. public.media_trash + trigger: replaced / removed videos (owner, admin, listing purge,
--    account delete) are queued; /api/cron/purge-listings (public app, holds the R2 key) deletes the files.
-- e) public.set_listing_video (owner only, classified only, own R2 key, <= 60 s) and
--    public.admin_remove_listing_video (admin, audit, owner notified).
-- f) public.set_listing_media (live body from 2026091310): URLs must be the listing owner's own storage URLs or
--    already be on the listing (keeps old / seed photos editable).


-- a) setting ------------------------------------------------------------------------------------------------------------
insert into public.app_settings (key, value) values ('media_public_base', 'null'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings drop constraint if exists app_settings_media_public_base_check;
alter table public.app_settings add constraint app_settings_media_public_base_check check (
  key <> 'media_public_base'
  or value = 'null'::jsonb
  or (jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(/[A-Za-z0-9._-]+)*/?$')
);


-- b) URL helpers ----------------------------------------------------------------------------------------------------------
create or replace function private.media_public_base()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(rtrim(s.value #>> '{}', '/'), '')
    from public.app_settings s
   where s.key = 'media_public_base' and jsonb_typeof(s.value) = 'string'
$$;
revoke all on function private.media_public_base() from public, anon, authenticated;

-- Supabase public media prefix of THIS project (fboythglcjofakbskstg) or the R2 base, then '<uid>/', then a safe
-- path (no '..', no query / fragment / percent-escapes). Same rule as isOwnMediaUrl in src/lib/media/kinds.ts.
create or replace function private.own_media_url(p_url text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_url is not null and p_uid is not null
    and char_length(p_url) <= 1000
    and position('..' in p_url) = 0
    and p_url !~ '[?#%\\]'
    and exists (
      select 1
        from (values ('https://fboythglcjofakbskstg.supabase.co/storage/v1/object/public/media'),
                     (private.media_public_base())) b(base)
       where b.base is not null
         and left(p_url, char_length(b.base) + 38) = b.base || '/' || p_uid::text || '/'
         and substr(p_url, char_length(b.base) + 39) ~ '^[A-Za-z0-9_-][A-Za-z0-9._/-]*$'
    ), false)
$$;
revoke all on function private.own_media_url(text, uuid) from public, anon, authenticated;


-- c) upload reservations + quota ----------------------------------------------------------------------------------------
create table if not exists private.media_uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('listing-photo', 'listing-video', 'listing-poster')),
  object_key text not null unique check (char_length(object_key) <= 300),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index if not exists media_uploads_user_created on private.media_uploads (user_id, created_at desc);
alter table private.media_uploads enable row level security;
revoke all on private.media_uploads from public, anon, authenticated;

create or replace function public.reserve_media_upload(p_kind text, p_key text, p_content_type text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_types text[];
  v_max bigint;
  v_ext text;
  v_files int;
  v_videos int;
  v_bytes bigint;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if private.is_banned(v_uid) then
    raise exception 'Hesabın engellendiği için dosya yükleyemezsin' using errcode = '42501', hint = 'banned';
  end if;
  case p_kind
    when 'listing-photo' then v_types := array['image/jpeg', 'image/png', 'image/webp']; v_max := 5242880;
    when 'listing-video' then v_types := array['video/mp4', 'video/quicktime', 'video/webm']; v_max := 104857600;
    when 'listing-poster' then v_types := array['image/jpeg']; v_max := 1048576;
    else raise exception 'Geçersiz dosya türü' using errcode = '22023', hint = 'invalid_kind';
  end case;
  v_ext := case p_content_type
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' end;
  if p_content_type is null or not (p_content_type = any (v_types)) or p_size is null or p_size <= 0 or p_size > v_max then
    raise exception 'Dosya türü ya da boyutu uygun değil' using errcode = '22023', hint = 'invalid_file';
  end if;
  if p_key is null
     or p_key !~ ('^' || v_uid::text || '/listings/[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || v_ext || '$') then
    raise exception 'Geçersiz dosya adı' using errcode = '22023', hint = 'invalid_key';
  end if;

  perform pg_advisory_xact_lock(hashtext('media_upload:' || v_uid::text));
  delete from private.media_uploads where user_id = v_uid and created_at < now() - interval '30 days';
  select count(*), count(*) filter (where kind = 'listing-video'), coalesce(sum(size_bytes), 0)
    into v_files, v_videos, v_bytes
    from private.media_uploads
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if not public.is_admin() and (v_files >= 100 or (p_kind = 'listing-video' and v_videos >= 10) or v_bytes + p_size > 1073741824) then
    raise exception 'Bugün çok fazla dosya yükledin. Yarın tekrar dene.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into private.media_uploads (user_id, kind, object_key, content_type, size_bytes)
  values (v_uid, p_kind, p_key, p_content_type, p_size);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.reserve_media_upload(text, text, text, bigint) from public, anon;
grant execute on function public.reserve_media_upload(text, text, text, bigint) to authenticated;


-- d) listing_videos + trash ---------------------------------------------------------------------------------------------
create table if not exists public.listing_videos (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  url text not null unique check (char_length(url) <= 1000 and url ~ '^https://'),
  poster_url text check (poster_url is null or (char_length(poster_url) <= 1000 and poster_url ~ '^https://')),
  duration_s numeric(6, 2) not null check (duration_s > 0 and duration_s <= 60.5),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  mime text not null check (mime in ('video/mp4', 'video/quicktime', 'video/webm')),
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  provider text not null default 'r2' check (provider in ('r2', 'supabase')),
  created_at timestamptz not null default now()
);
create index if not exists listing_videos_poster_url on public.listing_videos (poster_url);

alter table public.listing_videos enable row level security;
-- The subquery runs under the caller's listings RLS ("public read published" or "owner read"), so a video is visible
-- exactly when its listing is: live / sold / filled with an unbanned owner and a public business, or own, or admin.
drop policy if exists "public read" on public.listing_videos;
create policy "public read" on public.listing_videos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_videos.listing_id));
-- Owners write only through set_listing_video; admins keep direct access (like listing_media, 2026091361).
drop policy if exists "admin write" on public.listing_videos;
create policy "admin write" on public.listing_videos
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete, truncate on public.listing_videos from anon;

create table if not exists public.media_trash (
  url text primary key check (char_length(url) <= 1000),
  owner_id uuid,
  reason text not null default 'listing_video',
  created_at timestamptz not null default now()
);
-- Service role only (the purge cron): RLS on and no policies.
alter table public.media_trash enable row level security;
revoke all on public.media_trash from anon, authenticated;

create or replace function private.listing_videos_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- Null while the listing itself is being hard-deleted (cascade); owner_id is informational only.
  select l.owner_id into v_owner from public.listings l where l.id = old.listing_id;
  insert into public.media_trash (url, owner_id, reason)
  select u, v_owner, 'listing_video'
    from unnest(case
                  when tg_op = 'DELETE' then array[old.url, old.poster_url]
                  else array[case when old.url is distinct from new.url then old.url end,
                             case when old.poster_url is distinct from new.poster_url then old.poster_url end]
                end) u
   where u is not null
  on conflict (url) do nothing;
  return null;
end $$;
revoke all on function private.listing_videos_trash() from public, anon, authenticated;

drop trigger if exists listing_videos_trash on public.listing_videos;
create trigger listing_videos_trash
  after delete or update on public.listing_videos
  for each row execute function private.listing_videos_trash();


-- e) RPCs ------------------------------------------------------------------------------------------------------------------
create or replace function public.set_listing_video(p_listing_id uuid, p_video jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings;
  v_base text := private.media_public_base();
  v_key_re text;
  v_url text;
  v_poster text;
  v_key text;
  v_poster_key text;
  v_size bigint;
  v_mime text;
  v_duration numeric;
  v_width int;
  v_height int;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if private.is_banned(v_uid) then
    raise exception 'Hesabın engellendiği için video ekleyemezsin' using errcode = '42501', hint = 'banned';
  end if;
  -- Owner only (admins remove videos with admin_remove_listing_video). One save at a time per listing.
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.owner_id <> v_uid or v_l.status = 'deleted' then
    raise exception 'İlan bulunamadı' using errcode = '42501', hint = 'not_owner';
  end if;
  if v_l.type <> 'classified' then
    raise exception 'İş ilanlarına video eklenemez' using errcode = 'P0001', hint = 'video_not_allowed';
  end if;

  if p_video is null or jsonb_typeof(p_video) = 'null' then
    delete from public.listing_videos where listing_id = p_listing_id;
    return jsonb_build_object('ok', true, 'video', null);
  end if;

  if jsonb_typeof(p_video) <> 'object'
     or jsonb_typeof(p_video -> 'url') is distinct from 'string'
     or jsonb_typeof(p_video -> 'duration_s') is distinct from 'number'
     or coalesce(jsonb_typeof(p_video -> 'poster_url'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_video -> 'width'), 'null') not in ('number', 'null')
     or coalesce(jsonb_typeof(p_video -> 'height'), 'null') not in ('number', 'null') then
    raise exception 'Geçersiz video bilgisi' using errcode = '22023', hint = 'invalid_video';
  end if;
  if v_base is null then
    raise exception 'Video yükleme şu an kapalı' using errcode = 'P0001', hint = 'video_unavailable';
  end if;

  v_url := p_video ->> 'url';
  v_poster := p_video ->> 'poster_url';
  v_duration := round((p_video ->> 'duration_s')::numeric, 2);
  v_width := case when jsonb_typeof(p_video -> 'width') = 'number' then round((p_video ->> 'width')::numeric)::int end;
  v_height := case when jsonb_typeof(p_video -> 'height') = 'number' then round((p_video ->> 'height')::numeric)::int end;
  if v_duration <= 0 or v_duration > 60.5 then
    raise exception 'Video en fazla 60 saniye olabilir' using errcode = 'P0001', hint = 'video_too_long';
  end if;
  if (v_width is not null and (v_width < 1 or v_width > 10000)) or (v_height is not null and (v_height < 1 or v_height > 10000)) then
    raise exception 'Geçersiz video bilgisi' using errcode = '22023', hint = 'invalid_video';
  end if;

  -- The video (and its poster) must be R2 objects the upload route issued to this user (private.media_uploads).
  v_key_re := '^' || v_uid::text || '/listings/[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.';
  if left(v_url, char_length(v_base) + 1) is distinct from v_base || '/' then
    raise exception 'Geçersiz video adresi' using errcode = '22023', hint = 'invalid_url';
  end if;
  v_key := substr(v_url, char_length(v_base) + 2);
  if v_key !~ (v_key_re || '(mp4|mov|webm)$') then
    raise exception 'Geçersiz video adresi' using errcode = '22023', hint = 'invalid_url';
  end if;
  select u.size_bytes, u.content_type into v_size, v_mime
    from private.media_uploads u
   where u.object_key = v_key and u.user_id = v_uid and u.kind = 'listing-video';
  if not found then
    raise exception 'Video bulunamadı, yeniden yükle' using errcode = 'P0001', hint = 'upload_not_found';
  end if;
  if v_poster is not null then
    if left(v_poster, char_length(v_base) + 1) is distinct from v_base || '/' then
      raise exception 'Geçersiz kapak adresi' using errcode = '22023', hint = 'invalid_url';
    end if;
    v_poster_key := substr(v_poster, char_length(v_base) + 2);
    if v_poster_key !~ (v_key_re || 'jpg$')
       or not exists (select 1 from private.media_uploads u
                       where u.object_key = v_poster_key and u.user_id = v_uid and u.kind = 'listing-poster') then
      raise exception 'Geçersiz kapak adresi' using errcode = '22023', hint = 'invalid_url';
    end if;
  end if;

  begin
    insert into public.listing_videos (listing_id, url, poster_url, duration_s, size_bytes, mime, width, height, provider)
    values (p_listing_id, v_url, v_poster, v_duration, v_size, v_mime, v_width, v_height, 'r2')
    on conflict (listing_id) do update
      set url = excluded.url, poster_url = excluded.poster_url, duration_s = excluded.duration_s,
          size_bytes = excluded.size_bytes, mime = excluded.mime, width = excluded.width, height = excluded.height,
          provider = excluded.provider, created_at = now();
  exception when unique_violation then
    raise exception 'Bu video başka bir ilanında kullanılıyor' using errcode = 'P0001', hint = 'video_in_use';
  end;
  -- Re-attached before the nightly purge: not garbage any more.
  delete from public.media_trash where url = v_url or url = v_poster;
  return jsonb_build_object('ok', true, 'video',
    jsonb_build_object('url', v_url, 'poster_url', v_poster, 'duration_s', v_duration, 'size_bytes', v_size));
end $$;
revoke all on function public.set_listing_video(uuid, jsonb) from public, anon;
grant execute on function public.set_listing_video(uuid, jsonb) to authenticated;

create or replace function public.admin_remove_listing_video(p_listing_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
  v_v public.listing_videos;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 280), '');
begin
  perform private.assert_admin();
  select * into v_l from public.listings where id = p_listing_id;
  delete from public.listing_videos where listing_id = p_listing_id returning * into v_v;
  if v_v.listing_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform private.audit(v_l.owner_id, 'listing.video_removed', 'listing', p_listing_id,
    'İlan videosu kaldırıldı' || coalesce(': ' || v_reason, ''),
    jsonb_build_object('url', v_v.url, 'duration_s', v_v.duration_s, 'size_bytes', v_v.size_bytes));
  perform private.notify(v_l.owner_id, 'listing_video_removed', 'İlanındaki video kaldırıldı',
    coalesce(v_l.title, 'İlan') || coalesce(': ' || v_reason, ''), '/ilan/' || p_listing_id);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_remove_listing_video(uuid, text) from public, anon;
grant execute on function public.admin_remove_listing_video(uuid, text) to authenticated;


-- f) set_listing_media: own storage URLs only ------------------------------------------------------------------------------
-- Live body (2026091310) plus the own-URL check; signature, SECURITY DEFINER, search_path and grants unchanged.
CREATE OR REPLACE FUNCTION public.set_listing_media(p_listing_id uuid, p_media jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_count int;
  v_owner uuid;
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
  select owner_id into v_owner from public.listings where id = p_listing_id for update;

  -- Only files uploaded to our storage (Supabase media or the R2 bucket) under the listing owner's folder, or files
  -- this listing already shows (older and seed photos stay editable).
  if exists (select 1
               from jsonb_array_elements(v_media) e
               cross join lateral (values (e ->> 'url'), (e ->> 'thumb_url')) u(url)
              where u.url is not null
                and not private.own_media_url(u.url, v_owner)
                and not exists (select 1 from public.listing_media m
                                 where m.listing_id = p_listing_id and (m.url = u.url or m.thumb_url = u.url))) then
    raise exception 'Fotoğraflar uygulamadan yüklenmeli' using errcode = '22023', hint = 'foreign_url';
  end if;

  delete from public.listing_media where listing_id = p_listing_id;
  insert into public.listing_media (listing_id, url, thumb_url, sort)
  select p_listing_id, e.value ->> 'url', e.value ->> 'thumb_url', (e.ordinality - 1)::int
    from jsonb_array_elements(v_media) with ordinality e;
  get diagnostics v_count = row_count;
  return v_count;
end $function$;

notify pgrst, 'reload schema';
