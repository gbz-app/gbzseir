-- The admin site without the service role key (audit step 60). The admin deployment (NEXT_PUBLIC_APP_MODE=admin) has
-- no SUPABASE_SERVICE_ROLE_KEY; everything it does goes through the admin's own session. Re-runnable.
--  1. admin_news_sources(): the news sources with the admin-only permission_note and the archived headline count
--     (/admin/haberler; permission_note is not readable through the API, see 2026091343_news_cron.sql).
--  2. admin_refresh_news_now(): "Şimdi çek" queues private.news_refresh_webhook() (pg_net -> the public app's
--     /api/cron/news, which has the key, fetches the feeds and expires the public news pages). Returns at once.
--     The pg_cron job and the page fallback of the public app are unchanged.
--  3. admin_set_user_status(): Aktif / Kısıtlı / Engelli in one transaction: profiles.status, the sign-in ban
--     (auth.users.banned_until, what the Auth Admin API's ban_duration set) and, on a ban, the user's auth sessions, so a
--     token refresh fails at once. An access token already issued stays valid until it expires (up to 1 hour); the
--     database refuses a banned caller's writes meanwhile (2026091311_ban_enforcement.sql). Replaces the Auth Admin API
--     call (service role) of the admin actions. Status changes stay audited by the audit_profiles trigger.
--  4. storage: admins may list and delete the demo photos under media/demo/ (demo cleanup after
--     admin_clear_demo_data). The broader "media owner or admin read" / "media owner delete" policies allow it today as
--     well; these keep the cleanup working if those are narrowed.

-- ---------------------------------------------------------------------------
-- 1. News sources for /admin/haberler
-- ---------------------------------------------------------------------------
create or replace function public.admin_news_sources()
returns table (
  id uuid,
  name text,
  site_url text,
  feed_url text,
  active boolean,
  last_fetched_at timestamptz,
  last_error text,
  fail_count integer,
  failing_since timestamptz,
  permission_note text,
  item_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_admin();
  return query
    select s.id, s.name, s.site_url, s.feed_url, s.active, s.last_fetched_at, s.last_error,
           s.fail_count, s.failing_since, s.permission_note,
           (select count(*)::int from public.news_items i where i.source_id = s.id)
      from public.news_sources s
     order by s.name, s.id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. "Şimdi çek": queue the scheduled fetch now
--    started: true  -> the call is queued (pg_net sends it after this transaction commits)
--    started: false -> reason 'no_sources' | 'recent' (every active feed was fetched within a minute) |
--                      'pending' (an earlier call is still in the pg_net queue) | 'no_secret' (Vault secret missing)
-- ---------------------------------------------------------------------------
create or replace function public.admin_refresh_news_now()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_oldest timestamptz;
begin
  perform private.assert_admin();
  -- Parallel clicks run one after the other, so the queue check below sees the earlier call.
  perform pg_advisory_xact_lock(hashtext('admin_refresh_news_now'));

  select min(coalesce(s.last_fetched_at, '-infinity'::timestamptz)) into v_oldest
    from public.news_sources s
   where s.active;
  if v_oldest is null then
    return jsonb_build_object('started', false, 'reason', 'no_sources');
  end if;
  if v_oldest > now() - interval '1 minute' then
    return jsonb_build_object('started', false, 'reason', 'recent');
  end if;

  -- pg_net internals: skipped when the queue table is not there or not readable.
  begin
    if exists (select 1 from net.http_request_queue q where q.url like '%/api/cron/news') then
      return jsonb_build_object('started', false, 'reason', 'pending');
    end if;
  exception when undefined_table or insufficient_privilege then
    null;
  end;

  -- Same secret private.news_refresh_webhook() reads; it returns silently without one.
  if not exists (select 1 from vault.decrypted_secrets ds
                  where ds.name = 'gebzem_push_webhook_secret' and coalesce(ds.decrypted_secret, '') <> '') then
    return jsonb_build_object('started', false, 'reason', 'no_secret');
  end if;

  perform private.news_refresh_webhook();
  return jsonb_build_object('started', true);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Account status with the sign-in ban (Admin > Kullanıcılar, Şikayetler > "İçeriği kaldır" for a user)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.profiles;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
  v_ban_changed boolean;
  v_sessions int := 0;
begin
  perform private.assert_admin();
  if p_status is null or p_status not in ('active', 'restricted', 'banned') then
    raise exception 'Geçersiz hesap durumu.' using errcode = '22023', hint = 'invalid_status';
  end if;
  if p_user_id is not distinct from auth.uid() then
    raise exception 'Kendi hesabının durumunu değiştiremezsin.' using errcode = '42501', hint = 'self';
  end if;
  select * into v_old from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_old.role = 'admin' then
    raise exception 'Yönetici hesaplarının durumu buradan değiştirilemez.' using errcode = '42501', hint = 'admin_target';
  end if;
  v_ban_changed := (v_old.status = 'banned') <> (p_status = 'banned');

  -- audit_profiles logs the change; profiles_ban_changed recomputes the ratings of the businesses the user reviewed.
  if v_old.status is distinct from p_status then
    update public.profiles set status = p_status where id = p_user_id;
  end if;

  if p_status = 'banned' then
    -- Same length as the Auth API's ban_duration '876000h' (about 100 years). A real date: Auth cannot read 'infinity'.
    update auth.users set banned_until = now() + interval '876000 hours', updated_at = now() where id = p_user_id;
    -- Refresh tokens go with their sessions (on delete cascade); tokens without a session are removed as well.
    delete from auth.sessions where user_id = p_user_id;
    get diagnostics v_sessions = row_count;
    delete from auth.refresh_tokens where user_id = p_user_id::text;
  else
    update auth.users set banned_until = null, updated_at = now() where id = p_user_id and banned_until is not null;
  end if;

  if v_ban_changed then
    perform private.audit(p_user_id, 'profile.signin', 'profile', p_user_id,
      case when p_status = 'banned'
           then 'Giriş engellendi' || case when v_sessions > 0 then ', ' || v_sessions || ' açık oturum kapatıldı' else '' end
           else 'Giriş engeli kaldırıldı' end,
      jsonb_strip_nulls(jsonb_build_object('reason', v_reason)));
  end if;

  return jsonb_build_object('ok', true, 'status', p_status, 'previous', v_old.status,
    'ban_changed', v_ban_changed, 'sessions_closed', v_sessions);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Storage: demo photos (media/demo/**) for the demo cleanup
-- ---------------------------------------------------------------------------
drop policy if exists "media admin demo read" on storage.objects;
create policy "media admin demo read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'demo' and (select public.is_admin()));
drop policy if exists "media admin demo delete" on storage.objects;
create policy "media admin demo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'demo' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Grants: signed-in callers only; each function checks private.assert_admin() first.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_news_sources() from public, anon;
revoke all on function public.admin_refresh_news_now() from public, anon;
revoke all on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_news_sources() to authenticated;
grant execute on function public.admin_refresh_news_now() to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
