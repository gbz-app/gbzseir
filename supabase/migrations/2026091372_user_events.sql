-- 2026091372 - User events + event moderation.
--
-- a) Normal users can create events. They go to admin review ('pending_review'); a later content edit by the creator
--    sends the event back to review. Businesses keep publishing directly, as their business.
-- b) Admin review: public.admin_review_event(p_event, p_approve, p_reason). A rejection / take-down is sticky
--    (admin_hidden): owners cannot re-publish it, an edit only resubmits it for review. (audit DBAUTH-3)
-- c) Caps and input rules in private.events_before_write for API callers who are not admins:
--    normal user 3 pending + 10 upcoming; business 10 per 24 h + 30 upcoming published; cover only from the caller's
--    own media folder; https ticket links; the business phone is always the business's own. (audit uploads-events-*)
-- d) A normal user's contact phone (events.contact_phone) is never readable through the API: anon / authenticated get
--    column-level SELECT on every other column. It is shown to signed-in users only through public.reveal_event_phone,
--    logged in contact_events (subject_type 'event') with the daily reveal cap. NOTE: a column added to public.events
--    later needs its own "grant select (<col>) on public.events to anon, authenticated".
-- e) Reports: target_type 'event'. Contact events: subject_type 'event'. Admin dashboard: content.events_pending.
--
-- venue_business_id and reviewed_by have no foreign keys on purpose: a second events -> businesses / profiles
-- relationship would make the existing PostgREST embeds (businesses(...)) ambiguous and break them.
-- The place name of an event is the existing venue_name column.

-- 1) Columns and constraints ---------------------------------------------------------------------------------------

alter table public.events
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists address text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists venue_business_id uuid,
  add column if not exists contact_phone text,
  add column if not exists organizer_name text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_hidden boolean not null default false;

alter table public.events
  add column if not exists has_contact_phone boolean generated always as (contact_phone is not null) stored;

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'pending_review', 'published', 'rejected', 'cancelled'));

alter table public.events drop constraint if exists events_contact_phone_check;
alter table public.events add constraint events_contact_phone_check
  check (contact_phone is null or contact_phone ~ '^\+90[0-9]{10}$');

alter table public.events drop constraint if exists events_rejection_reason_check;
alter table public.events add constraint events_rejection_reason_check
  check (rejection_reason is null or char_length(rejection_reason) <= 300);

alter table public.events drop constraint if exists events_organizer_name_check;
alter table public.events add constraint events_organizer_name_check
  check (organizer_name is null or char_length(organizer_name) <= 80);

-- An admin take-down can never be public at the same time.
alter table public.events drop constraint if exists events_hidden_not_published;
alter table public.events add constraint events_hidden_not_published
  check (not (admin_hidden and status = 'published'));

create index if not exists events_pending_idx on public.events (created_at) where status = 'pending_review';
create index if not exists events_created_by_idx on public.events (created_by);

-- 2) Column-level read access: contact_phone stays private ---------------------------------------------------------

revoke select on public.events from anon, authenticated;
grant select (id, business_id, created_by, slug, title, description, category, starts_at, ends_at, venue_name, address,
              lat, lng, neighbourhood_id, is_free, price_try, price_note, ticket_url, phone, cover_url, status, is_demo,
              created_at, updated_at, venue_business_id, has_contact_phone, organizer_name, rejection_reason,
              reviewed_by, reviewed_at, admin_hidden)
  on public.events to anon, authenticated;

-- 3) Before-write trigger --------------------------------------------------------------------------------------------

create or replace function private.events_before_write()
 returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  v_base text;
  v_uid uuid := auth.uid();
  -- API callers (PostgREST roles). Seeds / service role / SECURITY DEFINER admin RPCs are trusted.
  v_api boolean := current_user in ('authenticated', 'anon');
  v_admin boolean := false;
  v_changed boolean := false;
  v_req text;
  v_n int;
  v_media text := 'https://fboythglcjofakbskstg.supabase.co/storage/v1/object/public/media/';
