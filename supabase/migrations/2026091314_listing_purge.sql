-- Gebzem: deleted listings are really deleted after 30 days. Additive and re-runnable.
--
-- 1) listings.deleted_at: set by a trigger when status becomes 'deleted' (cleared if an admin restores the listing).
--    Clients cannot choose the timestamp; SQL / service-role jobs may set it explicitly (backfills, tests).
-- 2) A hard-deleted listing takes its favorites with it (listing_media already cascades).
-- 3) pg_cron job gebzem-purge-listings (daily 03:41 UTC) POSTs through pg_net to /api/cron/purge-listings, which
--    removes the Storage photos of listings deleted more than 30 days ago and then deletes the rows.
--    The secret is the existing Vault secret 'gebzem_push_webhook_secret' (= CRON_SECRET on Vercel, see
--    2026091130_services_push_and_leads.sql). Without it, or with nothing to purge, the job is a no-op.

set search_path = public, extensions;

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1) deleted_at
-- ---------------------------------------------------------------------------
alter table public.listings add column if not exists deleted_at timestamptz;

create index if not exists listings_deleted_idx on public.listings (deleted_at) where status = 'deleted';

-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function private.listings_deleted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trusted boolean := current_user::text not in ('authenticated', 'anon');
begin
  if new.status is distinct from 'deleted' then
    new.deleted_at := null;
  elsif tg_op = 'INSERT' then
    if not v_trusted or new.deleted_at is null then
      new.deleted_at := now();
    end if;
  elsif v_trusted and new.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    null; -- explicit value from SQL / service role
  elsif old.status = 'deleted' then
    new.deleted_at := coalesce(old.deleted_at, now());
  else
    new.deleted_at := now();
  end if;
  return new;
end $$;

revoke all on function private.listings_deleted_at() from public, anon, authenticated;

-- Same-timing triggers fire in name order: this one runs after listings_before_insert / listings_before_update,
-- so it sees the final status.
drop trigger if exists listings_deleted_at on public.listings;
create trigger listings_deleted_at
  before insert or update on public.listings
  for each row execute function private.listings_deleted_at();

-- Listings deleted before this migration: best guess is their last update.
update public.listings set deleted_at = updated_at where status = 'deleted' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) Favorites of hard-deleted listings
-- ---------------------------------------------------------------------------
create or replace function private.listings_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.favorites f
   using old_rows o
   where f.target_type = 'listing' and f.target_id = o.id;
  return null;
end $$;

revoke all on function private.listings_after_delete() from public, anon, authenticated;

drop trigger if exists listings_after_delete on public.listings;
create trigger listings_after_delete
  after delete on public.listings
  referencing old table as old_rows
  for each statement
  execute function private.listings_after_delete();

-- ---------------------------------------------------------------------------
-- 3) Daily purge call (same pattern as private.notifications_push_webhook)
-- ---------------------------------------------------------------------------
create or replace function private.purge_listings_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  -- 30 days = RETENTION_DAYS in src/app/api/cron/purge-listings/route.ts
  if not exists (select 1 from public.listings where status = 'deleted' and deleted_at < now() - interval '30 days') then
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
    url := 'https://gbzsehir.vercel.app/api/cron/purge-listings',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 30000);
end $$;

revoke all on function private.purge_listings_webhook() from public, anon, authenticated;

-- 03:41 UTC = 06:41 Europe/Istanbul
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-purge-listings';
    perform cron.schedule('gebzem-purge-listings', '41 3 * * *', 'select private.purge_listings_webhook()');
  end if;
end $$;
