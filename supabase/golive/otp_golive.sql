-- GO-LIVE ONLY (plan step 10). Not a migration. Never run it before BOTH of these are done, or every login breaks:
--   1. A real SMS provider (e.g. Netgsm / İleti Merkezi) sends the codes and Supabase Auth's Send-SMS hook points at it
--      (hook_send_sms_uri is no longer pg-functions://postgres/public/send_sms_hook), tested with a real phone.
--   2. That provider hook keeps the +905XXXXXXXXX check of migration 2026091312_sms_hook_tr_only.sql.
-- Run (one batch = one transaction):
--   . secrets.ps1; node --env-file=.env.local scripts\db\sql.mjs "supabase\golive\otp_golive.sql"
-- Afterwards: tune rate_limit_sms_sent (and captcha, see scripts/db/auth-config.mjs), regenerate database.types.ts and
-- remove get_demo_otp / fetchDemoOtp / DemoOtpBanner / RPC.getDemoOtp from the app and scripts/db/verify-auth.mjs.
-- No BEGIN/COMMIT on purpose: sql-dryrun.mjs wraps it in BEGIN ... ROLLBACK to check it.

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

-- 4. The demo Send-SMS hook and the captured codes.
drop function if exists public.send_sms_hook(jsonb);

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