begin
  if new.is_free then
    new.price_try := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if v_api then
      new.is_demo := false;
    end if;
  end if;

  if v_api then
    v_admin := public.is_admin();
  end if;

  if v_api and not v_admin then
    if v_uid is null then
      raise exception 'Etkinlik eklemek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
    end if;

    -- Moderation and ownership columns are not the caller's to set.
    if tg_op = 'INSERT' then
      new.created_by := v_uid;
      new.created_at := now();
      new.slug := null;
      new.admin_hidden := false;
      new.rejection_reason := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.id := old.id;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.business_id := old.business_id;
      new.slug := old.slug;
      new.is_demo := old.is_demo;
      new.admin_hidden := old.admin_hidden;
      new.rejection_reason := old.rejection_reason;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.organizer_name := old.organizer_name;
      v_changed := (new.title, new.description, new.category, new.starts_at, new.ends_at, new.venue_name, new.address,
                    new.lat, new.lng, new.neighbourhood_id, new.venue_business_id, new.is_free, new.price_try,
                    new.price_note, new.ticket_url, new.contact_phone, new.cover_url)
                   is distinct from
                   (old.title, old.description, old.category, old.starts_at, old.ends_at, old.venue_name, old.address,
                    old.lat, old.lng, old.neighbourhood_id, old.venue_business_id, old.is_free, old.price_try,
                    old.price_note, old.ticket_url, old.contact_phone, old.cover_url);
    end if;

    -- Dates: from one hour ago up to 400 days ahead; at most 60 days long.
    if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
       and (new.starts_at < now() - interval '1 hour' or new.starts_at > now() + interval '400 days') then
      raise exception 'Etkinlik tarihi geçersiz' using errcode = 'P0001', hint = 'invalid_dates';
    end if;
    if new.ends_at is not null and new.ends_at > new.starts_at + interval '60 days'
       and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
      raise exception 'Etkinlik en fazla 60 gün sürebilir' using errcode = 'P0001', hint = 'invalid_dates';
    end if;

    -- Cover: only a photo the caller uploaded to their own media folder.
    if new.cover_url is not null and (tg_op = 'INSERT' or new.cover_url is distinct from old.cover_url)
       and (left(new.cover_url, length(v_media) + 37) <> v_media || v_uid::text || '/'
            or position('..' in new.cover_url) > 0 or new.cover_url ~ '\s') then
      raise exception 'Kapak fotoğrafı yalnızca senin yüklediğin bir fotoğraf olabilir' using errcode = '22023', hint = 'invalid_cover';
    end if;

    -- Ticket link: https only.
    if new.ticket_url is not null and (tg_op = 'INSERT' or new.ticket_url is distinct from old.ticket_url)
       and (new.ticket_url !~* '^https://[^/\s]+\.[^/\s]+' or new.ticket_url ~ '\s') then
      raise exception 'Bilet bağlantısı https:// ile başlamalı' using errcode = '22023', hint = 'invalid_ticket_url';
    end if;

    -- Place at a business: must be a public business.
    if new.venue_business_id is not null
       and (tg_op = 'INSERT' or new.venue_business_id is distinct from old.venue_business_id)
       and not public.business_is_public(new.venue_business_id) then
      raise exception 'Seçilen işletme bulunamadı' using errcode = '22023', hint = 'invalid_venue';
    end if;

    if new.business_id is not null then
      -- Business event (RLS: owner of a public business). Publishes directly; the phone is the business's own.
      new.contact_phone := null;
      new.organizer_name := null;
      new.phone := (select b.phone from public.businesses b where b.id = new.business_id);
      if tg_op = 'INSERT' then
        if new.status not in ('published', 'draft') then
          new.status := 'published';
        end if;
      else
        v_req := new.status;
        if old.admin_hidden then
          if v_req = 'published' and old.status <> 'published' then
            raise exception 'Bu etkinlik yönetici tarafından yayından kaldırıldı. Düzenleyip yeniden onaya gönderebilirsin.'
              using errcode = '42501', hint = 'admin_hidden';
          end if;
          if v_req not in ('draft', 'cancelled', 'pending_review') then
            v_req := old.status;
          end if;
          if v_changed and v_req not in ('draft', 'cancelled') then
            v_req := 'pending_review';
          end if;
        elsif v_req not in ('published', 'draft', 'cancelled') then
          v_req := old.status;
        end if;
        new.status := v_req;
      end if;

      if tg_op = 'INSERT' or (new.status = 'published' and old.status <> 'published') then
        perform pg_advisory_xact_lock(hashtextextended('events_business:' || new.business_id::text, 0));
      end if;
      if tg_op = 'INSERT' then
        select count(*) into v_n from public.events
         where business_id = new.business_id and created_at > now() - interval '24 hours';
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_business_daily_cap'), 10) then
          raise exception 'Son 24 saatte bu işletme için çok fazla etkinlik eklendi. Biraz sonra tekrar dene.'
            using errcode = 'P0001', hint = 'event_daily_cap';
        end if;
      end if;
      if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
        select count(*) into v_n from public.events
         where business_id = new.business_id and status = 'published' and coalesce(ends_at, starts_at) >= now() and id <> new.id;
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_business_active_cap'), 30) then
          raise exception 'Yayında en fazla 30 yaklaşan etkinliğin olabilir. Eski etkinliklerinden birini kaldır.'
            using errcode = 'P0001', hint = 'event_active_cap';
        end if;
      end if;
    else
      -- User event: always reviewed by an admin; the contact phone is private (reveal_event_phone).
      new.phone := null;
      if tg_op = 'INSERT' then
        new.organizer_name := public.short_name((select p.full_name from public.profiles p where p.id = v_uid));
        new.status := 'pending_review';
      else
        v_req := new.status;
        if v_req not in ('draft', 'cancelled', 'pending_review') then
          v_req := old.status;
        end if;
        if v_changed and v_req not in ('draft', 'cancelled') then
          v_req := 'pending_review';
        end if;
        new.status := v_req;
      end if;

      if new.status = 'pending_review' and (tg_op = 'INSERT' or old.status <> 'pending_review') then
        perform pg_advisory_xact_lock(hashtextextended('events_user:' || v_uid::text, 0));
        select count(*) into v_n from public.events
         where created_by = v_uid and business_id is null and status = 'pending_review' and id <> new.id;
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_user_pending_cap'), 3) then
          raise exception 'Onay bekleyen en fazla 3 etkinliğin olabilir. Önce onaylanmalarını bekle.'
            using errcode = 'P0001', hint = 'event_pending_cap';
        end if;
      end if;
      if tg_op = 'INSERT' then
        select count(*) into v_n from public.events
         where created_by = v_uid and business_id is null and status in ('pending_review', 'published')
           and coalesce(ends_at, starts_at) >= now();
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_user_active_cap'), 10) then
          raise exception 'En fazla 10 yaklaşan etkinliğin olabilir.' using errcode = 'P0001', hint = 'event_active_cap';
        end if;
      end if;
    end if;
  elsif new.status = 'published' then
    -- An admin (or a trusted job) publishing an event lifts an earlier take-down.
    new.admin_hidden := false;
  end if;

  if new.slug is null or btrim(new.slug) = '' then
    v_base := public.tr_slug(new.title);
    new.slug := left(coalesce(nullif(v_base, ''), 'etkinlik'), 60) || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  if new.ends_at is not null and new.ends_at < new.starts_at then
    raise exception 'Bitiş zamanı başlangıçtan önce olamaz' using errcode = 'P0001', hint = 'invalid_dates';
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- 4) Admins hear about new review work ------------------------------------------------------------------------------

