-- Finance receipts + category safety. Re-runnable.
--   1. finance_entries.document_path: an uploaded receipt / invoice in private-docs/finance/<entry id>/<file>
--      (the old free-text document_url stays for existing links).
--   2. storage: only admins may upload under private-docs/finance/. Read and delete are already admin-only there
--      ("docs owner or admin read" / "docs owner delete": the first folder "finance" is never a user id).
--   3. A category that is used by an entry cannot be deleted (was ON DELETE SET NULL); hide it instead.

-- ---------------------------------------------------------------------------
-- 1. Receipt path
-- ---------------------------------------------------------------------------
alter table public.finance_entries add column if not exists document_path text;

alter table public.finance_entries drop constraint if exists finance_entries_document_path_check;
alter table public.finance_entries add constraint finance_entries_document_path_check
  check (document_path is null or document_path ~ ('^finance/' || id::text || '/[A-Za-z0-9_-]{1,80}\.(pdf|jpg|png|webp)$'));

-- ---------------------------------------------------------------------------
-- 2. Storage: admins upload receipts under private-docs/finance/...
-- ---------------------------------------------------------------------------
drop policy if exists "docs admin finance insert" on storage.objects;
create policy "docs admin finance insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = 'finance' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Categories in use cannot be deleted
-- ---------------------------------------------------------------------------
alter table public.finance_entries drop constraint if exists finance_entries_category_id_fkey;
alter table public.finance_entries add constraint finance_entries_category_id_fkey
  foreign key (category_id) references public.finance_categories (id) on delete restrict;
