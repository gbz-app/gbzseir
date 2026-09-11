-- Taksi durakları (poi.kind = 'taxi') for the Yakınımda map. Additive and re-runnable.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.poi'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.poi drop constraint %I', c);
  end loop;
end $$;

alter table public.poi add constraint poi_kind_check check (kind in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi'));