create or replace function private.events_after_write()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Throttled: a status loop (pending_review <-> draft) or insert + delete churn must not flood the admins. One notice
  -- per admin while an earlier one is unread (24 h) and at most one per 10 minutes; the dashboard shows the count.
  if new.status = 'pending_review' and not new.is_demo
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_review')
     and not exists (
       select 1
         from public.notifications n
         join public.profiles p on p.id = n.user_id and p.role = 'admin'
        where n.type = 'event_pending'
          and n.created_at > now() - interval '24 hours'
          and (n.read_at is null or n.created_at > now() - interval '10 minutes')) then
    perform private.notify_admins('event_pending', 'Onay bekleyen etkinlik', left(new.title, 120), '/admin/etkinlikler?sekme=onay');
  end if;
  return null;
end $function$;

revoke all on function private.events_after_write() from public, anon, authenticated;

drop trigger if exists events_review_queue on public.events;
create trigger events_review_queue after insert or update on public.events
  for each row execute function private.events_after_write();

-- 5) RLS ---------------------------------------------------------------------------------------------------------------

drop policy if exists "owner insert" on public.events;
create policy "owner insert" on public.events for insert to authenticated
  with check (
    public.is_admin()
    or (not private.is_banned((select auth.uid()))
        and ((business_id is not null and public.owns_business(business_id) and public.business_is_public(business_id))
             or (business_id is null and created_by = (select auth.uid()))))
  );

