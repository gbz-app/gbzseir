-- Reports (şikayet) hardening: inserts only through submit_report (login, target check, one open report per
-- user and target, 20 per day), and admin notes move to an admin-only table (reporters can read their own rows).
-- Re-runnable.

-- 1) One open report per reporter and target. Close older duplicates first so the index can be built.
update public.reports r
   set status = 'dismissed', resolved_at = coalesce(r.resolved_at, now())
 where r.status = 'open'
   and r.reporter_id is not null
   and exists (
     select 1 from public.reports o
      where o.status = 'open' and o.reporter_id = r.reporter_id and o.target_type = r.target_type and o.target_id = r.target_id
        and (o.created_at, o.id) < (r.created_at, r.id));

create unique index if not exists reports_reporter_target_uidx on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);

-- 2) No direct inserts (the RPC below is the only way in); guests have no access at all.
drop policy if exists "anyone insert" on public.reports;
revoke all on public.reports from anon;
revoke insert, truncate, references, trigger on public.reports from authenticated;

-- 3) Admin-only notes (same pattern as support_notes).
create table if not exists public.report_notes (
  report_id uuid primary key references public.reports (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.report_notes enable row level security;
drop policy if exists "admin all" on public.report_notes;
create policy "admin all" on public.report_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.report_notes from anon;
grant select, insert, update, delete on public.report_notes to authenticated;

drop trigger if exists set_updated_at on public.report_notes;
create trigger set_updated_at before update on public.report_notes for each row execute function private.set_updated_at();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'admin_note') then
    insert into public.report_notes (report_id, note)
    select id, left(admin_note, 2000) from public.reports where admin_note is not null and btrim(admin_note) <> ''
    on conflict (report_id) do nothing;
    alter table public.reports drop column admin_note;
  end if;
end $$;

-- 4) submit_report: the only way to file a report. Returns the new report id.
create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason text, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_detail text := nullif(left(btrim(coalesce(p_detail, '')), 1000), '');
  v_owner uuid;
  v_found boolean := false;
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Şikayet etmek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status in ('banned', 'restricted')) then
    raise exception 'Hesabın kısıtlı olduğu için şikayet gönderemezsin' using errcode = '42501', hint = 'restricted';
  end if;
  if p_target_type is null or p_target_type not in ('listing', 'business', 'review', 'user') then
    raise exception 'Geçersiz şikayet konusu' using errcode = '22023', hint = 'invalid_target';
  end if;
  if p_reason is null or p_reason not in ('dolandiricilik', 'yanlis_kategori', 'uygunsuz', 'yaniltici', 'diger') then
    raise exception 'Geçersiz şikayet nedeni' using errcode = '22023', hint = 'invalid_reason';
  end if;

  -- The target must exist and be publicly visible.
  case p_target_type
    when 'listing' then
      select true, l.owner_id into v_found, v_owner from public.listings l
       where l.id = p_target_id and l.status in ('active', 'sold', 'filled');
    when 'business' then
      select true, b.owner_id into v_found, v_owner from public.businesses b
       where b.id = p_target_id and b.status = 'approved';
    when 'review' then
      select true, r.author_id into v_found, v_owner from public.reviews r
        join public.businesses b on b.id = r.business_id
       where r.id = p_target_id and b.status = 'approved';
    when 'user' then
      select true, p.id into v_found, v_owner from public.profiles p where p.id = p_target_id;
  end case;
  if not coalesce(v_found, false) then
    raise exception 'Şikayet edilen içerik bulunamadı' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_owner = v_uid then
    raise exception 'Kendi içeriğini şikayet edemezsin' using errcode = '22023', hint = 'own_content';
  end if;

  -- One caller at a time, so the checks below cannot race.
  perform pg_advisory_xact_lock(hashtextextended('submit_report:' || v_uid::text, 0));

  if exists (select 1 from public.reports where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id and status = 'open') then
    raise exception 'Bu içeriği zaten şikayet ettin' using errcode = '23505', hint = 'already_reported';
  end if;
  select count(*) into v_recent from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day';
  if v_recent >= 20 then
    raise exception 'Bugün çok fazla şikayet gönderdin, yarın tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, detail)
  values (v_uid, p_target_type, p_target_id, p_reason, v_detail)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
