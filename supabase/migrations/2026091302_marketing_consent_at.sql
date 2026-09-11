-- Ticari ileti izni tarihi: profiles.marketing_consent_at is stamped whenever marketing_consent changes
-- (given or withdrawn). The audit_profiles trigger already logs both. Additive and re-runnable.

alter table public.profiles add column if not exists marketing_consent_at timestamptz;
comment on column public.profiles.marketing_consent_at is 'When marketing_consent last changed. Set by trigger; users cannot write it.';

-- Invoker trigger: current_user is the real caller ('authenticated'/'anon' for direct API writes,
-- the owner inside our SECURITY DEFINER RPCs and scripts, which may set the date themselves).
create or replace function private.profiles_consent_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user::text in ('authenticated', 'anon') or new.marketing_consent_at is null then
      new.marketing_consent_at := case when new.marketing_consent then now() end;
    end if;
  elsif new.marketing_consent is distinct from old.marketing_consent then
    new.marketing_consent_at := now();
  elsif current_user::text in ('authenticated', 'anon') then
    new.marketing_consent_at := old.marketing_consent_at;
  end if;
  return new;
end $$;

revoke execute on function private.profiles_consent_at() from public, anon, authenticated;

drop trigger if exists profiles_consent_at on public.profiles;
create trigger profiles_consent_at before insert or update of marketing_consent, marketing_consent_at on public.profiles
  for each row execute function private.profiles_consent_at();

-- Backfill: last consent change from the audit log; consents given before auditing date from sign-up.
update public.profiles p
   set marketing_consent_at = coalesce(
         (select max(a.created_at) from public.audit_log a
           where a.action = 'profile.consent' and a.entity_type = 'profile' and a.entity_id = p.id),
         case when p.marketing_consent then p.created_at end)
 where p.marketing_consent_at is null
   and (p.marketing_consent
        or exists (select 1 from public.audit_log a where a.action = 'profile.consent' and a.entity_type = 'profile' and a.entity_id = p.id));
