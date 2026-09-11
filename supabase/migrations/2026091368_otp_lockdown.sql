-- Security fix (audit DBAUTH-1 / EP-1 / AUTH-1 / HDR-XSS-01): demo OTP codes only for the demo range +90555000xxxx.
-- Before: send_sms_hook stored the code of EVERY Turkish mobile in public.demo_otp and get_demo_otp (anon) handed out any
-- stored code while otp_demo_mode was on, so anyone could read the login code of a real user's number.
-- After:
--   * private.is_demo_otp_phone(digits): true only for 90555000 + 4 digits.
--   * get_demo_otp: returns null for any number outside the demo range (demo-mode and admin checks unchanged).
--   * send_sms_hook: stores codes only for demo-range numbers. For any other TR mobile it returns a hook error
--     (http_code 400, 'SMS provider not configured ...') so Auth refuses to issue a code nobody would receive.
--     The TR-mobile validation, the admin rule for phone changes and the 1-day cleanup are unchanged.
--     Numbers with a Supabase Auth test OTP entry never reach the hook, so testers with such an entry keep working.
--   * demo_otp: codes stored for non-demo numbers are deleted.
-- Real SMS go-live (supabase/golive/otp_golive.sql) replaces this hook entirely. Re-runnable.

create or replace function private.is_demo_otp_phone(p_digits text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(p_digits, '') ~ '^90555000[0-9]{4}$'
$$;

revoke execute on function private.is_demo_otp_phone(text) from public, anon, authenticated;

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
  -- Demo range only: never hand out the code of a real number.
  if not private.is_demo_otp_phone(v_digits) then
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

grant execute on function public.get_demo_otp(text) to anon, authenticated;

create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
  v_new_phone text := regexp_replace(coalesce(event -> 'user' ->> 'new_phone', ''), '\D', '', 'g');
  v_code text := event -> 'sms' ->> 'otp';
begin
  -- TR mobile only (the client checks this too). A hook error makes Auth refuse to send the code.
  if (v_phone = '' and v_new_phone = '')
     or (v_phone <> '' and v_phone !~ '^905[0-9]{9}$')
     or (v_new_phone <> '' and v_new_phone !~ '^905[0-9]{9}$') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Invalid phone: only Turkish mobile numbers (+905XXXXXXXXX) are accepted.'
    ));
  end if;
  -- No SMS provider behind this hook: only demo-range numbers can get a code (read back by get_demo_otp).
  -- Any other number (login, or either side of a phone change) is refused so no unreadable code is issued.
  -- The client maps this message (lib/auth/otp.ts) to a Turkish "cannot send SMS right now" text.
  if (v_phone <> '' and not private.is_demo_otp_phone(v_phone))
     or (v_new_phone <> '' and not private.is_demo_otp_phone(v_new_phone)) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'SMS provider not configured: only demo numbers can receive a code during the prototype.'
    ));
  end if;
  if v_phone <> '' and v_code is not null then
    insert into public.demo_otp (phone, code) values (v_phone, v_code);
  end if;
  -- Phone change: Auth sends to user.new_phone and the banner asks for that number. Never for admins
  -- (get_demo_otp only hides codes stored under an admin's current phone).
  if v_new_phone <> '' and v_new_phone <> v_phone and v_code is not null
     and not exists (select 1 from public.profiles
                      where id::text = coalesce(event -> 'user' ->> 'id', '') and role = 'admin') then
    insert into public.demo_otp (phone, code) values (v_new_phone, v_code);
  end if;
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return '{}'::jsonb;
end $$;

grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.send_sms_hook(jsonb) from anon, authenticated, public;

-- Codes already captured for real numbers must not stay readable anywhere.
delete from public.demo_otp where not private.is_demo_otp_phone(phone);
