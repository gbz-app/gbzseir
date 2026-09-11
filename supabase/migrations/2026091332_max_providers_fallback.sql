-- Max providers fallback (audit step 20). service_categories.max_providers is now optional: a category without its own
-- limit uses app_settings.max_providers_default (Admin > Ayarlar > "Bir talebe en fazla firma", 1-10).
-- Existing category values are kept; categories created without a limit follow the setting. Re-runnable.

-- ===========================================================================
-- 1. Column: nullable, no default (the 1-10 check stays and allows null)
-- ===========================================================================
alter table public.service_categories alter column max_providers drop not null;
alter table public.service_categories alter column max_providers drop default;

insert into public.app_settings (key, value) values ('max_providers_default', '5'::jsonb)
on conflict (key) do nothing;

-- ===========================================================================
-- 2. submit_service_request: same as 20260910000003_rpc.sql, plus the setting as the fallback limit
-- ===========================================================================
-- Create a service request. Returns {id, public_code, status, lead_count}.
-- Errors (raise, hint): login_required, category_not_found, neighbourhood_required, invalid_when,
-- invalid_answers (message lists the step ids), rate_limited, account_banned.
create or replace function public.submit_service_request(
  p_category_id uuid,
  p_answers jsonb,
  p_neighbourhood_id uuid,
  p_address_note text default null,
  p_when_type text default 'esnek',
  p_when_date date default null,
  p_note text default null,
  p_photos text[] default '{}',
  p_hide_phone boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cat public.service_categories;
  v_flow public.question_flows;
  v_errors text[];
  v_clean jsonb;
  v_code text;
  v_id uuid;
  v_dispatch jsonb;
  v_status text;
  v_nb text;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_max int;
begin
  if v_uid is null then
    raise exception 'Talep göndermek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.status = 'banned' then
    raise exception 'Hesabın askıya alınmış' using errcode = '42501', hint = 'account_banned';
  end if;
  select * into v_cat from public.service_categories where id = p_category_id and active;
  if not found then
    raise exception 'Hizmet kategorisi bulunamadı' using errcode = 'P0001', hint = 'category_not_found';
  end if;
  select name into v_nb from public.neighbourhoods where id = p_neighbourhood_id;
  if v_nb is null then
    raise exception 'Mahalle seçmelisin' using errcode = 'P0001', hint = 'neighbourhood_required';
  end if;
  if p_when_type is null or p_when_type not in ('acil', 'bu_hafta', 'tarih', 'esnek')
     or (p_when_type = 'tarih' and (p_when_date is null or p_when_date < v_today or p_when_date > v_today + 180)) then
    raise exception 'Geçerli bir zaman seçmelisin' using errcode = 'P0001', hint = 'invalid_when';
  end if;
  if (select count(*) from public.service_requests
       where customer_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Bugün çok fazla talep gönderdin, lütfen daha sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select * into v_flow from public.question_flows
   where category_id = p_category_id and published
   order by version desc limit 1;
  if found then
    select errors, cleaned into v_errors, v_clean from private.validate_answers(v_flow.schema, p_answers);
    if cardinality(v_errors) > 0 then
      raise exception 'Eksik veya geçersiz cevap: %', array_to_string(v_errors, ', ')
        using errcode = 'P0001', hint = 'invalid_answers';
    end if;
  else
    v_clean := coalesce(p_answers, '{}'::jsonb);
  end if;

  -- The category's own limit, else the admin default (kept within 1-10 like the category check).
  v_max := least(greatest(coalesce(v_cat.max_providers, private.app_setting_int('max_providers_default', 5)), 1), 10);

  v_code := private.new_public_code();
  insert into public.service_requests (
    public_code, customer_id, category_id, flow_id, answers, neighbourhood_id, address_note,
    when_type, when_date, note, photos, hide_phone, status, max_providers)
  values (
    v_code, v_uid, p_category_id, v_flow.id, v_clean, p_neighbourhood_id,
    nullif(left(btrim(coalesce(p_address_note, '')), 200), ''),
    p_when_type, case when p_when_type = 'tarih' then p_when_date end,
    nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    coalesce((coalesce(p_photos, '{}'::text[]))[1:6], '{}'::text[]),
    coalesce(p_hide_phone, false),
    case when v_cat.auto_dispatch then 'open' else 'admin_review' end,
    v_max)
  returning id into v_id;

  if v_cat.auto_dispatch then
    v_dispatch := private.dispatch_request(v_id, 1, null);
  else
    perform private.notify_admins('request_review', 'Onay bekleyen talep: ' || v_cat.name,
      v_nb || ' - kod ' || v_code, '/admin/talepler');
  end if;

  select status into v_status from public.service_requests where id = v_id;
  perform private.notify(v_uid, 'request_created', 'Talebin alındı',
    v_cat.name || ' talebin uygun firmalara iletilecek. Kabul eden firmaları bu sayfada göreceksin.',
    '/talep/' || v_code);

  return jsonb_build_object('id', v_id, 'public_code', v_code, 'status', v_status,
                            'lead_count', coalesce((v_dispatch ->> 'lead_count')::int, 0));
end $$;

revoke all on function public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean) from public, anon;
grant execute on function public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean) to authenticated;