drop policy if exists "owner update" on public.events;
create policy "owner update" on public.events for update to authenticated
  using (
    public.is_admin()
    or (business_id is not null and public.owns_business(business_id))
    or (business_id is null and created_by = (select auth.uid()))
  )
  with check (
    public.is_admin()
    or (business_id is not null and public.owns_business(business_id))
    or (business_id is null and created_by = (select auth.uid()))
  );

drop policy if exists "owner delete" on public.events;
create policy "owner delete" on public.events for delete to authenticated
  using (
    public.is_admin()
    or (business_id is not null and public.owns_business(business_id))
    or (business_id is null and created_by = (select auth.uid()))
  );

drop policy if exists "public read" on public.events;
create policy "public read" on public.events for select to anon, authenticated
  using (
    (status = 'published' and not admin_hidden
     and (business_id is null or public.business_is_public(business_id))
     and (business_id is not null or created_by is null or not private.is_banned(created_by)))
    or created_by = (select auth.uid())
    or (business_id is not null and public.owns_business(business_id))
    or public.is_admin()
  );

-- 6) Admin review ------------------------------------------------------------------------------------------------------

create or replace function public.admin_review_event(p_event uuid, p_approve boolean, p_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_e public.events;
  v_prev text;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
  v_to uuid;
begin
  perform private.assert_admin();
  if p_event is null or p_approve is null then
    raise exception 'Geçersiz istek' using errcode = '22023';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'Reddetmek için bir gerekçe yaz' using errcode = '22023', hint = 'reason_required';
  end if;

  select status into v_prev from public.events where id = p_event for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_approve then
    update public.events
       set status = 'published', admin_hidden = false, rejection_reason = null, reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_event returning * into v_e;
  else
    update public.events
       set status = 'rejected', admin_hidden = true, rejection_reason = v_reason, reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_event returning * into v_e;
  end if;

  perform private.audit(v_e.created_by, case when p_approve then 'event.approved' else 'event.rejected' end, 'event', v_e.id,
    case when p_approve then 'Etkinlik onaylandı: ' else 'Etkinlik reddedildi: ' end || v_e.title || coalesce(' (' || v_reason || ')', ''),
    jsonb_build_object('from', v_prev, 'to', v_e.status, 'reason', v_reason));

  -- A business event goes to the business's current owner; a user event to its creator.
  v_to := coalesce((select b.owner_id from public.businesses b where b.id = v_e.business_id), v_e.created_by);
  if v_to is not null and v_to is distinct from auth.uid() and not v_e.is_demo then
    if p_approve then
      perform private.notify(v_to, 'event_approved', 'Etkinliğin yayında', v_e.title, '/etkinlik/' || v_e.slug);
    else
      perform private.notify(v_to, 'event_rejected',
        case when v_prev = 'published' then 'Etkinliğin yayından kaldırıldı' else 'Etkinliğin yayınlanmadı' end,
        v_e.title || ': ' || v_reason,
        case when v_e.business_id is null then '/profil/etkinliklerim' else '/isletme/etkinlikler' end);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', v_e.status, 'slug', v_e.slug);
end $function$;

revoke all on function public.admin_review_event(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_event(uuid, boolean, text) to authenticated;

-- Contact phones of events for the admin review screen (the column is not readable through the API).
create or replace function public.admin_event_contacts(p_ids uuid[])
 returns table (event_id uuid, contact_phone text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  perform private.assert_admin();
  return query
    select e.id, e.contact_phone
      from public.events e
     where e.id = any (coalesce(p_ids[1:200], '{}'::uuid[])) and e.contact_phone is not null;
end $function$;

revoke all on function public.admin_event_contacts(uuid[]) from public, anon;
grant execute on function public.admin_event_contacts(uuid[]) to authenticated;

-- 7) Phone reveal of an event (signed-in users, logged, daily cap shared with listing reveals) -------------------------

create or replace function public.reveal_event_phone(p_event uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_e public.events;
  v_uid uuid := auth.uid();
  v_owner boolean;
  v_admin boolean;
  v_phone text;
  v_name text;
  v_n int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'login_required');
  end if;
  select * into v_e from public.events where id = p_event;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_admin := public.is_admin();
  -- coalesce: created_by can be null (an admin's city event after the account was removed); null must not count as owner.
  v_owner := coalesce(v_e.created_by = v_uid, false)
             or (v_e.business_id is not null and public.owns_business(v_e.business_id));

  if not v_owner and not v_admin then
    if v_e.status <> 'published' or v_e.admin_hidden
       or (v_e.business_id is not null and not public.business_is_public(v_e.business_id))
       or (v_e.business_id is null and v_e.created_by is not null and private.is_banned(v_e.created_by)) then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    -- Sample events are not callable: their numbers are not real.
    if v_e.is_demo then
      return jsonb_build_object('ok', false, 'reason', 'demo');
    end if;
  end if;

  if v_e.business_id is not null then
    select b.phone, b.name into v_phone, v_name from public.businesses b where b.id = v_e.business_id;
  else
    v_phone := v_e.contact_phone;
    v_name := v_e.organizer_name;
  end if;
  v_phone := coalesce(v_phone, v_e.phone);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_phone');
  end if;

  if not v_owner and not v_admin then
    perform pg_advisory_xact_lock(hashtext('contact:' || v_uid::text));
    -- The same event again today: shown again without using up the cap.
    if not exists (select 1 from public.contact_events
                    where user_id = v_uid and subject_type = 'event' and subject_id = v_e.id and event = 'phone_reveal'
                      and created_at > now() - interval '24 hours') then
      select count(*) into v_n from public.contact_events
       where user_id = v_uid and event = 'phone_reveal' and created_at > now() - interval '24 hours';
      if v_n >= 30 then
        return jsonb_build_object('ok', false, 'reason', 'rate_limited');
      end if;
      insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
      values (v_uid, 'event', v_e.id, 'phone_reveal', private.request_ip_hash());
    end if;
  end if;
  return jsonb_build_object('ok', true, 'phone', v_phone, 'display_name', v_name);
end $function$;

revoke all on function public.reveal_event_phone(uuid) from public, anon;
grant execute on function public.reveal_event_phone(uuid) to authenticated;

-- 8) Contact events: subject_type 'event' (calls on events without a business) -------------------------------------

alter table public.contact_events drop constraint if exists contact_events_subject_type_check;
alter table public.contact_events add constraint contact_events_subject_type_check
  check (subject_type in ('listing', 'job', 'business', 'poi', 'lead', 'event'));

create or replace function public.log_contact_event(p_subject_type text, p_subject_id uuid, p_event text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_n int;
begin
  if p_subject_type not in ('listing', 'job', 'business', 'poi', 'lead', 'event')
     or p_event not in ('phone_reveal', 'call_click', 'directions') or p_subject_id is null then
    raise exception 'Geçersiz olay' using errcode = '22023';
  end if;

  -- Nobody to count it against: drop it instead of storing an unbounded anonymous row.
  if v_uid is null and v_ip is null then
    return;
  end if;

  -- One lock per caller (not per subject): parallel calls with many random subject ids are serialized, so the daily
  -- cap below cannot be overshot by a burst; the once-per-day dedupe stays race-free as well.
  perform pg_advisory_xact_lock(hashtext('contact:' || coalesce(v_uid::text, v_ip)));

  -- Daily cap per caller (user, or anonymous ip hash), so random subject ids cannot grow the table without bound.
  if v_uid is not null then
    select count(*) into v_n from public.contact_events where user_id = v_uid and created_at >= v_day_start;
  else
    select count(*) into v_n from public.contact_events where ip_hash = v_ip and user_id is null and created_at >= v_day_start;
  end if;
  if v_n >= 300 then
    return;
  end if;

  if v_uid is not null then
    if exists (select 1 from public.contact_events
                where user_id = v_uid and event = p_event and created_at >= v_day_start
                  and subject_id = p_subject_id and subject_type = p_subject_type) then
      return; -- already counted today
    end if;
  elsif exists (select 1 from public.contact_events
                 where ip_hash = v_ip and user_id is null and event = p_event and created_at >= v_day_start
                   and subject_id = p_subject_id and subject_type = p_subject_type) then
    return; -- already counted today
  end if;

  insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
  values (v_uid, p_subject_type, p_subject_id, p_event, v_ip);
  if p_event = 'call_click' and p_subject_type in ('listing', 'job') then
    update public.listings set call_count = call_count + 1 where id = p_subject_id;
  end if;
end $function$;

-- 9) Reports: target_type 'event' ----------------------------------------------------------------------------------

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing', 'business', 'review', 'user', 'event'));

create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason text, p_detail text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_detail text := nullif(left(btrim(coalesce(p_detail, '')), 1000), '');
  v_owner uuid;
  v_found boolean := false;
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Şikayet etmek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status in ('banned', 'restricted')) then
    raise exception 'Hesabın kısıtlı olduğu için şikayet gönderemezsin' using errcode = '42501', hint = 'restricted';
  end if;
  if p_target_type is null or p_target_type not in ('listing', 'business', 'review', 'user', 'event') then
    raise exception 'Geçersiz şikayet konusu' using errcode = '22023', hint = 'invalid_target';
  end if;
  if p_reason is null or p_reason not in ('dolandiricilik', 'yanlis_kategori', 'uygunsuz', 'yaniltici', 'diger') then
    raise exception 'Geçersiz şikayet nedeni' using errcode = '22023', hint = 'invalid_reason';
  end if;

  -- The target must exist and be publicly visible.
  case p_target_type
    when 'listing' then
      select true, l.owner_id into v_found, v_owner from public.listings l
       where l.id = p_target_id and l.status in ('active', 'sold', 'filled');
    when 'business' then
      select true, b.owner_id into v_found, v_owner from public.businesses b
       where b.id = p_target_id and b.status = 'approved';
    when 'review' then
      select true, r.author_id into v_found, v_owner from public.reviews r
        join public.businesses b on b.id = r.business_id
       where r.id = p_target_id and b.status = 'approved';
    when 'user' then
      select true, p.id into v_found, v_owner from public.profiles p where p.id = p_target_id;
    when 'event' then
      select true, coalesce(e.created_by, b.owner_id) into v_found, v_owner from public.events e
        left join public.businesses b on b.id = e.business_id
       where e.id = p_target_id and e.status = 'published' and not e.admin_hidden;
  end case;
  if not coalesce(v_found, false) then
    raise exception 'Şikayet edilen içerik bulunamadı' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_owner = v_uid then
    raise exception 'Kendi içeriğini şikayet edemezsin' using errcode = '22023', hint = 'own_content';
  end if;

  -- One caller at a time, so the checks below cannot race.
  perform pg_advisory_xact_lock(hashtextextended('submit_report:' || v_uid::text, 0));

  if exists (select 1 from public.reports where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id and status = 'open') then
    raise exception 'Bu içeriği zaten şikayet ettin' using errcode = '23505', hint = 'already_reported';
  end if;
  select count(*) into v_recent from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day';
  if v_recent >= 20 then
    raise exception 'Bugün çok fazla şikayet gönderdin, yarın tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, detail)
  values (v_uid, p_target_type, p_target_id, p_reason, v_detail)
  returning id into v_id;
  return v_id;
end $function$;

-- 10) Audit labels (new event statuses, report target 'event') -------------------------------------------------------

