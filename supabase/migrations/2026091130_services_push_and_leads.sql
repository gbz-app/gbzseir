-- Gebzem services module (NN=30): web push delivery for notifications + lead card extras.
-- Additive and re-runnable. Only touches objects created in this file.
--
-- 1) Web push: notifications rows are created by RPCs (private.notify / notify_admins). After every INSERT
--    statement that adds rows with push_sent_at IS NULL, pg_net POSTs to the Next.js route
--    /api/notifications/push, which sends the Web Push messages (VAPID) and sets push_sent_at.
--    The shared secret is NOT stored in this repo: it lives in Supabase Vault under the name
--    'gebzem_push_webhook_secret' and must equal the CRON_SECRET env var on Vercel. Set / rotate it with:
--      select vault.create_secret('<CRON_SECRET>', 'gebzem_push_webhook_secret', 'Gebzem push webhook');
--      -- or, when it already exists:
--      select vault.update_secret((select id from vault.secrets where name = 'gebzem_push_webhook_secret'), '<CRON_SECRET>');
--    Without the secret the trigger is a no-op (inserts never fail because of push).
--
-- 2) public.my_lead_extras(p_lead_ids): short answer summary + "hired" flag for the caller's own leads
--    (the my_leads view has no answers and service_requests is not readable by businesses).

set search_path = public, extensions;

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1) Push webhook trigger
-- ---------------------------------------------------------------------------
create or replace function private.notifications_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from new_rows where push_sent_at is null) then
    return null;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return null;
  end if;
  -- Asynchronous: pg_net queues the request and sends it after the transaction commits.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/notifications/push',
    body := jsonb_build_object('source', 'db_trigger'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000);
  return null;
exception when others then
  -- Push is best effort: never let it break the insert that created the notification.
  return null;
end $$;

revoke all on function private.notifications_push_webhook() from public;

drop trigger if exists notifications_push_webhook on public.notifications;
create trigger notifications_push_webhook
  after insert on public.notifications
  referencing new table as new_rows
  for each statement
  execute function private.notifications_push_webhook();

-- Speeds up the sender's "pending" query.
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at)
  where push_sent_at is null;

-- ---------------------------------------------------------------------------
-- 2) Lead card extras for the business owner
-- ---------------------------------------------------------------------------
-- Returns one row per lead the caller owns (admins: any lead):
--   summary: first 3 non-text answers ("3+1 · Her hafta · Cam silme"), each display cut to 40 chars
--   hired:   the request was closed with this lead's business as the hired firm
create or replace function public.my_lead_extras(p_lead_ids uuid[])
returns table (lead_id uuid, summary text, hired boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id,
         (select string_agg(left(a.value ->> 'display', 40), ' · ' order by a.ord)
            from (select e.value, e.ord
                    from jsonb_array_elements(private.resolve_answers(f.schema, r.answers)) with ordinality as e(value, ord)
                   where coalesce(e.value ->> 'type', '') <> 'text'
                     and coalesce(e.value ->> 'display', '') <> ''
                   order by e.ord
                   limit 3) a),
         (r.status = 'closed_hired' and r.hired_business_id = l.business_id)
    from public.leads l
    join public.businesses b on b.id = l.business_id
    join public.service_requests r on r.id = l.request_id
    left join public.question_flows f on f.id = r.flow_id
   where l.id = any ((coalesce(p_lead_ids, '{}'::uuid[]))[1:300])
     and (b.owner_id = auth.uid() or public.is_admin())
$$;

revoke execute on function public.my_lead_extras(uuid[]) from public, anon;
grant execute on function public.my_lead_extras(uuid[]) to authenticated, service_role;
