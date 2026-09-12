# Gebzem veritabanı (Supabase)

Project ref `fboythglcjofakbskstg` in ap-northeast-1 (Tokyo); the Vercel functions run in hnd1 (Tokyo), so keep
`vercel.json` regions as they are. All schema lives in `supabase/migrations/` and is applied through the
Supabase Management API SQL endpoint (no local Docker / CLI needed). The scripts use Node 24's built-in `fetch`.
The API contract for the app is in `docs/contracts/db-contract.md`.

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
| `2026091100`…`2026091299` | feature modules (services push, business panel, admin core, support, analytics, news articles, ...); each file starts with a comment describing it |
| `2026091300`…`2026091304` | place corrections via `submit_contact_message` ('bilgi_duzeltme', guest throttle), `submit_report` + `report_notes`, `marketing_consent_at`, account delete privacy + audit retention, security pack (admin RPCs closed to anon, `apply_business` switch, listing caps, slim `public_profiles`) |
| `2026091305`…`2026091315` | analytics throttle (daily-salted IP hash), atomic replace RPCs, ban enforcement, TR-only SMS hook, private request photos, listing purge, versioned `legal_texts` |
| `2026091320`…`2026091335` | duty mode gate, demo cleanup v2, admin audit, `max_providers` fallback, service category admin, finance receipts, POI admin (`hidden`, `locked`) |
| `2026091340`…`2026091345` | request redispatch + `stalled_at`, push retry, global search events/news, news cron, duty import, listing attribute filters (`search_listings` `p_attrs`) |
| `2026091350`…`2026091360` | panel page views, vocabularies (`vertical_subcategories`, `amenities`, `event_categories`), POI re-sync (`last_seen_at`, `data_sync_runs`), admin site without the service role key |

Remaining Supabase advisor findings are intentional: `public_profiles` and `my_leads` are owner-privileged views
(they expose only safe columns / only the caller's own leads; invoker views would be emptied by the base tables' RLS),
the SECURITY DEFINER RPCs are the API surface, `demo_otp` deliberately has no policies, and leaked-password protection
does not apply (phone OTP only).

Every file is re-runnable (`if not exists`, `create or replace`, upserts, policies dropped and re-created). When a
migration redefines a function, it starts from the latest live body (`select pg_get_functiondef('schema.fn'::regproc)`).

```powershell
node --env-file=.env.local scripts/db/sql.mjs --all                                  # apply all, in order
node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/20260910000003_rpc.sql   # apply one
node --env-file=.env.local scripts/db/sql.mjs -e "select count(*) from poi"          # ad-hoc query
node --env-file=.env.local scripts/db/gen-types.mjs                                  # regenerate src/lib/database.types.ts
```

Regenerate the types after every schema change.

## Scheduled jobs (pg_cron, UTC)

The pg_net jobs POST to the public app (`https://gbzsehir.vercel.app`) with the Vault secret
`gebzem_push_webhook_secret`, which must equal `CRON_SECRET` on Vercel (see `2026091130_services_push_and_leads.sql`
for creating / rotating it). Without the secret they are no-ops.

| Job | Schedule | Does |
|---|---|---|
| `gebzem-expire-listings` | 00:05 | `expire_listings()` |
| `gebzem-roll-demo-duty` | 05:31 | `roll_demo_duty()`, only while `duty_data_mode = 'demo'` |
| `gebzem-analytics-retention` / `gebzem-audit-retention` | 03:17 / 03:23 | purge by `analytics_retention_days` / `audit_retention_days` |
| `gebzem-purge-listings` | 03:41 | `/api/cron/purge-listings`: listings deleted 30+ days ago and their photos |
| `gebzem-push-retry` | every 10 min | `/api/notifications/push` when an unsent notification can be retried |
| `gebzem-request-redispatch` | :13 and :43 | SQL: 14-day expiry, next waves outside 22:00-08:00 Istanbul |
| `gebzem-refresh-news` | every 20 min | `/api/cron/news` |
| `gebzem-duty-import` / `-recheck` | 05:35 / 06:10, 09:10, 15:10 | `/api/cron/duty` |
| `gebzem-duty-stale-check` | 06:15 | admin notice when `duty_data_mode = 'live'` and no real row is on duty |
| `gebzem-poi-sync` | 01:23 on the 2nd | `/api/cron/poi-sync` (KBB / OSM re-sync) |

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
- © OpenStreetMap katkıcıları (ODbL): neighbourhood boundaries, bus stops + route refs, parks, marina/ferry, taxi, ATM.
- Place descriptions (`poi.details.description`, `curated: true`) are our own text.
- Nöbetçi eczane: `app_settings.duty_data_mode` decides what is shown: `demo` (random sample list, `source = 'demo'`,
  labelled "Örnek veri"), `off` (no list, the app links to the Eczacı Odası), `live` (manual list from /admin/nobet and
  importer rows; demo rows hidden and the demo roll stops).

## Demo accounts

