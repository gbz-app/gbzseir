-- Gebzem: storage buckets + policies. Re-runnable.
--   media        public read; signed-in users write only under "<auth.uid()>/..."; images only, max 5 MB.
--   private-docs private; owner writes under "<auth.uid()>/..."; owner + admin read; max 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
       ('private-docs', 'private-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media public read" on storage.objects;
drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;
drop policy if exists "docs owner or admin read" on storage.objects;
drop policy if exists "docs owner insert" on storage.objects;
drop policy if exists "docs owner delete" on storage.objects;

create policy "media public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');
create policy "media owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create policy "docs owner or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'private-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
create policy "docs owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "docs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
