-- OTP on screen for brand-new sign-ups while the prototype has no SMS provider, plus the password lockdown that makes
-- it safe. Re-runnable (create or replace / if not exists / drop trigger if exists / idempotent update).
--
-- OWNER DECISIONS (2026-09-12):
--   1. "Yeni kayıtta göster": while app_settings.otp_demo_mode = true, a Turkish mobile number that has NO confirmed
--      account and is not an admin (a brand-new sign-up) gets its code shown on screen, like the demo numbers.
--      Numbers with a confirmed account, and every admin, stay protected exactly as after 2026091368_otp_lockdown.sql:
--      their codes are never stored for a login and never readable. Demo numbers (+90555000xxxx) behave as before.
--   2. Security patch: only admins keep a password. Normal users sign in with the SMS code only (the app has no
--      password form for them; admin-login-form.tsx is the only password sign-in), so wiping their hashes affects
--      nobody. The hashes GoTrue generates for OTP sign-ups are random and never used.
--
-- WHAT THIS FILE DOES
--   * private.otp_signup_code_visible(phone): the one rule. True only when otp_demo_mode is on AND the number is a TR
--     mobile (905XXXXXXXXX) AND no auth.users row with that number is confirmed (phone_confirmed_at / confirmed_at,
--     so an email-confirmed row counts too) AND no admin carries it (profile phone, or the auth user holding it).
--     Stored phones are compared on their last 10 digits (\D stripped), so any stored prefix variant still matches.
--   * send_sms_hook: a non-demo TR mobile LOGIN stores its code in demo_otp when the rule is true, and records the
--     number in private.otp_onscreen_signups (ledger: phone, first_at). Otherwise it is refused as before; with demo
--     mode on the refusal says the number already has an account (the message still starts with "SMS provider not
--     configured", which lib/auth/otp.ts matches). Phone changes (user.new_phone) are unchanged: any non-demo number
--     on either side is refused, and they never touch the ledger.
--   * get_demo_otp: also returns the latest code (5-minute window) of a non-demo number, but only when the rule is
--     true AT READ TIME, so once the account is confirmed its older stored codes are never readable again.
--   * private.auth_users_password_guard (BEFORE INSERT OR UPDATE OF encrypted_password, phone_confirmed_at ON
--     auth.users): a non-admin row never keeps a password, and any password is wiped at the moment the row's phone
--     gets confirmed (phone_confirmed_at null -> not null), even an admin's. This closes the pre-account takeover:
--     POST /auth/v1/signup {phone, password} for a free number leaves an unconfirmed row; the real owner later
--     confirms that number with the on-screen code; without the guard the attacker's password would survive and
--     grant_type=password would sign the attacker in.
--   * One-off wipe (end of file): every non-admin password hash is set to ''. Admins keep theirs.
--   get_demo_otp and send_sms_hook now run with search_path = '' (every name is schema-qualified).
--
-- DEPENDENCIES
--   * Auth sms_autoconfirm MUST stay false (scripts/db/auth-setup.mjs). With autoconfirm on, POST /auth/v1/signup
--     {phone, password} would confirm any number without a code and hand back a session: anyone could open any
--     free number. Also keep email signups off (auth-setup.mjs).
--   * Numbers with a Supabase Auth test OTP entry never reach the hook (the admin test number); unchanged.
--
-- RESIDUAL RISKS (accepted by the owner for the prototype)
--   * Anyone can claim a number that has no account yet: they see its code on screen and become that account.
--     Mitigation: the ledger private.otp_onscreen_signups lists every number that got a code on screen, and
--     supabase/golive/otp_golive.sql closes them at go-live (deletes their sessions, refresh tokens and MFA factors;
--     the real owner then signs in with a real SMS). Data the claimer put into such an account stays in it, and an
--     already issued access token (JWT) keeps working until it expires (jwt_exp, 1 hour).
--   * The refusal text tells whether a number already has a confirmed account (account enumeration).
--   * Captcha is off (ISSUE 4, not in scope): claiming and enumeration are limited only by Auth's SMS / IP rate limits.
--   * Never-verified auth.users rows (a code was requested but never entered) accumulate; otp_golive.sql purges them
--     (older than 1 day) and shows an optional periodic job.
--
-- SIDE EFFECTS
--   * A new admin created through the Admin API WITH a password loses it on insert (no admin profile exists yet at
--     insert time): create the user, promote the profile to role 'admin', confirm the phone, THEN set the password
--     (Admin API updateUserById { password } or the admin site's "Şifreyi değiştir").
--   * A password set before the phone is confirmed is wiped at confirmation, for admins too (same order as above).
--   * Non-admin auth.updateUser({ password }) returns success but stores nothing: those users stay OTP-only.
--   * A demoted admin keeps the hash until their next password change or until this file / otp_golive.sql runs again.
--   Real SMS go-live (supabase/golive/otp_golive.sql) replaces the hook, closes the ledger and switches demo mode off.
--   The password guard stays after go-live.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Ledger of numbers that got a login code on screen (read only by otp_golive.sql; no client access).
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists private.otp_onscreen_signups (
  phone text primary key,                       -- digits, 905XXXXXXXXX
  first_at timestamptz not null default now()
);

comment on table private.otp_onscreen_signups is
  'Prototype only: numbers that got a sign-up code shown on screen (2026091387). Closed and dropped by supabase/golive/otp_golive.sql.';

alter table private.otp_onscreen_signups enable row level security;
revoke all on table private.otp_onscreen_signups from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The rule.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function private.otp_signup_code_visible(p_phone text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_digits text := private.phone_digits(p_phone);
  v_last10 text;
begin
  if coalesce((select value from public.app_settings where key = 'otp_demo_mode'), 'false'::jsonb) <> 'true'::jsonb then
    return false;
  end if;
  if v_digits !~ '^905[0-9]{9}$' then
    return false;
  end if;
  v_last10 := right(v_digits, 10);
  -- An account that has ever confirmed this number (phone or email confirmation). Compared on the last 10 digits so
  -- any stored prefix variant (+90, 90, 090, 0090, spaces) still matches.
  if exists (select 1 from auth.users u
              where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = v_last10
                and (u.phone_confirmed_at is not null or u.confirmed_at is not null)) then
    return false;
  end if;
  -- Admins never: by profile phone, or by the auth user holding the number.
  if exists (select 1 from public.profiles p
              where right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = v_last10
                and p.role = 'admin')
     or exists (select 1 from auth.users u join public.profiles p on p.id = u.id
                 where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = v_last10
                   and p.role = 'admin') then
    return false;
  end if;
  return true;
end $$;

revoke execute on function private.otp_signup_code_visible(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Read side (anon RPC).
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.get_demo_otp(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text := private.phone_digits(p_phone);
  v_code text;
begin
  if coalesce((select value from public.app_settings where key = 'otp_demo_mode'), 'false'::jsonb) <> 'true'::jsonb then
    return null;
  end if;
  -- Demo range, or a brand-new sign-up checked NOW (a confirmed account's codes are never readable).
  if not private.is_demo_otp_phone(v_digits) and not private.otp_signup_code_visible(v_digits) then
    return null;
  end if;
  if v_digits = '' or exists (select 1 from public.profiles p
                               where right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(v_digits, 10)
                                 and p.role = 'admin') then
    return null;
  end if;
  select d.code into v_code
    from public.demo_otp d
   where d.phone = v_digits and d.created_at > now() - interval '5 minutes'
   order by d.created_at desc
   limit 1;
  return v_code;
end $$;

grant execute on function public.get_demo_otp(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Send-SMS hook (called by Auth as supabase_auth_admin).
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  -- No SMS provider behind this hook: a code is issued only when get_demo_otp can show it.
  -- Phone change (new_phone set): demo numbers only, on both sides (unchanged).
  -- Login / sign-up: demo numbers, or a brand-new sign-up while demo mode is on (private.otp_signup_code_visible).
  -- Refusals start with "SMS provider not configured"; the client maps them (lib/auth/otp.ts) to Turkish texts.
  if (v_new_phone <> '' and (not private.is_demo_otp_phone(v_new_phone)
                             or (v_phone <> '' and not private.is_demo_otp_phone(v_phone))))
     or (v_new_phone = '' and not private.is_demo_otp_phone(v_phone)
         and not private.otp_signup_code_visible(v_phone)) then
    if v_new_phone = ''
       and coalesce((select value from public.app_settings where key = 'otp_demo_mode'), 'false'::jsonb) = 'true'::jsonb then
      -- Demo mode on and the rule said no: the number has a confirmed account (or belongs to an admin).
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 400,
        'message', 'SMS provider not configured: this number already has an account; only new sign-ups and demo numbers get a code during the prototype.'
      ));
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'SMS provider not configured: only demo numbers can receive a code during the prototype.'
    ));
  end if;
  if v_phone <> '' and v_code is not null then
    insert into public.demo_otp (phone, code) values (v_phone, v_code);
  end if;
  -- Ledger: a non-demo login code that will be shown on screen (only reachable when the rule said yes).
  -- otp_golive.sql closes these accounts at go-live.
  if v_new_phone = '' and v_phone <> '' and not private.is_demo_otp_phone(v_phone) then
    insert into private.otp_onscreen_signups (phone) values (v_phone) on conflict (phone) do nothing;
  end if;
  -- Phone change: Auth sends to user.new_phone and the banner asks for that number. Never for admins
  -- (get_demo_otp only hides codes stored under an admin's current phone).
  if v_new_phone <> '' and v_new_phone <> v_phone and v_code is not null
     and not exists (select 1 from public.profiles p
                      where p.id::text = coalesce(event -> 'user' ->> 'id', '') and p.role = 'admin') then
    insert into public.demo_otp (phone, code) values (v_new_phone, v_code);
  end if;
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return '{}'::jsonb;
end $$;

grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.send_sms_hook(jsonb) from anon, authenticated, public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Password guard on auth.users (owner decision 2: only admins keep a password).
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function private.auth_users_password_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> '' then
    if tg_op = 'UPDATE' and old.phone_confirmed_at is null and new.phone_confirmed_at is not null then
      new.encrypted_password := '';            -- set before the number was proven: never trust it
    elsif not exists (select 1 from public.profiles p where p.id = new.id and p.role = 'admin') then
      new.encrypted_password := '';            -- non-admins sign in with the SMS code only
    end if;
  end if;
  return new;
end $$;

revoke execute on function private.auth_users_password_guard() from public, anon, authenticated;

drop trigger if exists auth_users_password_guard on auth.users;
create trigger auth_users_password_guard
  before insert or update of encrypted_password, phone_confirmed_at on auth.users
  for each row execute function private.auth_users_password_guard();

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. One-off wipe: no non-admin keeps a password hash (idempotent; admins untouched).
-- ---------------------------------------------------------------------------------------------------------------------
update auth.users u
   set encrypted_password = ''
 where coalesce(u.encrypted_password, '') <> ''
   and not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin');

notify pgrst, 'reload schema';
