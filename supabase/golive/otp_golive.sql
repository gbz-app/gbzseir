-- GO-LIVE ONLY (plan step 10). Not a migration. Never run it before BOTH of these are done, or every login breaks:
--   1. A real SMS provider (e.g. Netgsm / İleti Merkezi) sends the codes and Supabase Auth's Send-SMS hook points at it
--      (hook_send_sms_uri is no longer pg-functions://postgres/public/send_sms_hook), tested with a real phone.
--   2. That provider hook keeps the +905XXXXXXXXX check of migration 2026091312_sms_hook_tr_only.sql.
-- Auth sms_autoconfirm MUST stay false (scripts/db/auth-setup.mjs), before and after go-live: with autoconfirm on,
-- POST /auth/v1/signup {phone, password} confirms any number without a code and returns a session. The password guard
-- of 2026091387 (private.auth_users_password_guard: only admins keep a password) stays in place after go-live.
-- Run (one batch = one transaction):
--   . secrets.ps1; node --env-file=.env.local scripts\db\sql.mjs "supabase\golive\otp_golive.sql"
-- Afterwards: tune rate_limit_sms_sent (and captcha, see scripts/db/auth-config.mjs), regenerate database.types.ts and
-- remove get_demo_otp / fetchDemoOtp / DemoOtpBanner / RPC.getDemoOtp from the app and scripts/db/verify-auth.mjs.
-- No BEGIN/COMMIT on purpose: sql-dryrun.mjs wraps it in BEGIN ... ROLLBACK to check it. Re-runnable.

-- 1. Demo mode off: the app stops showing codes (the app_settings cache is at most 60 s old).
update public.app_settings set value = 'false'::jsonb, updated_at = now() where key = 'otp_demo_mode';

-- 2. Nobody can read captured codes any more.
do $$
begin
  if to_regprocedure('public.get_demo_otp(text)') is not null then
    revoke execute on function public.get_demo_otp(text) from public, anon, authenticated;
  end if;
end $$;
drop function if exists public.get_demo_otp(text);

-- 3. expire_listings() (daily cron) without its demo_otp cleanup line. Rebuilt from the LIVE body so later changes stay.
do $$
declare
  v_def text;
begin
  if to_regprocedure('public.expire_listings()') is not null then
    v_def := pg_get_functiondef('public.expire_listings()'::regprocedure);
    if v_def ~ 'demo_otp' then
      execute regexp_replace(v_def, '\n[ \t]*delete from public\.demo_otp[^;]*;', '', 'g');
    end if;
  end if;
end $$;

-- 4. The demo Send-SMS hook (it wrote the ledger below) and its sign-up rule.
drop function if exists public.send_sms_hook(jsonb);
drop function if exists private.otp_signup_code_visible(text);

-- 5. Close the accounts opened with an on-screen code (ledger of 2026091387). Anyone could claim a free number during
--    the prototype, so every such account must sign in again with a real SMS: its sessions (refresh tokens go with
--    them), stray refresh tokens and MFA factors are deleted. Matched on the last 10 digits of auth.users.phone.
--    The ledger (phone numbers) is dropped afterwards: it has no use once the accounts are closed.
do $$
begin
  if to_regclass('private.otp_onscreen_signups') is not null then
    create temp table otp_golive_closed on commit drop as
      select u.id
        from auth.users u
        join private.otp_onscreen_signups s
          on right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = right(s.phone, 10);
    delete from auth.sessions where user_id in (select id from otp_golive_closed);
    delete from auth.refresh_tokens where user_id in (select id::text from otp_golive_closed);
    delete from auth.mfa_factors where user_id in (select id from otp_golive_closed);
    drop table otp_golive_closed;
  end if;
end $$;

do $$
declare
  v_fns text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ 'otp_onscreen_signups' and n.nspname not in ('pg_catalog', 'information_schema');
  if v_fns is not null then
    raise exception 'otp_onscreen_signups is still used by: %', v_fns;
  end if;
end $$;
drop table if exists private.otp_onscreen_signups;

-- 6. Only admins keep a password (re-asserts the one-off wipe of 2026091387; the guard trigger keeps it that way).
update auth.users u
   set encrypted_password = ''
 where coalesce(u.encrypted_password, '') <> ''
   and not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin');

-- 7. Purge never-verified sign-ups: a code was requested but never entered (no confirmation, never signed in),
--    older than 1 day. Admin rows are never touched. Their profiles and owned rows go with them (on delete cascade).
delete from auth.users u
 where u.phone_confirmed_at is null
   and u.email_confirmed_at is null
   and u.last_sign_in_at is null
   and u.created_at < now() - interval '1 day'
   and not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin');

-- Optional periodic job (not enabled; run once by hand to add it):
-- select cron.schedule('gebzem-purge-unverified-auth-users', '47 3 * * *', $job$
--   delete from auth.users u
--    where u.phone_confirmed_at is null and u.email_confirmed_at is null and u.last_sign_in_at is null
--      and u.created_at < now() - interval '1 day'
--      and not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin')
-- $job$);

-- 8. The captured codes.
-- plpgsql bodies are not dependency-tracked: refuse to drop the table while any function still uses it.
do $$
declare
  v_fns text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ 'demo_otp' and n.nspname not in ('pg_catalog', 'information_schema');
  if v_fns is not null then
    raise exception 'demo_otp is still used by: %', v_fns;
  end if;
end $$;
drop table if exists public.demo_otp;
