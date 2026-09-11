-- Gebzem: web push retry. Additive and re-runnable.
--
-- 1) notifications.push_attempts / push_error / push_attempted_at: /api/notifications/push claims a row (attempts + 1,
--    attempted_at = now()) and sets push_sent_at ONLY after the push went out (or there was nothing to deliver).
--    A failed row keeps push_sent_at null with the error and is tried again, at most 3 times.
--    Clients may update read_at only (the push_* and created_at columns belong to the sender).
-- 2) public.claim_push_notifications(p_limit): atomic claim for the sender (service_role only). A row is claimable while
--    it is unsent, younger than 6 hours, has < 3 attempts and was not attempted in the last 5 minutes (lease).
-- 3) pg_cron job gebzem-push-retry (every 10 minutes) POSTs through pg_net to /api/notifications/push when a claimable
--    row exists: it catches a missed trigger webhook and retries failed sends. Same Vault secret as the trigger
--    ('gebzem_push_webhook_secret' = CRON_SECRET, see 2026091130_services_push_and_leads.sql).

set search_path = public, extensions;

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1) Retry columns
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists push_attempts smallint not null default 0;
alter table public.notifications add column if not exists push_error text;
alter table public.notifications add column if not exists push_attempted_at timestamptz;

-- Clients only mark notifications read (mark_notifications_read is SECURITY DEFINER). Without this a user could reset
-- push_sent_at / push_attempts / created_at on their own rows and keep them at the head of the sender's queue.
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Claim (6 hours / 3 attempts / 5 minutes must match private.push_retry_webhook below)
-- ---------------------------------------------------------------------------
create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (id uuid, user_id uuid, type text, title text, body text, link text, push_attempts smallint)
language sql
volatile
security definer
set search_path = public
as $$
  update public.notifications n
     set push_attempts = n.push_attempts + 1,
         push_attempted_at = now()
   where n.id in (
     select c.id
       from public.notifications c
      where c.push_sent_at is null
        and c.push_attempts < 3
        and c.created_at > now() - interval '6 hours'
        and (c.push_attempted_at is null or c.push_attempted_at < now() - interval '5 minutes')
      order by c.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 200)
      for update skip locked)
  returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.push_attempts
$$;

revoke execute on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Safety-net call every 10 minutes (same pattern as private.purge_listings_webhook)
-- ---------------------------------------------------------------------------
create or replace function private.push_retry_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1
      from public.notifications c
     where c.push_sent_at is null
       and c.push_attempts < 3
       and c.created_at > now() - interval '6 hours'
       and (c.push_attempted_at is null or c.push_attempted_at < now() - interval '5 minutes')) then
    return;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return;
  end if;
  -- Asynchronous: pg_net sends it after the cron transaction commits.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/notifications/push',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 30000);
end $$;

revoke all on function private.push_retry_webhook() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-push-retry';
    perform cron.schedule('gebzem-push-retry', '*/10 * * * *', 'select private.push_retry_webhook()');
  end if;
end $$;
