# Gebzem veritabanı (Supabase)

Project ref `fboythglcjofakbskstg` (Tokyo). All schema lives in `supabase/migrations/` and is applied through the
Supabase Management API SQL endpoint (no local Docker / CLI needed). The scripts use Node 24's built-in `fetch`.

## Prerequisites

PowerShell, from the repo root:

```powershell
. '<path to your local secrets.ps1>'   # provides $env:SUPABASE_ACCESS_TOKEN (never commit it)
```

`.env.local` (gitignored) supplies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`.

## Migrations

| File | Contents |
|---|---|
| `20260910000001_init.sql` | extensions (postgis, pg_trgm, unaccent, pgcrypto), `private` schema, tables, indexes, triggers (profile creation, column protection, listing moderation/flags, search columns) |
| `20260910000002_rls.sql` | RLS on every table, policies, views `public_profiles`, `my_leads` |
| `20260910000003_rpc.sql` | all RPC functions + grants |
| `20260910000004_storage.sql` | buckets `media` (public, images, 5 MB) and `private-docs` (private, 10 MB) + policies |
| `20260910000005_seed_reference.sql` | app settings, listing categories (incl. banned), service categories, question flows v1 |
| `20260910000006_cron.sql` | pg_cron: `expire_listings()` daily 00:05 UTC, `roll_demo_duty()` daily 05:31 UTC (08:31 TR) |
| `20260910000007_trigger_enforcement_fix.sql` | protection triggers become SECURITY INVOKER wrappers around SECURITY DEFINER implementations, so direct API writes (role `authenticated`/`anon`) are enforced while RPCs/cron/seeds (role `postgres`) are trusted |
| `20260910000008_search_path_hygiene.sql` | pins `search_path` on the remaining helper/trigger functions (advisor lint) |

Remaining Supabase advisor findings are intentional: `public_profiles` and `my_leads` are owner-privileged views
(they expose only safe columns / only the caller's own leads; invoker views would be emptied by the base tables' RLS),
the SECURITY DEFINER RPCs are the API surface, `demo_otp` deliberately has no policies, and leaked-password protection
does not apply (phone OTP only).

Every file is re-runnable (`if not exists`, `create or replace`, upserts, policies dropped and re-created).

```powershell
node --env-file=.env.local scripts/db/sql.mjs --all                                  # apply all, in order
node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/20260910000003_rpc.sql   # apply one
node --env-file=.env.local scripts/db/sql.mjs -e "select count(*) from poi"          # ad-hoc query
node --env-file=.env.local scripts/db/gen-types.mjs                                  # regenerate src/lib/database.types.ts
```

Regenerate the types after every schema change.

## Seed scripts (idempotent, run in this order)

```powershell
node --env-file=.env.local scripts/db/seed-neighbourhoods.mjs   # 40 Gebze mahalleleri + polygons (OSM, ODbL)
node --env-file=.env.local scripts/db/seed-poi.mjs [--cache <dir>]  # pharmacies/mosques/historic (KBB CC BY) + bus stops/parks (OSM) + curated places
node --env-file=.env.local scripts/db/seed-news-sources.mjs     # verifies RSS feeds, stores the working ones
node --env-file=.env.local scripts/db/seed-demo.mjs             # demo accounts, businesses, listings, reviews, announcements
node --env-file=.env.local scripts/db/sql.mjs -e "select public.roll_demo_duty()"   # demo duty pharmacies (today..+60)
```

Data sources and licences (the /kaynaklar page should credit them):
- Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY 4.0): Eczaneler, Camiler, Tarihi Yapılar ve Müzeler (`ilce_id` 1338 = Gebze;
  pharmacies/mosques are EPSG:5254 and are transformed in PostGIS).
- © OpenStreetMap katkıcıları (ODbL): neighbourhood boundaries, bus stops + route refs, parks, marina/ferry.
- Place descriptions (`poi.details.description`, `curated: true`) are our own text.
- Nöbetçi eczane data is **demo** (`pharmacy_duty.source = 'demo'`, note "Örnek veri - gerçek nöbet listesi değildir").

## Demo accounts

All demo rows carry `is_demo = true` (profiles, businesses, listings, reviews, announcements). Login is phone + SMS OTP;
in demo mode the OTP of normal/demo accounts is shown by the login screen (`rpc get_demo_otp`).

| Phone | Role |
|---|---|
| +90 555 000 00 01 | Admin ("Yönetici"). Uses a fixed Supabase **test OTP** (ask the project lead; it is not stored in the repo). `get_demo_otp` never returns admin codes. |
| +90 555 000 00 10 | Parlak Temizlik (service + employer) |
| +90 555 000 00 11 | Usta Tesisat Gebze (service) |
| +90 555 000 00 12 | Kombi Servis 41 (service) |
| +90 555 000 00 13 | Renk Boya Dekorasyon (service) |
| +90 555 000 00 14 | Gebze Nakliyat (service + employer) |
| +90 555 000 00 15 | Anadolu Elektrik (service) |
| +90 555 000 00 16 | Kent Teknoloji (shop + employer) |
| +90 555 000 00 17 | Örnek Plastik San. ve Tic. A.Ş. (employer, GOSB) |
| +90 555 000 00 20 / 21 / 22 | Normal users Ayşe Yılmaz / Mehmet Demir / Zeynep Kaya |

`Ev Temizliği` has `auto_dispatch = true` (for testing); every other category starts in concierge mode
(admin runs `dispatch_request`, "Eşleştir ve gönder").

Remove all demo data before launch: `node --env-file=.env.local scripts/db/remove-demo.mjs --yes`.

## Auth configuration

`scripts/db/auth-setup.mjs` patches the auth config: phone provider on, email signups off, 6-digit OTP valid for 300 s,
`site_url` = https://gbzsehir.vercel.app, redirect allow list (localhost, production, Vercel previews), the admin test
OTP (valid until 2027-06-30), and the **Send SMS hook as a Postgres function**:
`pg-functions://postgres/public/send_sms_hook`. The hook stores the code in `public.demo_otp` (no RLS access; codes older than 1 day are deleted)
instead of sending an SMS. Inspect the config with `node --env-file=.env.local scripts/db/auth-config.mjs get sms`.

