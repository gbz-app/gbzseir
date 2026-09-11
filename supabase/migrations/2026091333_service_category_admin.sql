-- Gebzem: admin add / edit / delete of service categories (Admin > Hizmet kategorileri). Additive and re-runnable.
--   1. admin_save_service_category(): insert or update; slug from tr_slug and unique; two levels only
--   2. admin_delete_service_category(): refuses while sub-categories, firms or requests use the category

-- ---------------------------------------------------------------------------
-- 1. Save (p_id null = new). Validation errors raise Turkish text with a machine hint.
--    Returns {ok, id, slug, created, old_slug, old_parent_slug} or {ok:false, reason:'not_found'}.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_service_category(
  p_id uuid,
  p_parent_id uuid,
  p_name text,
  p_slug text default null,
  p_icon text default null,
  p_description text default null,
  p_synonyms text[] default '{}',
  p_sort int default 100,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.service_categories;
  v_parent public.service_categories;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text;
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_syn text[];
  v_taken text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  if char_length(v_name) not between 2 and 60 then
    raise exception 'Kategori adı 2-60 karakter olmalı.' using errcode = '22023', hint = 'invalid_name';
  end if;
  -- The slug is always normalised by tr_slug (an empty one comes from the name).
  v_slug := rtrim(left(public.tr_slug(coalesce(nullif(btrim(p_slug), ''), v_name)), 60), '-');
  if char_length(v_slug) < 2 then
    raise exception 'Adres (slug) en az 2 harf ya da rakam içermeli.' using errcode = '22023', hint = 'invalid_slug';
  end if;
  -- Static pages next to the slug routes (/hizmet-talebi/tamam) would hide the category.
  if v_slug in ('tamam') then
    raise exception 'Bu adres (%) sistem sayfasına ayrılmış; başka bir adres yaz.', v_slug using errcode = '22023', hint = 'invalid_slug';
  end if;
  if v_icon is not null and v_icon !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Simge adı geçersiz.' using errcode = '22023', hint = 'invalid_icon';
  end if;
  if char_length(v_desc) > 300 then
    raise exception 'Açıklama en fazla 300 karakter olabilir.' using errcode = '22023', hint = 'invalid_description';
  end if;
  if p_sort is null or p_sort not between 0 and 10000 then
    raise exception 'Sıra 0 ile 10000 arasında olmalı.' using errcode = '22023', hint = 'invalid_sort';
  end if;
  -- Synonyms (search words): trimmed, blanks and accent/case duplicates dropped, input order kept.
  select coalesce(array_agg(x.s order by x.ord), '{}') into v_syn
    from (select distinct on (public.tr_norm(btrim(u.s))) btrim(u.s) as s, u.ord
            from unnest(coalesce(p_synonyms, '{}')) with ordinality as u(s, ord)
           where btrim(u.s) <> ''
           order by public.tr_norm(btrim(u.s)), u.ord) x;
  if cardinality(v_syn) > 30 or exists (select 1 from unnest(v_syn) s where char_length(s) > 40) then
    raise exception 'En fazla 30 arama kelimesi, her biri en fazla 40 karakter olabilir.' using errcode = '22023', hint = 'invalid_synonyms';
  end if;

  if p_id is not null then
    select * into v_old from public.service_categories where id = p_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
  end if;

  if p_parent_id is not null then
    if p_parent_id = p_id then
      raise exception 'Kategori kendi alt kategorisi olamaz.' using errcode = '22023', hint = 'invalid_parent';
    end if;
    select * into v_parent from public.service_categories where id = p_parent_id;
    if not found then
      raise exception 'Üst kategori bulunamadı.' using errcode = '22023', hint = 'invalid_parent';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'Yalnızca iki seviye var: üst kategori bir ana kategori olmalı.' using errcode = '22023', hint = 'invalid_parent';
    end if;
  end if;

  -- Level changes: a main category with sub-categories stays a main one; a sub-category in use stays a sub-category.
  if p_id is not null and v_old.parent_id is null and p_parent_id is not null
     and exists (select 1 from public.service_categories c where c.parent_id = p_id) then
    raise exception 'Alt kategorileri olan bir ana kategori başka bir kategorinin altına taşınamaz.' using errcode = '22023', hint = 'has_children';
  end if;
  if p_id is not null and v_old.parent_id is not null and p_parent_id is null
     and (exists (select 1 from public.business_service_categories b where b.category_id = p_id)
          or exists (select 1 from public.service_requests r where r.category_id = p_id)
          or exists (select 1 from public.question_flows f where f.category_id = p_id)) then
    raise exception 'Firması, talebi ya da soru akışı olan bir alt kategori ana kategori yapılamaz.' using errcode = '22023', hint = 'in_use';
  end if;

  select c.name into v_taken from public.service_categories c where c.slug = v_slug and c.id is distinct from p_id;
  if found then
    raise exception 'Bu adres (%) "%" kategorisinde kullanılıyor; başka bir adres yaz.', v_slug, v_taken
      using errcode = '23505', hint = 'slug_taken';
  end if;

  begin
    if p_id is null then
      insert into public.service_categories (parent_id, name, slug, icon, description, synonyms, sort, active)
      values (p_parent_id, v_name, v_slug, v_icon, v_desc, v_syn, p_sort, coalesce(p_active, true))
      returning id into v_id;
    else
      update public.service_categories
         set parent_id = p_parent_id, name = v_name, slug = v_slug, icon = v_icon, description = v_desc,
             synonyms = v_syn, sort = p_sort
       where id = p_id;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'Bu adres (%) başka bir kategoride kullanılıyor; başka bir adres yaz.', v_slug
      using errcode = '23505', hint = 'slug_taken';
  end;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'slug', v_slug, 'created', p_id is null,
    'old_slug', v_old.slug,
    'old_parent_slug', (select c.slug from public.service_categories c where c.id = v_old.parent_id));
end $$;

revoke all on function public.admin_save_service_category(uuid, uuid, text, text, text, text, text[], int, boolean) from public, anon;
grant execute on function public.admin_save_service_category(uuid, uuid, text, text, text, text, text[], int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Delete. A category with sub-categories, firms (business_service_categories) or requests is never deleted
--    (the admin deactivates it instead); an unused one goes with its question flows.
--    Returns {ok, slug, parent_slug} or {ok:false, reason:'not_found'|'in_use', children, firms, requests}.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_service_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat public.service_categories;
  v_children int;
  v_firms int;
  v_requests int;
  v_parent_slug text;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  -- The row lock makes concurrent firm / request inserts (FK key-share lock) wait, then fail.
  select * into v_cat from public.service_categories where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select count(*) into v_children from public.service_categories where parent_id = p_id;
  select count(*) into v_firms from public.business_service_categories where category_id = p_id;
  select count(*) into v_requests from public.service_requests where category_id = p_id;
  if v_children > 0 or v_firms > 0 or v_requests > 0 then
    return jsonb_build_object('ok', false, 'reason', 'in_use', 'children', v_children, 'firms', v_firms, 'requests', v_requests);
  end if;
  select c.slug into v_parent_slug from public.service_categories c where c.id = v_cat.parent_id;
  delete from public.service_categories where id = p_id;
  return jsonb_build_object('ok', true, 'slug', v_cat.slug, 'parent_slug', v_parent_slug);
end $$;

revoke all on function public.admin_delete_service_category(uuid) from public, anon;
grant execute on function public.admin_delete_service_category(uuid) to authenticated;
