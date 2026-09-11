-- Admin polish. Re-runnable.
-- Settings audit summaries: Turkish label of request_redispatch_hours (2026091340_request_redispatch.sql).
-- Latest body from 2026091331_admin_audit.sql (matches the live definition) + the new key.
create or replace function private.audit_setting_label(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_key
    when 'feature_business_applications' then 'Yeni işletme başvuruları'
    when 'maintenance_banner' then 'Duyuru bandı'
    when 'support_phone' then 'Destek telefonu'
    when 'support_email' then 'Destek e-postası'
    when 'listing_days' then 'İlan yayın süresi (gün)'
    when 'first_listings_moderated' then 'Onaya düşen ilk ilan sayısı'
    when 'listing_daily_cap' then 'Günlük ilan sınırı'
    when 'listing_active_cap' then 'Açık ilan sınırı'
    when 'max_providers_default' then 'Bir talebe en fazla firma'
    when 'request_redispatch_hours' then 'Yanıtsız talebi yeniden gönderme (saat)'
    when 'analytics_retention_days' then 'Analitik saklama süresi (gün)'
    when 'audit_retention_days' then 'İşlem kaydı saklama süresi (gün)'
    when 'duty_data_mode' then 'Nöbet listesi verisi'
    when 'otp_demo_mode' then 'Demo giriş modu'
  end, p_key)
$$;

revoke all on function private.audit_setting_label(text) from public, anon, authenticated;
