-- Doctor profiles (owner: "doktorların kendi profilleri olsun"). Every business_staff row gets a URL slug for its own
-- page (/doktor/<slug>): title + name + a short suffix, e.g. "uzm-dr-ayse-yilmaz-3f9a". It is set once and kept when the
-- name or title changes, so a shared link never breaks; an empty slug is generated again. Owners never pick or change it
-- (a new row always gets a generated one); admins and the service role may set their own, normalized with tr_slug.
-- The page reads through the existing "public read" RLS (active people of public businesses) plus the businesses embed,
-- so no RPC is needed.
-- Re-runnable.

alter table public.business_staff add column if not exists slug text;

-- 1) Slug maker ------------------------------------------------------------------------------------------------------
-- `p_wanted` (a slug a trusted writer asked for, or the row's current one) is normalized and returned as is; otherwise a
-- new "<title-name>-<4 hex>" slug is generated. SECURITY DEFINER: the uniqueness check must see every row, and RLS hides
-- other clinics' hidden people from an owner. Private schema: not reachable through the API, only through the trigger.
create or replace function private.business_staff_make_slug(p_id uuid, p_title text, p_name text, p_wanted text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_seed text := coalesce(p_id::text, gen_random_uuid()::text);
  v_base text;
  v_slug text;
  i int := 0;
begin
  v_slug := nullif(public.tr_slug(p_wanted), '');
  if v_slug is not null then
    return v_slug;
  end if;
  -- The "Diğer" title is not shown before the name, so it stays out of the URL too.
  v_base := public.tr_slug(case when p_title is null or p_title = 'Diğer' then '' else p_title || ' ' end || coalesce(p_name, ''));
  v_base := btrim(left(coalesce(nullif(v_base, ''), 'doktor'), 70), '-');
  loop
    v_slug := v_base || '-' || substr(md5(v_seed || ':' || i::text), 1, case when i < 8 then 4 else 8 end);
    exit when not exists (select 1 from public.business_staff s where s.slug = v_slug and s.id is distinct from p_id);
    i := i + 1;
  end loop;
  return v_slug;
end $$;

revoke all on function private.business_staff_make_slug(uuid, text, text, text) from public, anon;
-- The trigger runs with the writer's rights (the invoker-trigger pattern of 20260910000007): owners reach this helper as
-- authenticated, migrations and SQL scripts as postgres. service_role has no USAGE on schema private (project-wide), so
-- a service-key REST insert would fail here like the other private trigger helpers; nothing writes staff that way.
grant execute on function private.business_staff_make_slug(uuid, text, text, text) to authenticated, service_role;

-- 2) Trigger: fills and guards the slug. Fires after business_staff_before_write (same timing, triggers run by name), so
--    the name is already trimmed.
create or replace function private.business_staff_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    -- Owners never pick the URL: a new row gets a generated one, an existing row keeps its own.
    if tg_op = 'UPDATE' then
      new.slug := old.slug;
    else
      new.slug := null;
    end if;
  end if;
  -- Unchanged slug on an edit: nothing to do (a name or title change keeps the link).
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug and coalesce(new.slug, '') <> '' then
    return new;
  end if;
  new.slug := private.business_staff_make_slug(new.id, new.title, new.name, new.slug);
  return new;
end $$;

revoke all on function private.business_staff_slug() from public, anon, authenticated;

drop trigger if exists business_staff_slug on public.business_staff;
create trigger business_staff_slug before insert or update on public.business_staff
  for each row execute function private.business_staff_slug();

-- 3) Backfill, one row per statement so each new slug is visible to the next uniqueness check.
do $$
declare
  r record;
begin
  for r in select id from public.business_staff where slug is null or slug = '' order by created_at, id loop
    update public.business_staff set slug = null where id = r.id;
  end loop;
end $$;

-- 4) Constraints. The '' default only makes the column optional for writers (generated types); the trigger always
--    replaces it before the checks run.
alter table public.business_staff alter column slug set default '';
alter table public.business_staff alter column slug set not null;
create unique index if not exists business_staff_slug_key on public.business_staff (slug);
alter table public.business_staff drop constraint if exists business_staff_slug_format;
alter table public.business_staff add constraint business_staff_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100);

comment on column public.business_staff.slug is
  'URL of the profile page (/doktor/<slug>): title + name + short suffix, generated by the business_staff_slug trigger and kept when the name changes. Owners cannot set it; admins and the service role can.';

notify pgrst, 'reload schema';
