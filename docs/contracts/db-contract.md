# Veritabanı sözleşmesi (DB contract)

Foundation DB agent çıktısı, 2026-09-10.

GENERAL: import type { Database } from "@/lib/database.types" (generated, 8 migrations applied). All ids uuid strings; timestamps ISO timestamptz; phones E.164 "+905XXXXXXXXX". NEVER select geography columns (neighbourhoods.center, businesses.location, poi.location: hex EWKB) – use generated lat/lng. RPC errors: PostgREST error.message = Turkish user-facing text, error.hint = machine code. Search normalisation public.tr_norm() == src/core/tr.ts trNormalize(). Embeds verified: listings?select=*,owner:public_profiles(display_name,created_at),business:businesses(name,phone,slug,logo_url,verification_level),listing_categories(name,slug),neighbourhoods(name),listing_media(url,thumb_url,sort); reviews?select=*,author:public_profiles!reviews_author_id_fkey(display_name); businesses?select=*,business_service_categories(service_categories(id,name,slug)),business_service_areas(neighbourhoods(id,name)),business_photos(*),reviews(count).

TABLES (RLS enabled everywhere):
- neighbourhoods(id, name [short, e.g. 'Hacıhalil'; UI may append ' Mah.'], slug uq, district 'Gebze', center, lat, lng, osm_id, created_at). 40 rows. Public read.
- app_settings(key pk, value jsonb, updated_at): otp_demo_mode true, listing_days 30, max_providers_default 5, first_listings_moderated 3, duty_data_mode "demo". Public read, admin write.
- profiles(id=auth uid, full_name<=80, phone uq E.164, avatar_url, email, neighbourhood_id, role 'user'|'admin', status 'active'|'restricted'|'banned', trusted_publisher, marketing_consent, kvkk_accepted_at, onboarded, is_demo, created_at, updated_at). Row auto-created on signup (phone filled). Own row select/update (admin all). A trigger silently keeps id, phone, role, status, trusted_publisher, is_demo, created_at for non-admins. Profile completion = update {full_name, neighbourhood_id, kvkk_accepted_at, marketing_consent, onboarded:true}. No insert/delete.
- VIEW public_profiles(id, display_name 'Ayşe Y.', avatar_url, neighbourhood_id, phone_verified, created_at): anon+auth read, no phone/email.
- businesses(id, owner_id uq, slug uq auto, name 2-80, logo_url, cover_url, description<=2000, phone E.164 PUBLIC, address, location, lat, lng, neighbourhood_id, kinds text[] subset {service,shop,employer}, category_label, working_hours jsonb {"mon":{"open":"09:00","close":"18:00"},...,"sat":{...},"sun":null} [keys mon,tue,wed,thu,fri,sat,sun; null/missing = closed], status 'pending'|'approved'|'rejected'|'suspended', rejection_reason, verification_level 0-3 (>=1 'Onaylı'), vacation_mode, rating_avg numeric(3,2), rating_count, leads_accepted_count, search_norm, is_demo, created_at, updated_at, approved_at). Anon/auth read approved; owner reads own (any status); owner insert/update own; admin all. Trigger (non-admin): insert forces pending, verification 0, auto slug; update keeps status, verification_level, rating_*, leads_accepted_count, approved_at, rejection_reason, slug, owner_id, is_demo. Editing a rejected business re-submits it as pending. One business per user. Use kinds.includes('service'|'shop'|'employer'); there are no is_* booleans.
- business_service_categories(business_id, category_id) pk; business_service_areas(business_id, neighbourhood_id) pk; business_photos(id, business_id, url, sort, created_at): read if business approved or own; owner CRUD own.
- business_documents(id, business_id, path ['<uid>/...' in private-docs], kind 'vergi_levhasi'|'kimlik'|'meslek_belgesi'|'diger', created_at): owner/admin only.
- reviews(id, business_id, request_id?, author_id?, rating 1-5, comment<=1000, reply<=1000, replied_at, is_demo, created_at; uq(request_id,business_id)). Public read. Writes only via RPC (admin direct).
- service_categories(id, parent_id [null = top level], name, slug uq, icon [lucide], description, synonyms text[], sort, popular, active, max_providers 5, notify_pool_size 8, auto_dispatch, search_norm, created_at). 10 top + 32 subs. Popular subs: ev-temizligi, koltuk-yikama, boya-badana, evden-eve-nakliyat, kombi-bakimi, klima-montaj-bakim, su-tesisati, elektrikci. auto_dispatch=true only for ev-temizligi; others are concierge. Public read, admin write.
- question_flows(id, category_id, version, schema jsonb {steps:[{id,type:'single'|'multi'|'number'|'text'|'date',title,help?,required?,options?[{value,label}],min?,max?,unit?,placeholder?,showIf?{step,in[]}}]} [same as src/core/flow.ts; system steps NOT included], published, created_at; uq(category_id,version)). Public reads published: .eq('category_id',id).eq('published',true).order('version',{ascending:false}).limit(1).
- service_requests(id, public_code 8 chars [A-Z2-9] uq, customer_id, category_id, flow_id, answers jsonb, neighbourhood_id, address_note<=200, when_type 'acil'|'bu_hafta'|'tarih'|'esnek', when_date, note<=1000, photos text[]<=6, hide_phone, status 'admin_review'|'open'|'filled'|'closed_hired'|'closed_cancelled'|'expired'|'no_match', accepted_count, max_providers, hired_business_id, dispatch_note ['area_fallback'], is_demo, created_at, updated_at, closed_at). Customer reads own ("Taleplerim": select('*,service_categories(name,slug,icon),neighbourhoods(name)').eq('customer_id',uid)); admin read/update; writes via RPC.
- leads(id, request_id, business_id, status 'sent'|'seen'|'accepted'|'declined'|'closed_full'|'removed_by_customer', offer_price_try, offer_note<=280, wave_no, match_score, seen_at, accepted_at, created_at, updated_at; uq(request_id,business_id)). Readable by the business owner and the request's customer; admin all; writes via RPC.
- VIEW my_leads (authenticated; the caller's business only, admin all): id, request_id, business_id, status, offer_price_try, offer_note, wave_no, seen_at, accepted_at, created_at, request_status, when_type, when_date, accepted_count, max_providers, request_created_at, category_id, category_name, category_slug, category_icon, neighbourhood_id, neighbourhood_name, photo_count, has_note. No customer identity.
- poi(id, kind 'pharmacy'|'mosque'|'bus_stop'|'place', name, slug uq, address, phone, location, lat, lng, neighbourhood_id, details jsonb, source 'kbb'|'osm'|'manual'|'demo', source_ref, license, search_norm, created_at, updated_at; uq(source,source_ref)). details for place: {category:'tarihi'|'park'|'doga'|'muze'|'avm'|'diger', description?, curated:bool, photos:[], hours?, fee?, wikidata?}; for bus_stop: {lines:string[] (often empty), stop_code?, shelter?}. Show curated places first. Public read, admin write.
- pharmacy_duty(id, poi_id, duty_start, duty_end, source ['demo'], note, fetched_at; uq(poi_id,duty_start)). Public read.
- news_sources(id, name, site_url, feed_url uq, active, last_fetched_at, last_error, created_at): 12 rows.
- news_items(id, source_id, guid, title, summary<=280, url, published_at, title_hash, created_at; uq(source_id,guid)): EMPTY; the news agent upserts with the service role, onConflict 'source_id,guid'. Both public read.
- announcements(id, kind 'su_kesintisi'|'elektrik_kesintisi'|'belediye'|'genel', title, body, neighbourhood_ids uuid[], source_label, starts_at, ends_at, created_by, is_demo, created_at). Public reads rows with ends_at null or > now(); admin CRUD.
- listing_categories(id, type 'classified'|'job', parent_id, name, slug uq [job sectors 'is-*'], icon, sort, is_banned, attributes_schema jsonb [{key,label,type:'text'|'number'|'select'|'boolean',options?[{value,label}],required?}], created_at). Pickers: .eq('is_banned',false). Public read.
- listings(id, type, owner_id, business_id, category_id, title 3-100, description<=4000, price_try, attributes jsonb, neighbourhood_id, status 'draft'|'pending_review'|'active'|'rejected'|'expired'|'sold'|'filled'|'paused'|'deleted', rejection_reason, flags text[] ['iban','odeme','telefon','url','emlak_vasita','ayrimcilik'], expires_at, published_at, view_count, call_count, job_work_type 'tam_zamanli'|'yari_zamanli'|'vardiyali'|'stajyer'|'gunluk', job_salary_min, job_salary_max, job_salary_hidden, job_experience 'farketmez'|'0-1'|'1-3'|'3+', job_benefits text[] ['servis','yemek','sgk','prim'], job_location_label, search_norm, search_tsv, is_demo, created_at, updated_at).
  - Read: public reads status in (active, sold, filled); owner reads all own; admin all.
  - Insert (authenticated): send {type, category_id, title, description, price_try, attributes, neighbourhood_id, job_* fields, status?:'draft'}. The trigger sets owner_id and flags, then status: pending_review for the first 3 or when flagged; active if trusted_publisher or >=3 published. It also sets published_at/expires_at (+30 days). Jobs need an approved business (business_id is set automatically), else 403 hint business_required; banned category -> 400 hint banned_category.
  - Owner status transitions: active->paused; paused->active (if not expired); active|paused|expired->sold (classified) or filled (job); any->deleted; draft|rejected->pending_review (resubmit) or draft. Anything else -> 403 hint invalid_status_transition. Owner cannot change expires_at, published_at, counters, business_id or type (use renew_listing).
  - Owner hard-delete only when status is draft, rejected or pending_review.
- listing_media(id, listing_id, url, thumb_url, sort, created_at): public read if the listing is public; owner CRUD.
- favorites(user_id, target_type 'listing'|'business'|'poi', target_id, created_at; pk all three): own CRUD.
- reports(id, reporter_id?, target_type 'listing'|'business'|'review'|'user', target_id, reason 'dolandiricilik'|'yanlis_kategori'|'uygunsuz'|'yaniltici'|'diger', detail<=1000, status 'open'|'resolved'|'dismissed', admin_note, resolved_at, created_at): anon/auth insert (reporter_id null or own); admin read/update.
- contact_messages(id, user_id?, name<=80, phone<=20, message 3-2000, handled, created_at): anon/auth insert; admin read/update.
- For both anon inserts (reports, contact_messages) do NOT chain .select() (no select policy for anon).
- contact_events(id, user_id, subject_type 'listing'|'job'|'business'|'poi'|'lead', subject_id, event 'phone_reveal'|'call_click'|'directions', ip_hash, created_at): admin read; writes via RPC only.
- notifications(id, user_id, type, title, body, link, read_at, push_sent_at, created_at): own read/update/delete. push_sent_at is for the service-role push sender.
  - lead_new (link /isletme/talepler/<leadId>), lead_accepted (/talep/<code>), request_created (/talep/<code>), request_hired (/isletme/talepler/<leadId>), review_new (/isletme/yorumlar)
  - listing_approved (/ilan/<id> or /is-ilani/<id>), listing_rejected (/profil/ilanlarim or /profil/is-ilanlarim)
  - business_approved (/isletme), business_rejected (/isletme/basvuru)
  - admin only: business_application (/admin/isletmeler), request_review and request_no_match (/admin/talepler).
- push_subscriptions(id, user_id, endpoint uq, p256dh, auth, user_agent, created_at): own CRUD.
- demo_otp: no API access.

STORAGE:
- 'media': public; jpeg/png/webp/gif; <=5MB; write/delete only under `${uid}/...` (e.g. `${uid}/listings/<listingId>/1.webp`); use getPublicUrl.
- 'private-docs': private; jpeg/png/webp/pdf; <=10MB; `${uid}/...`; owner+admin read via createSignedUrl.

RPC (supabase.rpc(name,args)) — PUBLIC (anon+auth):
- nearby_pois({p_kind?:'pharmacy'|'mosque'|'bus_stop'|'place'|null, p_lat?, p_lng?, p_radius_m?=5000 (max 50000), p_limit?=50 (max 500)}) -> [{id,kind,name,slug,address,phone,lat,lng,neighbourhood_id,neighbourhood_name,details,source,license,updated_at,distance_m|null}]. Nearest first; by name when no coordinates.
- duty_pharmacies_now({p_lat?,p_lng?}) -> [{duty_id,poi_id,name,slug,address,phone,lat,lng,neighbourhood_id,neighbourhood_name,duty_start,duty_end,source,note,fetched_at,distance_m|null}]. Only windows containing now().
- duty_pharmacies_for_day({p_date:'YYYY-MM-DD',p_lat?,p_lng?}) -> same shape. Windows overlapping [date 08:30, date+1 08:30) Istanbul time and not yet ended (use for "Yarın").
- neighbourhood_for_point({p_lat,p_lng}) -> [{id,name,slug,district,method:'polygon'|'nearest'}] (0-1 rows; send rounded coordinates).
- get_demo_otp({p_phone}) -> string|null. Null when demo mode is off, the phone is an admin, or no code in the last 5 min.
- log_contact_event({p_subject_type,p_subject_id,p_event}) -> void. Call before navigating to tel:; call_click on listing/job increments call_count.
- reveal_listing_phone({p_listing_id}) -> {ok:true,phone,display_name} | {ok:false,reason:'not_found'|'rate_limited'|'login_required'|'no_phone'}. Business phone for business listings. Limits for 2. el: members 30/24h, guests 5/day per IP hash (guests over the limit get 'login_required'); jobs unlimited. CALL FROM THE BROWSER (the IP comes from x-forwarded-for).
- increment_listing_view({p_listing_id}) -> void.
- search_listings({p_type?='classified'|'job'|null, p_q?, p_category_id? (includes children), p_neighbourhood_id?, p_min_price?, p_max_price?, p_work_type?, p_sort?='newest'|'price_asc'|'price_desc'}) -> SETOF listings (active and not expired). Supports .select('id,title,...,listing_media(url,thumb_url),neighbourhoods(name)') and .range(); select explicit columns, not the search_* columns.
- global_search({p_q,p_limit?=5 (max 20)}) -> {listings:[{id,type,title,price_try,published_at,job_location_label,category_name,neighbourhood_name,thumb_url}], businesses:[{id,slug,name,category_label,logo_url,rating_avg,rating_count,verification_level,kinds,neighbourhood_name}], services:[{id,slug,name,icon,parent_id,parent_name,parent_slug}], pois:[{id,kind,slug,name,address,lat,lng,neighbourhood_name,category}]}. Empty arrays when the query is under 2 chars; Turkish-insensitive (İ/ı).
- Helpers: tr_norm(t), tr_slug(t), short_name(p_full_name), tr_match(p_norm,p_q); is_admin(), owns_business(p_business_id), owns_listing(p_listing_id), business_is_public(p_business_id) -> boolean.

RPC — AUTHENTICATED:
- renew_listing({p_listing_id}) -> {ok:true,status,expires_at} | {ok:false,reason:'not_found'|'invalid_status'}.
- submit_service_request({p_category_id (sub-category), p_answers, p_neighbourhood_id, p_address_note?, p_when_type?='esnek', p_when_date?, p_note?, p_photos?=[], p_hide_phone?=false}) -> {id, public_code, status:'open'|'admin_review'|'no_match', lead_count}.
  - Validates answers against the latest published flow and keeps only visible-step answers.
  - Error hints: login_required, account_banned, category_not_found, neighbourhood_required, invalid_when ('tarih' needs a date today..+180), invalid_answers (message lists step ids), rate_limited (5 per 24h).
  - Auto categories dispatch immediately; concierge categories notify admins.
- get_request_for_customer({p_code}) -> null (not found or not yours) | {
  request: {id, public_code, status, category:{id,name,slug,icon,parent_name,parent_slug}, neighbourhood:{id,name,district}|null, address_note, when_type, when_date, note, photos[], hide_phone, answers:[{id,title,type,value,display}], accepted_count, max_providers, sent_count, hired_business_id, created_at, closed_at},
  providers: [{lead_id, status:'accepted', offer_price_try, offer_note, accepted_at, business:{id,name,slug,logo_url,rating_avg,rating_count,verification_level,phone,category_label}}],
  review: {id,rating,comment,reply,created_at}|null }.
- customer_remove_lead({p_lead_id}) -> {ok:true} | {ok:false,reason:'not_found'|'invalid_status'}. Frees the slot; a filled request re-opens and closed_full leads return to 'seen'.
- close_request({p_code,p_hired_business_id?}) -> {ok:true,status:'closed_hired'|'closed_cancelled'} | {ok:false,reason:'not_found'|'invalid_status'|'not_accepted'}.
- submit_review({p_request_code,p_business_id,p_rating 1-5,p_comment?}) -> {ok:true,review_id} | {ok:false,reason:'not_found'|'not_hired'|'invalid_rating'}. Hired firm only; re-submitting updates; rating_avg/count recomputed.
- get_lead_detail({p_lead_id}) -> null (not your business) | {
  lead: {id,business_id,status,offer_price_try,offer_note,wave_no,seen_at,accepted_at,created_at},
  request: {id,status,category:{id,name,slug,icon,parent_name}, neighbourhood:{id,name,district,lat,lng}|null, when_type,when_date,note,photos[],answers[],accepted_count,max_providers,address_note (null until accepted),created_at},
  customer: {display_name ('Ayşe Y.' before accept, full name after), phone (only when accepted and not hide_phone), hide_phone},
  can_accept: boolean }. Marks the lead sent->seen.
- accept_lead({p_lead_id,p_offer_price?,p_offer_note? <=280}) -> {ok:true, customer_name, customer_phone|null, hide_phone, accepted_count, max_providers, already?:true} | {ok:false, reason:'full'|'closed'|'removed'|'declined'|'business_not_approved'|'not_found'}.
  - Atomic: max max_providers firms; when full the request becomes 'filled' and remaining leads 'closed_full'. Notifies the customer; logs the phone reveal.
  - Error hints: note_too_long, invalid_price.
- decline_lead({p_lead_id}) -> {ok:boolean}.
- reply_review({p_review_id,p_reply}) -> {ok:boolean}.
- apply_business({p_name, p_kinds, p_phone? (defaults to the profile phone), p_category_label?, p_description?, p_address?, p_neighbourhood_id?, p_service_category_ids?=[], p_service_area_ids?=[] (defaults to [p_neighbourhood_id]), p_working_hours?={}, p_lat?, p_lng?, p_logo_url?, p_cover_url?}) -> {ok:true,business_id,slug,status:'pending'} | {ok:false,reason:'invalid_kinds'|'invalid_phone'|'categories_required'|'already_exists',business_id?,status?}.
  - Error hints: login_required, invalid_name.
  - Re-submits a pending or rejected application; notifies admins.
- mark_notifications_read({p_ids?}) -> number of rows updated (all unread when p_ids is omitted).
- delete_my_account() -> {ok:true}. Delete the user's storage files first, then call supabase.auth.signOut().

RPC — ADMIN (others get 42501 'Yetkisiz'):
- admin_review_business({p_business_id,p_approve,p_reason?}) -> {ok,status} | {ok:false,reason:'not_found'}. Approve sets verification>=1 and notifies 'İşletmen yayında!'.
- admin_review_listing({p_listing_id,p_approve,p_reason?}) -> {ok,status}. Approve sets active, published_at and +30 days, sets trusted_publisher at >=3 published, and notifies the owner.
- dispatch_request({p_request_id,p_wave?=1,p_business_ids?}) -> {ok:true,lead_count,total_leads,fallback,status} | {ok:false,reason:'not_found'|'closed',status?}. This is "Eşleştir ve gönder"; p_business_ids hand-picks firms.
- Everything else the admin does through tables (is_admin RLS): category auto_dispatch, profile status/trusted_publisher, reports, announcements, poi.

CRON / SERVICE ONLY: expire_listings() -> int (also expires requests after 14 days); roll_demo_duty() -> int; send_sms_hook(event jsonb) (auth hook).
