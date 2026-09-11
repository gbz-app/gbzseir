-- Place corrections ("Bilgi hatalı mı? Bildir") go through submit_contact_message with a new topic 'bilgi_duzeltme'.
-- Guests may send that topic without phone / e-mail. Guest messages are throttled per IP hash (5 per hour)
-- and by a global guest cap (60 per hour), so changing the e-mail no longer bypasses the limit.
-- No direct INSERT policy is added. Additive and re-runnable.

alter table public.contact_messages add column if not exists ip_hash text;

alter table public.contact_messages drop constraint if exists contact_messages_topic_check;
alter table public.contact_messages add constraint contact_messages_topic_check
  check (topic in ('sikayet', 'teknik_destek', 'reklam', 'isletme', 'oneri', 'diger', 'bilgi_duzeltme'));

create index if not exists contact_messages_ip_idx on public.contact_messages (ip_hash, created_at desc) where ip_hash is not null;
create index if not exists contact_messages_guest_idx on public.contact_messages (created_at desc) where user_id is null;

-- Turkish labels for audit summaries (+ 'bilgi_duzeltme').
create or replace function private.tr_label(p_kind text, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_kind
    when 'profile' then case p_value when 'active' then 'Aktif' when 'restricted' then 'Kısıtlı' when 'banned' then 'Engelli' end
    when 'role' then case p_value when 'user' then 'Kullanıcı' when 'admin' then 'Yönetici' end
    when 'business' then case p_value when 'pending' then 'Onay bekliyor' when 'approved' then 'Onaylı' when 'rejected' then 'Reddedildi' when 'suspended' then 'Askıda' end
    when 'listing' then case p_value when 'draft' then 'Taslak' when 'pending_review' then 'Onay bekliyor' when 'active' then 'Yayında'
      when 'rejected' then 'Reddedildi' when 'expired' then 'Süresi doldu' when 'sold' then 'Satıldı' when 'filled' then 'Pozisyon doldu'
      when 'paused' then 'Durduruldu' when 'deleted' then 'Silindi' end
    when 'topic' then case p_value when 'sikayet' then 'şikayet' when 'teknik_destek' then 'teknik destek' when 'reklam' then 'reklam'
      when 'isletme' then 'işletme' when 'oneri' then 'öneri' when 'diger' then 'diğer' when 'bilgi_duzeltme' then 'yer bilgisi düzeltme' end
  end, p_value)
$$;

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
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_message text := btrim(coalesce(p_message, ''));
  v_ip text := private.request_ip_hash();
  v_recent int;
  v_id uuid;
begin
  if p_topic is null or p_topic not in ('sikayet', 'teknik_destek', 'reklam', 'isletme', 'oneri', 'diger', 'bilgi_duzeltme') then
    raise exception 'Geçersiz konu' using errcode = '22023', hint = 'invalid_topic';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 2000 then
    raise exception 'Mesaj 10-2000 karakter olmalı' using errcode = '22023', hint = 'invalid_message';
  end if;
  -- Guests need a way to be reached, except for place corrections.
  if v_uid is null and v_phone is null and v_email is null and p_topic <> 'bilgi_duzeltme' then
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

  -- Serialize per user (all guests share one lock) so parallel calls cannot race past the counts below.
  perform pg_advisory_xact_lock(hashtext('submit_contact_message:' || coalesce(v_uid::text, 'guest')));

  if v_uid is not null then
    -- 5 messages per hour per user.
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour' and user_id = v_uid;
    if v_recent >= 5 then
      raise exception 'Çok fazla mesaj gönderdin, biraz sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  else
    -- Guests: 5 per hour per IP hash or per phone / e-mail.
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour'
       and user_id is null
       and ((v_ip is not null and ip_hash = v_ip) or (v_phone is not null and phone = v_phone) or (v_email is not null and email = v_email));
    if v_recent >= 5 then
      raise exception 'Çok fazla mesaj gönderdin, biraz sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    -- Global guest cap (also covers requests without an IP hash).
    select count(*) into v_recent
      from public.contact_messages
     where created_at > now() - interval '1 hour' and user_id is null;
    if v_recent >= 60 then
      raise exception 'Şu an çok fazla mesaj geliyor, biraz sonra tekrar dene ya da giriş yapıp gönder' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  end if;

  insert into public.contact_messages (user_id, topic, subject, message, name, phone, email, business_name, page_path, user_agent, ip_hash)
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
    nullif(left(coalesce(p_user_agent, ''), 300), ''),
    v_ip
  )
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text, text, text) to anon, authenticated;