### Switching off demo OTP (when a real SMS provider such as Netgsm or İleti Merkezi is added)

1. Deploy an HTTP Send-SMS hook (e.g. a Next.js route `/api/hooks/send-sms` verifying the `standardwebhooks`
   signature with `SEND_SMS_HOOK_SECRET`) that calls the provider's OTP API in under 2 s.
2. Point Auth at it: `hook_send_sms_uri = https://<domain>/api/hooks/send-sms`, `hook_send_sms_secrets = v1,whsec_...`
   (PATCH `/v1/projects/{ref}/config/auth`), or disable the hook and configure a built-in provider.
3. `update public.app_settings set value = 'false' where key = 'otp_demo_mode';` so `get_demo_otp` returns null,
   and set `NEXT_PUBLIC_OTP_DEMO_MODE=false` / `OTP_DEMO_MODE=false` in Vercel so the "Prototip modu" banner disappears.
4. Optionally `truncate public.demo_otp;` and remove the admin test OTP (`sms_test_otp = ""`).

## Verification

```powershell
$env:ADMIN_OTP_FILE='<local file containing the admin test OTP>'
node --env-file=.env.local scripts/db/verify-auth.mjs   # OTP send -> get_demo_otp -> verify -> profile; admin test OTP
node --env-file=.env.local scripts/db/verify-all.mjs    # nearby/duty/search, RLS, listing moderation, services flow, atomic accept, storage
```

`verify-all.mjs` creates test requests, listings and a throwaway user, then deletes them again.