All demo rows carry `is_demo = true` (profiles, businesses, listings, reviews, announcements, events, finance, news
articles). Login is phone + SMS OTP. In demo mode (`app_settings.otp_demo_mode = true`, no SMS provider) the code
screen shows the OTP (`rpc get_demo_otp`) of demo numbers (+90 555 000 XXXX) and of brand-new sign-ups: a Turkish
mobile with no confirmed account that is not an admin (owner decision 2026-09-12, `2026091387_otp_signup_on_screen.sql`).
Numbers with a confirmed account and admins are refused by the hook ("this number already has an account") and their
codes are never readable. Residual prototype risks: anyone can claim a number that has no account yet, the refusal
tells whether a number has an account, and captcha is off. Every number that got a code on screen is recorded in
`private.otp_onscreen_signups` (phone, first_at; no client access); `supabase/golive/otp_golive.sql` closes those
accounts at go-live (sessions, refresh tokens and MFA factors deleted) and drops the ledger.

**Passwords: only admins keep one** (owner decision 2026-09-12). The trigger `private.auth_users_password_guard` on
`auth.users` wipes `encrypted_password` of every non-admin row on insert and update, and wipes any password at the
moment a phone gets confirmed (this blocks the pre-account takeover through `POST /auth/v1/signup {phone, password}`).
Side effects: a non-admin `updateUser({ password })` succeeds but stores nothing; a new admin created with a password
loses it on insert, so create the user, promote the profile to `admin`, confirm the phone, then set the password.
This design depends on Auth `sms_autoconfirm = false`.

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

Remove all demo data before launch: Admin > Veri (`admin_clear_demo_data`, with the `demo_admin` scope once a real
admin exists; it also removes the `media/demo/` photos and stops the demo duty roll), or
`node --env-file=.env.local scripts/db/remove-demo.mjs --yes`.

## Auth configuration

`scripts/db/auth-setup.mjs` patches the auth config: phone provider on, email signups off, 6-digit OTP valid for 300 s,
`site_url` = https://gbzsehir.vercel.app, redirect allow list (localhost, production, Vercel previews), the admin test
OTP (valid until 2027-06-30), and the **Send SMS hook as a Postgres function**:
`pg-functions://postgres/public/send_sms_hook`. The hook accepts only Turkish mobile numbers (+905XXXXXXXXX, login and
phone change) and stores the code in `public.demo_otp` (no RLS access; codes older than 1 day are deleted)
instead of sending an SMS. It issues a code only when `get_demo_otp` may show it: demo numbers (login and phone
change), and on login a brand-new sign-up while demo mode is on (`private.otp_signup_code_visible`: TR mobile, no
confirmed `auth.users` row, no admin profile; `get_demo_otp` re-checks it at read time). Everything else is refused with
an `SMS provider not configured: ...` error that the app maps to a Turkish message (`src/lib/auth/otp.ts`). Inspect the config with `node --env-file=.env.local scripts/db/auth-config.mjs get sms`.

### Switching off demo OTP (when a real SMS provider such as Netgsm or İleti Merkezi is added)

`app_settings.otp_demo_mode` is the ONE switch: `get_demo_otp` and the "Prototip modu" banner (read by the pages
through `getAppSettings()`, 60 s cache) both follow it. There is no env var for it any more (`NEXT_PUBLIC_OTP_DEMO_MODE`
was removed).

1. Deploy an HTTP Send-SMS hook (e.g. a Next.js route `/api/hooks/send-sms` verifying the `standardwebhooks`
   signature with `SEND_SMS_HOOK_SECRET`) that calls the provider's OTP API in under 2 s.
2. Point Auth at it: `hook_send_sms_uri = https://<domain>/api/hooks/send-sms`, `hook_send_sms_secrets = v1,whsec_...`
   (PATCH `/v1/projects/{ref}/config/auth`), or disable the hook and configure a built-in provider.
3. Run `supabase/golive/otp_golive.sql` (dry-run it first with `scripts/dev/sql-dryrun.mjs`): demo mode off,
   `get_demo_otp`, the demo hook and `demo_otp` dropped, the on-screen sign-ups of the ledger closed and the ledger
   dropped, non-admin passwords wiped again, never-verified sign-ups older than 1 day purged (an optional daily
   `cron.schedule` for that purge is in the file, commented out). Keep `sms_autoconfirm = false`.
4. Optionally remove the admin test OTP (`sms_test_otp = ""`).

## Account delete

`/profil/hesap-sil`: the user re-verifies the SMS code, then the server action `deleteMyAccount` calls
`delete_my_account()` with the user's session (profile, listings, favorites, notifications, events and the other
owned rows go; audit details keep only masked phones and lose names / from-to values), removes every file under
`<uid>/` in `media` and `private-docs` with the service role, and expires the public pages. Audit rows older than
`audit_retention_days` are purged nightly.

## Verification

```powershell
$env:ADMIN_OTP_FILE='<local file containing the admin test OTP>'
node --env-file=.env.local scripts/db/verify-auth.mjs   # OTP send -> get_demo_otp -> verify -> profile; admin test OTP
node --env-file=.env.local scripts/db/verify-all.mjs    # nearby/duty/search, RLS, listing moderation, services flow, atomic accept, storage
```

`verify-all.mjs` creates test requests, listings and a throwaway user, then deletes them again.
