-- "Tümünü okundu yap" on /profil/bildirimler. Re-runnable.
-- Marks every unread notification of the caller read. Same column and semantics as mark_notifications_read
-- (20260910000003_rpc.sql: read_at = now(), own unread rows only, returns the number updated), but without an
-- id list, so it is not capped by the 100 rows the page loads.
-- Admin notices (links into the separate admin site, '/admin...') stay unread: the public list
-- (src/app/(main)/profil/bildirimler/page.tsx) and the unread counter (src/lib/notifications/use-unread-notifications.ts)
-- hide them with link.is.null,link.not.like./admin*, and admins clear them in the admin panel
-- (mark_notifications_read with explicit ids). Do not use mark_notifications_read(null) for this: it clears them too.
create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (link is null or link not like '/admin%');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.mark_all_notifications_read() is
  'Marks all unread notifications of auth.uid() read, except admin-panel notices (link like ''/admin%''). Returns the number updated.';

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
