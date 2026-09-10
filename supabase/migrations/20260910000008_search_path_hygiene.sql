-- Gebzem: pin search_path on remaining helper/trigger functions (Supabase advisor "function_search_path_mutable").
-- Re-runnable (ALTER FUNCTION ... SET is idempotent).
alter function public.short_name(text) set search_path = public, extensions;
alter function public.tr_match(text, text) set search_path = public, extensions;
alter function private.phone_digits(text) set search_path = public, extensions;
alter function private.phone_e164(text) set search_path = public, extensions;
alter function private.set_updated_at() set search_path = public, extensions;
alter function private.format_try(numeric) set search_path = public, extensions;
alter function private.profiles_protect() set search_path = public, extensions;
alter function private.service_categories_norm() set search_path = public, extensions;
alter function private.businesses_before_write() set search_path = public, extensions;
alter function private.poi_before_write() set search_path = public, extensions;
alter function private.drop_policies(text) set search_path = public, extensions;
alter function private.current_duty_day() set search_path = public, extensions;
alter function private.validate_answers(jsonb, jsonb) set search_path = public, extensions;
alter function private.resolve_answers(jsonb, jsonb) set search_path = public, extensions;
alter function private.new_public_code() set search_path = public, extensions;
alter function private.upsert_flow(text, jsonb) set search_path = public, extensions;
alter function private.upsert_listing_category(text, text, text, text, text, int, boolean, jsonb) set search_path = public, extensions;
alter function private.upsert_service_category(text, text, text, text, text, int, boolean, boolean, text[]) set search_path = public, extensions;
alter function private.listings_before_insert() set search_path = public, extensions;
alter function private.listings_before_update() set search_path = public, extensions;
