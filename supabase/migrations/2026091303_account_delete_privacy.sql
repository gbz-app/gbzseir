-- Account delete privacy (KVKK): delete_my_account also removes the user's events, audit details keep only masked
-- phones and lose phone / name / from-to values of deleted accounts, and audit_log rows older than
-- audit_retention_days (default 730) are purged nightly. Re-runnable.

-- 1) Phone mask for audit details: +905321234567 -> +90 5** *** 45 67 (already masked values pass through).
create or replace function private.mask_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if p_phone is null or position('*' in p_phone) > 0 then
    return p_phone;
  end if;
  if v_digits ~ '^(90|0)?5[0-9]{9}$' then
    v_digits := right(v_digits, 10);
    return '+90 ' || left(v_digits, 1) || '** *** ' || substr(v_digits, 7, 2) || ' ' || right(v_digits, 2);
  end if;
  if length(v_digits) < 8 then
    return '***';
  end if;
  return repeat('*', length(v_digits) - 4) || right(v_digits, 4);
end $$;

revoke all on function private.mask_phone(text) from public, anon, authenticated;

-- 2) Profile audit: masked phones; the delete row keeps no name (latest body from 2026091230_admin_core.sql).
create or replace function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.id, 'profile.created', 'profile', new.id, 'Hesap oluşturuldu', jsonb_build_object('phone', private.mask_phone(new.phone)));
    return new;
  elsif tg_op = 'DELETE' then
    perform private.audit(old.id, 'profile.deleted', 'profile', old.id, 'Hesap silindi', jsonb_build_object('phone', private.mask_phone(old.phone)));
    return old;
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    perform private.audit(new.id, 'profile.avatar', 'profile', new.id,
      case when new.avatar_url is null then 'Profil fotoğrafı kaldırıldı' else 'Profil fotoğrafı değiştirildi' end,
      jsonb_build_object('from', old.avatar_url, 'to', new.avatar_url));
  end if;
  if new.full_name is distinct from old.full_name then
    perform private.audit(new.id, 'profile.name', 'profile', new.id, 'Ad soyad değiştirildi', jsonb_build_object('from', old.full_name, 'to', new.full_name));
  end if;
  if new.phone is distinct from old.phone then
    perform private.audit(new.id, 'profile.phone', 'profile', new.id, 'Telefon numarası değiştirildi',
      jsonb_build_object('from', private.mask_phone(old.phone), 'to', private.mask_phone(new.phone)));
  end if;
  if new.email is distinct from old.email then
    perform private.audit(new.id, 'profile.email', 'profile', new.id, 'E-posta değiştirildi', jsonb_build_object('from', old.email, 'to', new.email));
  end if;
  if new.neighbourhood_id is distinct from old.neighbourhood_id then
    perform private.audit(new.id, 'profile.neighbourhood', 'profile', new.id, 'Mahalle değiştirildi',
      jsonb_build_object('to', (select n.name from public.neighbourhoods n where n.id = new.neighbourhood_id)));
  end if;
  if new.status is distinct from old.status then
    perform private.audit(new.id, 'profile.status', 'profile', new.id,
      'Hesap durumu: ' || private.tr_label('profile', old.status) || ' → ' || private.tr_label('profile', new.status),
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.role is distinct from old.role then
    perform private.audit(new.id, 'profile.role', 'profile', new.id,
      'Rol: ' || private.tr_label('role', old.role) || ' → ' || private.tr_label('role', new.role),
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.marketing_consent is distinct from old.marketing_consent then
    perform private.audit(new.id, 'profile.consent', 'profile', new.id,
      case when new.marketing_consent then 'Ticari ileti izni verildi' else 'Ticari ileti izni geri alındı' end, '{}'::jsonb);
  end if;
  if new.trusted_publisher is distinct from old.trusted_publisher then
    perform private.audit(new.id, 'profile.trusted', 'profile', new.id,
      case when new.trusted_publisher then 'Güvenilir yayıncı yapıldı' else 'Güvenilir yayıncılık kaldırıldı' end, '{}'::jsonb);
  end if;
  return new;
end $$;

-- 3) Forget a (deleted) user's personal values in the audit trail: phone / name keys everywhere, and the from-to
--    values of the personal profile changes. Status / role history stays.
create or replace function private.audit_forget_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.audit_log
     set details = case
           when action in ('profile.name', 'profile.phone', 'profile.email', 'profile.avatar', 'profile.neighbourhood')
             then details - array['phone', 'name', 'from', 'to']
           else details - array['phone', 'name']
         end
   where user_id = p_user
     and (details ?| array['phone', 'name']
          or (action in ('profile.name', 'profile.phone', 'profile.email', 'profile.avatar', 'profile.neighbourhood')
              and details ?| array['from', 'to']));
$$;

revoke all on function private.audit_forget_user(uuid) from public, anon, authenticated;

-- 4) delete_my_account (latest body from 20260910000003_rpc.sql) + events + audit clean-up.
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  -- Events would otherwise stay public (business_id / created_by -> null) with the business phone.
  -- An admin's city events (no business) are city content and stay (created_by -> null).
  delete from public.events
   where business_id in (select b.id from public.businesses b where b.owner_id = v_uid)
      or (created_by = v_uid and business_id is null
          and not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin'));
  update public.profiles
     set full_name = null, email = null, avatar_url = null, phone = null, marketing_consent = false
   where id = v_uid;
  delete from auth.users where id = v_uid;  -- cascades: profile, listings, business, favorites, notifications ...
  perform private.audit_forget_user(v_uid);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 5) One-off: mask the phones already stored in audit details; forget accounts that no longer exist.
update public.audit_log
   set details = jsonb_set(details, '{phone}', to_jsonb(private.mask_phone(details ->> 'phone')))
 where jsonb_typeof(details -> 'phone') = 'string'
   and position('*' in details ->> 'phone') = 0;

update public.audit_log
   set details = details
     || case when jsonb_typeof(details -> 'from') = 'string' then jsonb_build_object('from', private.mask_phone(details ->> 'from')) else '{}'::jsonb end
     || case when jsonb_typeof(details -> 'to') = 'string' then jsonb_build_object('to', private.mask_phone(details ->> 'to')) else '{}'::jsonb end
 where action = 'profile.phone'
   and (position('*' in coalesce(details ->> 'from', '*')) = 0 or position('*' in coalesce(details ->> 'to', '*')) = 0);

do $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct a.user_id from public.audit_log a
     where a.user_id is not null and not exists (select 1 from public.profiles p where p.id = a.user_id)
  loop
    perform private.audit_forget_user(v_user);
  end loop;
end $$;

-- 6) Retention: audit_log rows older than audit_retention_days (default 730, at least 30) are removed nightly.
insert into public.app_settings (key, value) values ('audit_retention_days', '730'::jsonb)
on conflict (key) do nothing;

create or replace function private.cleanup_audit_log()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int := greatest(private.app_setting_int('audit_retention_days', 730), 30);
begin
  delete from public.audit_log where created_at < now() - make_interval(days => v_days);
end $$;

revoke all on function private.cleanup_audit_log() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-audit-retention';
    perform cron.schedule('gebzem-audit-retention', '23 3 * * *', 'select private.cleanup_audit_log()');
  end if;
end $$;