create or replace function private.tr_label(p_kind text, p_value text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(case p_kind
    when 'profile' then case p_value when 'active' then 'Aktif' when 'restricted' then 'Kısıtlı' when 'banned' then 'Engelli' end
    when 'role' then case p_value when 'user' then 'Kullanıcı' when 'admin' then 'Yönetici' end
    when 'business' then case p_value when 'pending' then 'Onay bekliyor' when 'approved' then 'Onaylı' when 'rejected' then 'Reddedildi' when 'suspended' then 'Askıda' end
    when 'listing' then case p_value when 'draft' then 'Taslak' when 'pending_review' then 'Onay bekliyor' when 'active' then 'Yayında'
      when 'rejected' then 'Reddedildi' when 'expired' then 'Süresi doldu' when 'sold' then 'Satıldı' when 'filled' then 'Pozisyon doldu'
      when 'paused' then 'Durduruldu' when 'deleted' then 'Silindi' end
    when 'topic' then case p_value when 'sikayet' then 'şikayet' when 'teknik_destek' then 'teknik destek' when 'reklam' then 'reklam'
      when 'isletme' then 'işletme' when 'oneri' then 'öneri' when 'diger' then 'diğer' when 'bilgi_duzeltme' then 'yer bilgisi düzeltme' end
    when 'report' then case p_value when 'open' then 'Açık' when 'resolved' then 'Çözüldü' when 'dismissed' then 'Yoksayıldı' end
    when 'support' then case p_value when 'new' then 'Yeni' when 'in_progress' then 'İnceleniyor' when 'resolved' then 'Çözüldü' when 'spam' then 'Spam' end
    when 'event' then case p_value when 'draft' then 'Taslak' when 'pending_review' then 'Onay bekliyor' when 'published' then 'Yayında'
      when 'rejected' then 'Reddedildi' when 'cancelled' then 'İptal edildi' end
    when 'news' then case p_value when 'draft' then 'Taslak' when 'published' then 'Yayında' end
    when 'duty' then case p_value when 'demo' then 'Örnek veri' when 'off' then 'Kapalı' when 'live' then 'Canlı' end
    when 'target' then case p_value when 'listing' then 'ilan' when 'business' then 'işletme' when 'review' then 'yorum' when 'user' then 'kullanıcı'
      when 'event' then 'etkinlik' end
    when 'poi' then case p_value when 'pharmacy' then 'eczane' when 'mosque' then 'cami' when 'bus_stop' then 'durak' when 'place' then 'gezilecek yer'
      when 'taxi' then 'taksi' when 'atm' then 'ATM' end
  end, p_value)
$function$;

-- 11) Admin dashboard: events waiting for review ---------------------------------------------------------------------

