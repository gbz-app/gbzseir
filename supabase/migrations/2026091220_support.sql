-- Destek merkezi: şikayet, teknik destek, reklam / iş birliği, işletme ve öneri mesajları.
-- Extends contact_messages (kept for compatibility) with topic, status, admin note and a rate-limited submit RPC.
-- Additive and re-runnable.

alter table public.contact_messages add column if not exists topic text not null default 'diger';
alter table public.contact_messages add column if not exists subject text;
alter table public.contact_messages add column if not exists email text;
alter table public.contact_messages add column if not exists business_name text;
alter table public.contact_messages add column if not exists status text not null default 'new';
alter table public.contact_messages add column if not exists admin_note text;
alter table public.contact_messages add column if not exists page_path text;
alter table public.contact_messages add column if not exists user_agent text;
alter table public.contact_messages add column if not exists resolved_at timestamptz;
alter table public.contact_messages add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contact_messages_topic_check') then
    alter table public.contact_messages add constraint contact_messages_topic_check
      check (topic in ('sikayet', 'teknik_destek', 'reklam', 'isletme', 'oneri', 'diger'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_messages_status_check') then
    alter table public.contact_messages add constraint contact_messages_status_check check (status in ('new', 'in_progress', 'resolved', 'spam'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_messages_len_check') then
    alter table public.contact_messages add constraint contact_messages_len_check check (
      (subject is null or char_length(subject) <= 120)
      and (email is null or char_length(email) <= 120)
      and (business_name is null or char_length(business_name) <= 120)
      and (admin_note is null or char_length(admin_note) <= 2000)
      and (page_path is null or char_length(page_path) <= 300)
      and (user_agent is null or char_length(user_agent) <= 300));
  end if;
end $$;

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index if not exists contact_messages_user_idx on public.contact_messages (user_id, created_at desc);

-- Keep the legacy `handled` flag and the timestamps in sync with the status.
create or replace function private.contact_messages_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.handled := new.status in ('resolved', 'spam');
  if new.status in ('resolved', 'spam') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'spam') then
    new.resolved_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contact_messages_before_write on public.contact_messages;
create trigger contact_messages_before_write before insert or update on public.contact_messages
  for each row execute function private.contact_messages_before_write();

-- Signed-in users can see their own messages (and the status); admins see everything (existing policy).
drop policy if exists "own read" on public.contact_messages;
create policy "own read" on public.contact_messages for select to authenticated using (user_id = (select auth.uid()));

-- Direct inserts are replaced by the RPC below (validation + rate limit).
drop policy if exists "anyone insert" on public.contact_messages;

create or replace function public.submit_contact_message(
  p_topic text,
  p_message text,
  p_subject text default null,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_business_name text default null,
  p_page_path text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_message text := btrim(coalesce(p_message, ''));
  v_recent int;
  v_id uuid;
begin
  if p_topic is null or p_topic not in ('sikayet', 'teknik_destek', 'reklam', 'isletme', 'oneri', 'diger') then
    raise exception 'Geçersiz konu' using errcode = '22023', hint = 'invalid_topic';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 2000 then
    raise exception 'Mesaj 10-2000 karakter olmalı' using errcode = '22023', hint = 'invalid_message';
  end if;
  if v_uid is null and v_phone is null and v_email is null then
    raise exception 'Sana ulaşabilmemiz için telefon ya da e-posta yaz' using errcode = '22023', hint = 'contact_required';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-posta adresi geçersiz' using errcode = '22023', hint = 'invalid_email';
  end if;
  if v_phone is not null then
    v_phone := coalesce(private.phone_e164(v_phone), v_phone);
    if char_length(v_phone) > 20 then
      raise exception 'Telefon numarası geçersiz' using errcode = '22023', hint = 'invalid_phone';
    end if;
  end if;

  -- Rate limit: 5 messages per hour per user (or per phone / e-mail for guests).
  select count(*) into v_recent
    from public.contact_messages
   where created_at > now() - interval '1 hour'
     and ((v_uid is not null and user_id = v_uid)
       or (v_uid is null and ((v_phone is not null and phone = v_phone) or (v_email is not null and email = v_email))));
  if v_recent >= 5 then
    raise exception 'Çok fazla mesaj gönderdin, biraz sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.contact_messages (user_id, topic, subject, message, name, phone, email, business_name, page_path, user_agent)
  values (
    v_uid,
    p_topic,
    nullif(left(btrim(coalesce(p_subject, '')), 120), ''),
    v_message,
    nullif(left(btrim(coalesce(p_name, '')), 80), ''),
    v_phone,
    v_email,
    nullif(left(btrim(coalesce(p_business_name, '')), 120), ''),
    nullif(left(coalesce(p_page_path, ''), 300), ''),
    nullif(left(coalesce(p_user_agent, ''), 300), '')
  )
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) to anon, authenticated;
