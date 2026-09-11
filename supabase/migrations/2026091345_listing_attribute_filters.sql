-- Gebzem: listing category fields marked "filterable" become real /ilanlar filters. Re-runnable.
--
-- 1) listing_categories.attributes_schema items may carry "filterable": true (select, number or boolean fields;
--    set in the admin category editor).
-- 2) search_listings gets p_attrs jsonb: the filter values keyed like the /ilanlar URL without the "a_" prefix,
--    e.g. {"marka": "apple", "ekran_boyutu_min": "40", "ekran_boyutu_max": "55", "takas": "1"}.
--    Keys are read only through the filterable fields of p_category_id (a sub category without fields uses its
--    parent's), so unknown keys and keys without a category are ignored.
--    select = equality, boolean = true only ("1"), number = range (<key>_min / <key>_max, either may be missing).
-- 3) GIN index on listings.attributes for the equality (@>) part.

set search_path = public, extensions;

create index if not exists listings_attributes_gin on public.listings using gin (attributes jsonb_path_ops);

-- The old 8-argument version would make named-argument calls ambiguous.
drop function if exists public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text);

-- Listing feed/search (active, not expired). Returns listings rows, so PostgREST embedding works:
--   supabase.rpc('search_listings', {...}).select('*, listing_media(*), neighbourhoods(name)').range(0, 19)
-- p_sort: 'newest' (default) | 'price_asc' | 'price_desc'
create or replace function public.search_listings(
  p_type text default 'classified',
  p_q text default null,
  p_category_id uuid default null,
  p_neighbourhood_id uuid default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_work_type text default null,
  p_sort text default 'newest',
  p_attrs jsonb default null)
returns setof public.listings
language sql
stable
set search_path = public, extensions
as $$
  with fields as materialized (
    -- Filterable fields of the chosen category with the raw values from p_attrs.
    select e->>'key' as key,
           e->>'type' as type,
           nullif(btrim(p_attrs->>(e->>'key')), '') as val,
           replace(btrim(p_attrs->>((e->>'key') || '_min')), ',', '.') as lo_txt,
           replace(btrim(p_attrs->>((e->>'key') || '_max')), ',', '.') as hi_txt
      from public.listing_categories c
      left join public.listing_categories pc on pc.id = c.parent_id
     cross join lateral jsonb_array_elements(case
         when jsonb_typeof(c.attributes_schema) = 'array' and jsonb_array_length(c.attributes_schema) > 0 then c.attributes_schema
         when jsonb_typeof(pc.attributes_schema) = 'array' then pc.attributes_schema
         else '[]'::jsonb end) e
     where jsonb_typeof(p_attrs) = 'object'
       and c.id = p_category_id
       and e->'filterable' = 'true'::jsonb
       and e->>'type' in ('select', 'number', 'boolean')
       and e->>'key' ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  eq as materialized (
    select jsonb_object_agg(f.key, case when f.type = 'boolean' then 'true'::jsonb else to_jsonb(f.val) end) as obj
      from fields f
     where (f.type = 'select' and f.val is not null)
        or (f.type = 'boolean' and f.val in ('1', 'true'))
  ),
  rng as materialized (
    select r.key,
           case when r.lo is not null then least(r.lo, r.hi) end as lo,
           case when r.hi is not null then greatest(r.lo, r.hi) end as hi
      from (
        select f.key,
               case when f.lo_txt ~ '^-?\d{1,15}(\.\d{1,6})?$' then f.lo_txt::numeric end as lo,
               case when f.hi_txt ~ '^-?\d{1,15}(\.\d{1,6})?$' then f.hi_txt::numeric end as hi
          from fields f
         where f.type = 'number'
      ) r
     where r.lo is not null or r.hi is not null
  )
  select l.*
    from public.listings l
   where l.status = 'active'
     and l.expires_at > now()
     and (p_type is null or l.type = p_type)
     and (p_category_id is null or l.category_id = p_category_id
          or l.category_id in (select c.id from public.listing_categories c where c.parent_id = p_category_id))
     and (p_neighbourhood_id is null or l.neighbourhood_id = p_neighbourhood_id)
     and (p_min_price is null or l.price_try >= p_min_price)
     and (p_max_price is null or l.price_try <= p_max_price)
     and (p_work_type is null or l.job_work_type = p_work_type)
     and (coalesce(btrim(p_q), '') = ''
          or public.tr_match(l.search_norm, public.tr_norm(p_q))
          or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, public.tr_norm(p_q)))
     and (p_attrs is null or (select eq.obj from eq) is null or l.attributes @> (select eq.obj from eq))
     and (p_attrs is null or not exists (
          -- Number values are stored as typed ("55", "15,6"); a listing without a valid number is outside the range.
          select 1
            from rng r
            cross join lateral (select replace(btrim(l.attributes->>r.key), ',', '.') as t) v
           where not coalesce(
                   -- case: the cast only runs on a valid number (AND has no fixed evaluation order).
                   case when v.t ~ '^-?\d{1,15}(\.\d{1,6})?$'
                        then (r.lo is null or v.t::numeric >= r.lo) and (r.hi is null or v.t::numeric <= r.hi) end,
                   false)))
   order by
     case when p_sort = 'price_asc' then l.price_try end asc nulls last,
     case when p_sort = 'price_desc' then l.price_try end desc nulls last,
     l.published_at desc nulls last,
     l.id
$$;

revoke execute on function public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text, jsonb) from public;
grant execute on function public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