create or replace function public.admin_dashboard()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_today_start timestamptz := v_today::timestamp at time zone 'Europe/Istanbul';
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'today', (select count(*) from public.profiles where created_at >= v_today_start),
      'week', (select count(*) from public.profiles where created_at >= v_today_start - interval '6 days'),
      'business_owners', (select count(distinct owner_id) from public.businesses where status = 'approved'),
      'restricted', (select count(*) from public.profiles where status <> 'active'),
      'demo', (select count(*) from public.profiles where is_demo)),
    'businesses', jsonb_build_object(
      'approved', (select count(*) from public.businesses where status = 'approved'),
      'pending', (select count(*) from public.businesses where status = 'pending'),
      'by_vertical', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
        select coalesce(vertical, 'diger') as v, count(*)::int as n from public.businesses where status = 'approved' group by 1) x)),
    'content', jsonb_build_object(
      'listings_active', (select count(*) from public.listings where status = 'active'),
      'listings_pending', (select count(*) from public.listings where status = 'pending_review'),
      'reports_open', (select count(*) from public.reports where status = 'open'),
      'support_new', (select count(*) from public.contact_messages where status = 'new'),
      'events_upcoming', (select count(*) from public.events where status = 'published' and coalesce(ends_at, starts_at) >= now()),
      'events_pending', (select count(*) from public.events where status = 'pending_review'),
      'requests_open', (select count(*) from public.service_requests where status in ('admin_review', 'open'))),
    'live', jsonb_build_object(
      'online_now', (select count(*) from public.analytics_sessions where last_seen_at > now() - interval '2 minutes'),
      'online_users', (select count(distinct user_id) from public.analytics_sessions where last_seen_at > now() - interval '2 minutes' and user_id is not null)),
    'today', (select jsonb_build_object(
        'sessions', count(*),
        'visitors', count(distinct coalesce(user_id::text, id::text)),
        'signed_in', count(distinct user_id),
        'avg_duration_s', coalesce(round(avg(extract(epoch from last_seen_at - started_at)) filter (where page_views > 0))::int, 0))
      from public.analytics_sessions where started_at >= v_today_start),
    'page_views_today', (select count(*) from public.analytics_page_views where created_at >= v_today_start),
    'installs', jsonb_build_object(
      'total', (select count(*) from public.app_installs),
      'week', (select count(*) from public.app_installs where created_at >= v_today_start - interval '6 days'),
      'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (select platform, count(*)::int as n from public.app_installs group by 1) x),
      'store', (select coalesce(jsonb_object_agg(platform, to_jsonb(s) - 'platform' - 'id' - 'created_by' - 'created_at'), '{}'::jsonb) from (
        select distinct on (platform) * from public.store_stats order by platform, stat_date desc) s)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'signups', su, 'sessions', se, 'page_views', pv) order by d), '[]'::jsonb) from (
        select d,
          (select count(*) from public.profiles p where (p.created_at at time zone 'Europe/Istanbul')::date = d::date) as su,
          (select count(*) from public.analytics_sessions s where (s.started_at at time zone 'Europe/Istanbul')::date = d::date) as se,
          (select count(*) from public.analytics_page_views v where (v.created_at at time zone 'Europe/Istanbul')::date = d::date) as pv
        from generate_series(v_today - 13, v_today, interval '1 day') d) x),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]'::jsonb) from (
        select path, count(*)::int as n from public.analytics_page_views where created_at >= now() - interval '7 days' group by 1 order by 2 desc limit 8) x)
  );
end $function$;
