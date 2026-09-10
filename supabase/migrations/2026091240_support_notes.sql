-- Internal support notes move out of contact_messages: senders can read their own messages (RLS "own read"),
-- so an admin-only note must not live on the same row. Additive and re-runnable.

create table if not exists public.support_notes (
  message_id uuid primary key references public.contact_messages (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.support_notes enable row level security;
drop policy if exists "admin all" on public.support_notes;
create policy "admin all" on public.support_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.support_notes to authenticated;

drop trigger if exists set_updated_at on public.support_notes;
create trigger set_updated_at before update on public.support_notes for each row execute function private.set_updated_at();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contact_messages' and column_name = 'admin_note') then
    insert into public.support_notes (message_id, note)
    select id, left(admin_note, 2000) from public.contact_messages where admin_note is not null and btrim(admin_note) <> ''
    on conflict (message_id) do nothing;
    alter table public.contact_messages drop constraint if exists contact_messages_len_check;
    alter table public.contact_messages drop column admin_note;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_messages_len_check') then
    alter table public.contact_messages add constraint contact_messages_len_check check (
      (subject is null or char_length(subject) <= 120)
      and (email is null or char_length(email) <= 120)
      and (business_name is null or char_length(business_name) <= 120)
      and (page_path is null or char_length(page_path) <= 300)
      and (user_agent is null or char_length(user_agent) <= 300));
  end if;
end $$;
