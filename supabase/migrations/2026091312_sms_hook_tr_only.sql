-- Plan step 10 (otp-switch): the Send-SMS hook accepts only Turkish mobile numbers (+905XXXXXXXXX).
-- Blocks SMS pumping to foreign or landline numbers once a real provider sits behind the hook. Checks the login
-- phone and the target of a phone change (user.new_phone). Demo storage under user.phone and otp_demo_mode are unchanged;
-- a phone-change code is also stored under the new number (non-admins) so the demo banner of that flow finds it.
-- Re-runnable.

create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
  v_new_phone text := regexp_replace(coalesce(event -> 'user' ->> 'new_phone', ''), '\D', '', 'g');
  v_code text := event -> 'sms' ->> 'otp';
begin
  -- TR mobile only (the client checks this too). A hook error makes Auth refuse to send the code.
  if (v_phone = '' and v_new_phone = '')
     or (v_phone <> '' and v_phone !~ '^905[0-9]{9}$')
     or (v_new_phone <> '' and v_new_phone !~ '^905[0-9]{9}$') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Invalid phone: only Turkish mobile numbers (+905XXXXXXXXX) are accepted.'
    ));
  end if;
  if v_phone <> '' and v_code is not null then
    insert into public.demo_otp (phone, code) values (v_phone, v_code);
  end if;
  -- Phone change: Auth sends to user.new_phone and the banner asks for that number. Never for admins
  -- (get_demo_otp only hides codes stored under an admin's current phone).
  if v_new_phone <> '' and v_new_phone <> v_phone and v_code is not null
     and not exists (select 1 from public.profiles
                      where id::text = coalesce(event -> 'user' ->> 'id', '') and role = 'admin') then
    insert into public.demo_otp (phone, code) values (v_new_phone, v_code);
  end if;
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return '{}'::jsonb;
end $$;

grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.send_sms_hook(jsonb) from anon, authenticated, public;
