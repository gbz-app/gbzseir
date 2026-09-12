@AGENTS.md

# Gebzem — Proje el kitabı (Claude Code için)

Bu dosya her Claude Code oturumunun başında okunur. Amacı: eski sohbet olmadan yeni bir oturumun projeyi tek başına, kurallara
uygun ve güvenli şekilde sürdürebilmesi. Son güncelleme: 12 Eylül 2026. Gizli değer içermez: token, anahtar, şifre, OTP kodu ve
gerçek kullanıcı telefonu hiçbir yerde yazılı değildir. Demo numaralar (+90 555 000 xx xx) ve ortam değişkeni ADLARI yazılabilir.

Ayrıntılı kaynaklar (bu dosya onların özetidir; çelişki görürsen kodu ve canlı veritabanını esas al):

| Belge | İçerik |
|---|---|
| `OTURUM.md` (repo kökü) | 10-12 Eylül oturumunun A'dan Z'ye günlüğü: aşamalar, kararlar, hatalar ve dersler, dış servis kurulumları, commit dizini |
| `docs/PROJE-DURUMU.md` | Güncel durum, canlı adresler, dış servisler, onay bekleyenler, sıradaki işler |
| `docs/MIMARI-AGAC.md` | Kod ağacı (rotalar, modüller), tablolar, RPC'ler, trigger'lar, cron'lar, akışlar, env adları |
| `docs/SOHBET-KAYDI.md` | Sahibin bütün mesajları birebir + Claude'un yanıtları (UTC saat; gizli değerler maskeli) |
| `docs/DEGISIKLIK-GECMISI.md` | Bütün commit'ler eskiden yeniye, mesajları ve dosya sayılarıyla |
| `supabase/README.md` | DB iş akışı, cron tablosu, seed sırası, demo hesaplar, auth ayarı, OTP'yi canlıya alma |
| `docs/contracts/db-contract.md`, `docs/contracts/app-contract.md` | Tablo/RPC ve uygulama iskeleti sözleşmeleri |
| `docs/mimari-plan.md` | 10 Eylül'deki ilk plan (React Native + Expo önerisi). Tarihçe; asıl yapı farklı |

Not: günlük eskiden `docs/OTURUM-GUNLUGU.md` idi, repo köküne `OTURUM.md` olarak taşındı. Eski belgelerde geçen o yol artık `OTURUM.md`'dir.

Bilinen bayat yerler (doğrulanmadı, kodu esas al): `MIMARI-AGAC.md` SW'yi v4, `scripts/dev/`'i "yok" ve `CITY`'yi "sorun" gösteriyor
(gerçekte v5, klasör var). `supabase/README.md` "yalnız Ev Temizliği `auto_dispatch`, diğerleri concierge" diyor; `2026091365`'ten beri
hepsi otomatik. `OTURUM.md`'de demo doktor sayısı çelişkili (Aşama 16 "14 demo doktor", 8.1 "tek dahiliye doktoru").

### Altın kurallar (ayrıntı bölüm 10, 11, 17)
1. Gizli değer (token, anahtar, şifre, OTP, gerçek telefon, `.env.local` içeriği) asla dosyaya, commit'e, sohbete, çıktıya yazılmaz.
2. Başka projelere dokunma (bölüm 9.2). gcloud her zaman `--configuration=gbzsehir --project=gbzsehir-rehber`.
3. Uygulamadan admin'e link yok; admin kodunda `createAdminClient()` yok; admin projesine service-role anahtarı yok.
4. Gerçek kullanıcıyı etkileyen canlı DB yazmasında sahibe sor. Migration önce `sql-dryrun`; `CREATE OR REPLACE` öncesi canlı tanımı oku.
5. Tasarım: gölge/kenarlık yok, lavanta zemin + beyaz kart, Lucide, emoji yok, mor tema, siyah ana düğme, 390px, yatay kaydırma yok.
6. "bekle" denince dur (araç çağırma); soru sorulduysa önce cevapla; yalnız isteneni yap.
7. Her adım: tsc → eslint → build → 390px ekran → gizli tarama → yalnız ilgili dosyalarla commit → push → deploy kontrolü → kısa Türkçe özet.

---

## 1. Proje özeti

| Konu | Bilgi |
|---|---|
| Ürün | **Gebzem**: Kocaeli şehir rehberi + yerel pazar yeri (PWA). Önce Gebze için başladı, 11 Eylül'de kapsam bütün Kocaeli oldu; ad "Gebzem" kaldı |
| Kapsam | Kocaeli'nin 12 ilçesi: İzmit, Gebze, Darıca, Çayırova, Dilovası, Körfez, Derince, Kartepe, Başiskele, Gölcük, Karamürsel, Kandıra. **Mahalle yok** (konum = ilçe + adres + harita pini) |
| Kim için | Kocaeli'de yaşayanlar (nöbetçi eczane, yakınımda, rehber, ilan, hizmet talebi, etkinlik) ve yerel işletmeler (işletme sayfası, QR menü, oda, doktor, talepler) |
| Sahip | Mikail, Akse Digital ajansı. Kodu Claude yazar, sahip her adımı telefonunda canlı sitede dener |
| Canlı uygulama | https://gbzsehir.vercel.app (Vercel projesi `gbzsehir`) |
| Admin (ayrı site) | https://gbzsehir-admin.vercel.app/admin (Vercel projesi `gbzsehir-admin`, aynı repo, `NEXT_PUBLIC_APP_MODE=admin`). Telefon + şifre ile giriş |
| Repo | GitHub `gbz-app/gbzseir` (dikkat: "gbzseir"), dal `main`. `main`'e push = iki Vercel projesinde otomatik deploy |
| Veritabanı | Supabase proje ref `fboythglcjofakbskstg`, bölge ap-northeast-1 (Tokyo). Vercel fonksiyonları `hnd1` (Tokyo) |
| Son kod commit'i | `1574a19` (12.09 01:52, Kocaeli faz B + GebzemAI araçları). Sonrasında yalnız belge commit'leri (`d4866f5`, `67d3427`); ağaçta commit edilmemiş OTP kodu + `2026091387` var (bölüm 2) |
| Sonraki büyük hedef | PWA prototipi bitince **Flutter + Go** ile sıfırdan native uygulama (sahibin sunucusu, PostgreSQL + PostGIS, medya Cloudflare, Supabase yok). Bu PWA onun şartnamesi |

Uygulama içi mesajlaşma **yok**: iletişim yalnız telefonla (detay sayfalarında büyük siyah "Ara" düğmesi).

---

## 2. Hızlı başlangıç: yeni oturumda ilk 10 dakika

1. **Oku:** bu dosya → `AGENTS.md` (bu Next.js sürümü farklı; kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili
   rehber) → `docs/PROJE-DURUMU.md` → gerekirse `OTURUM.md` (bölüm 3 kararlar, 4 hatalar, 8 açık işler), `docs/MIMARI-AGAC.md`,
   `docs/SOHBET-KAYDI.md` (sahibin birebir sözü lazımsa), `docs/DEGISIKLIK-GECMISI.md`, `supabase/README.md`.
2. **Durum:**
   ```bash
   git status -sb
   git log --oneline -8
   ```
   Commit edilmemiş iş varsa önce onu bitir: tsc → eslint → build → 390px test → gizli tarama → yalnız ilgili dosyalarla commit →
   push → deploy kontrolü (bölüm 12). 12 Eylül itibarıyla ağaçta commit edilmemiş iş var:
   - Belgeler: `docs/OTURUM-GUNLUGU.md` → `OTURUM.md` taşıması, `DEGISIKLIK-GECMISI`, `PROJE-DURUMU`, `SOHBET-KAYDI`, `supabase/README.md`.
   - Yeni kayıt OTP'si kodu: `src/lib/auth/otp.ts`, `src/components/auth/demo-otp-banner.tsx`, `otp-form.tsx`,
     `src/features/auth/login-screen.tsx`, `verify-screen.tsx` + git dışı (untracked) `supabase/migrations/2026091387_otp_signup_on_screen.sql` (bölüm 6.1).
   - Ayrıca `src/components/layout/top-bar.tsx`, `src/features/home/components/home-hero.tsx`, `home-search.tsx`,
     `src/features/weather/components/weather-sheet.tsx` değişmiş.
   Kendi işin olmayan değişikliği commit etmeden önce sahibe durumu sor; `2026091387`'nin canlıda olup olmadığını önce kontrol et.
3. **Gizli değerler nerede:**
   - Uygulama anahtarları: `.env.local` (git dışı, makinede duruyor) ve Vercel ortam değişkenleri. İçeriğini asla yazdırma; gerekirse
     yalnız adları listele.
   - Yönetim erişimleri (Supabase access token → `SUPABASE_ACCESS_TOKEN`, Vercel token → `VERCEL_TOKEN` + `VERCEL_ORG_ID`, GitHub
     erişimi) repoda **yok**. Önceki oturumda scratchpad'deki `secrets.ps1`'deydi ve oturumla kayboldu.
   - Sahibin sabit test OTP kodu ve admin şifresi hiçbir dosyada yok (sahipte / Supabase panelinde).
4. **Sahipten iste** (değerleri sohbete yazdırmadan; tercihen kendisi yerel `secrets.ps1` ya da `.env.local`'e koysun):
   Supabase access token, Vercel token + ekip id, GitHub erişimi. `.env.local` yoksa onu da iste.
5. **Canlıyı yokla:** https://gbzsehir.vercel.app 200; https://gbzsehir.vercel.app/admin → admin sitesine 307;
   https://gbzsehir-admin.vercel.app/admin misafire giriş formu. İki Vercel projesinin son deploy'u READY mi.
6. **Onay bekleyenleri tek listede sor** (bölüm 16.1): migration `2026091386` ve `2026091387`, GebzemAI'yi açma, yasal taslaklar, SMS sağlayıcı,
   nöbet kaynağı, anahtar yenileme/limitler, admin şifresi değişti mi.

---

## 3. Teknoloji yığını ve mimari

| Katman | Seçim |
|---|---|
| Framework | Next.js **16.3.4** (App Router, Turbopack), React 19.2.8, TypeScript 5. Tek uygulama, monorepo değil |
| UI | Tailwind CSS v4 (`@tailwindcss/postcss`) + shadcn/ui (`components.json`), Lucide ikonlar, Google Sans; sonner, vaul, cmdk, embla, react-hook-form + zod v4, qrcode |
| Veri | Supabase: Postgres + PostGIS, pg_trgm, unaccent, pgcrypto, pg_cron, pg_net, Vault. Her tabloda RLS |
| Barındırma | Vercel, iki proje, `vercel.json`: `regions: ["hnd1"]`, `crons: []` (bütün zamanlanmış işler pg_cron'da) |
| Harita | Google Maps JavaScript API her yerde (MapLibre/OpenFreeMap 11 Eylül'de kaldırıldı; `maplibre-gl`, `react-map-gl` paketleri `package.json`'da duruyor ama kullanılmıyor) |
| Medya | Cloudflare R2 (presigned PUT, `src/lib/media/*`): ilan fotoğrafı/videosu/kapak. Diğer görseller Supabase Storage `media` bucket'ı |
| Push | Web Push (VAPID, `web-push`), DB trigger + pg_net → `/api/notifications/push` |
| AI | GebzemAI: OpenAI (Chat Completions + Responses `web_search`) ve Anthropic desteği, SDK'sız fetch. Canlı: `ai_provider=openai`, `ai_model=gpt-5.4-mini`, `ai_enabled=false` |
| Diğer | Open-Meteo (hava), AlAdhan (namaz vakitleri), Wikimedia Commons (CC fotoğraf), Cloudflare Turnstile (hazır, anahtar yok) |

### 3.1 Next.js 16 notları
- Middleware yok; **`src/proxy.ts`** (Next 16 Proxy) var. Görevleri:
  - Public sitede `/admin/*` → admin sitesine 307 (yol ve sorgu korunur; hedef `ADMIN_SITE_URL`, `src/config/app-mode.ts`).
  - Admin sitesinde yalnız `/admin` ve `/giris*`; başka her yol `/admin`'e yönlenir.
  - Admin sitesinde girişsiz `/admin/*` → aynı adreste `/giris/yonetim` (rewrite; telefon + şifre formu).
  - Supabase oturum çerezini yeniler (`src/lib/supabase/proxy.ts` `updateSession`). Yetki kontrolü layout/sayfa/route + RLS'te.
- Typed routes: yeni rotada `PageProps` build'den önce tanınmayabilir; özel Props tipi kullan. Silinen rota yüzünden tsc kırılırsa
  `.next/types`'ı silip `npx next typegen`.
- ISR önbelleği: ana sayfa HTML'i önbellekte; paylaşılan layout'a yola bağlı yapı koyma (hydration #418 dersi, bölüm 15).
- `next.config.ts`: güvenlik başlıkları, zorunlu CSP (`object-src 'none'; base-uri 'self'; frame-ancestors 'self'`) + report-only
  CSP (Supabase, R2, Google Maps, Marsgate sinema afişleri, Turnstile, Open-Meteo), `images.remotePatterns` (Supabase public
  storage + `pub-*.r2.dev`), admin modunda `X-Robots-Tag: noindex, nofollow`, `/sw.js` önbelleksiz.

### 3.2 İki Vercel projesi, tek kod
- `src/config/app-mode.ts`: `IS_ADMIN_SITE = NEXT_PUBLIC_APP_MODE === "admin"`, `ADMIN_SITE_URL`, `publicUrl()`.
- **Public (`gbzsehir`):** uygulama + `/api/*`. `SUPABASE_SERVICE_ROLE_KEY` yalnız burada (cron, push, talep fotoğrafı, AI kullanım
  kaydı, medya silme, haber kaydı).
- **Admin (`gbzsehir-admin`):** yalnız `/admin` ve `/giris`. **Service-role anahtarı bilerek yok.** Sayfalar admin'in kendi oturumuyla
  okur; Server Action'lar `withAdmin()` (`src/features/admin/server/guard.ts`) ile çalışır; yazmalar `assert_admin`'li SECURITY DEFINER
  RPC'lerle ya da "admin write" RLS politikalı tablolara gider. Service role gereken işler pg_net ile public `/api/cron/*`'a kuyruklanır.
- Admin değişikliğinden sonra `revalidatePublic({tags, paths})` (`src/lib/revalidate-public.ts`) public sitenin `/api/revalidate`'ine
  `x-revalidate-secret` (= `REVALIDATE_SECRET`, iki projede aynı) ile POST atar; ulaşılamazsa admin'de "bir saate kadar geç
  görünebilir" uyarısı çıkar.
- Admin sitesinde service worker, analitik ve onboarding yok; manifest "Gebzem Yönetim"; robots noindex.

### 3.3 Supabase deseni
- **RLS her tabloda açık**, `USING(true)` yazma politikası yok. İş kuralları SECURITY DEFINER RPC'lerde ve guard trigger'larda.
- **Guard trigger deseni** (`20260910000007_trigger_enforcement_fix.sql`): tabloya bağlı SECURITY INVOKER trigger, gerçek
  `current_user`'ı SECURITY DEFINER `private.*_impl`'e iletir. PostgREST yazımları (`authenticated`/`anon`) denetlenir; RPC, cron ve
  seed (`postgres`/`service_role`) güvenilir.
- `private` şeması API'den erişilemez; her yeni private fonksiyona tek tek `revoke all ... from public, anon, authenticated`.
- **pg_cron + pg_net:** pg_net işleri `https://gbzsehir.vercel.app/api/cron/*` ve `/api/notifications/push`'a Vault sırrı
  `gebzem_push_webhook_secret` ile gider (`x-cron-secret`, push için `x-push-secret`); değer Vercel `CRON_SECRET` ile aynı olmalı.
- **PostgREST tuzağı:** iki FK yolu olan tablolarda embed belirsizleşir (`PGRST201`). FK ipucu yaz, ör.
  `neighbourhoods!businesses_neighbourhood_id_fkey(name)`.

---

## 4. Klasör haritası

```
gbzsehir/
|-- CLAUDE.md, AGENTS.md, OTURUM.md       # bu el kitabı, Next 16 uyarısı, oturum günlüğü
|-- README.md                             # repo tanıtımı
|-- src/
|   |-- proxy.ts                          # Next 16 Proxy (admin yönlendirme, admin allowlist, oturum yenileme)
|   |-- app/
|   |   |-- (auth)/giris/                 # telefon -> kod (dogrula) -> profil; yonetim (admin şifre girişi), yetki
|   |   |-- (main)/                       # public kabuk + alt menü: ana sayfa, ara, yakinimda, nobetci-eczane, eczane, cami,
|   |   |                                 #   durak, gezilecek-yerler, rehber, kurum, acil-durum, ilanlar, is-ilanlari, ilan,
|   |   |                                 #   is-ilani, ilan-ver, hizmetler, hizmet-talebi, talep, firmalar, firma, kesfet/[tur],
|   |   |                                 #   menu, doktor, sinema, etkinlikler, etkinlik, etkinlik-olustur, haberler, duyurular,
|   |   |                                 #   gebzemai, yardim, kaynaklar, yasal, profil/*, isletme/*
|   |   |-- admin/                        # yalnız admin sitesinde (layout = admin guard)
|   |   `-- api/                          # yalnız public: cron/{cinema,duty,news,poi-sync,purge-listings}, notifications/push,
|   |                                     #   gebzemai, media/{upload-url,delete}, talep-foto, revalidate, hava
|   |-- features/                         # modüller: admin, ai, auth, business, cinema, content, events, guide, home, legal,
|   |                                     #   listings, nearby, onboarding, profile, search, services, support, weather
|   |-- components/                       # layout (bottom-nav, nav-config, top-bar, no-zoom), shared (district-picker,
|   |                                     #   detail-hero, bottom-dock, report-sheet ...), wizard, auth, admin, pwa
|   |                                     #   (orientation-guard, service-worker-registrar, install-prompt), maps, providers,
|   |                                     #   seo, theme, ui (shadcn)
|   |-- lib/                              # supabase/{client,server,proxy,admin}, auth/{server,otp}, app-settings, media/*,
|   |                                     #   maps/google, push/client, revalidate-public, location/store, database.types.ts
|   |-- config/                           # site.ts (APP_NAME, CITY, BRAND_COLORS, STORAGE_KEYS), app-mode.ts, districts.ts,
|   |                                     #   sitemap-extra.ts
|   `-- core/                             # saf TS (native'e taşınabilir): routes (safeNextPath), phone, tr, duty, flow, geo,
|                                         #   format, name, time
|-- supabase/
|   |-- migrations/                       # 77 dosya, 20260910000001 ... 2026091387 (2026091387 henüz commit edilmedi)
|   |-- golive/otp_golive.sql             # OTP'yi canlıya alma; migration DEĞİL, UYGULANMADI
|   |-- seed/                             # yalnız README.md (seed'ler scripts/db/seed-*.mjs)
|   `-- README.md
|-- scripts/
|   |-- db/                               # sql, gen-types, lib, auth-*, seed-*, import-*, verify-*, apply-place-photos,
|   |                                     #   remove-demo, refresh-demo-dates, taxi-phones.sql
|   |-- dev/                              # cdp-steps, cdp-auth-shot, deploy-wait, sql-dryrun, sqlq, vercel-env-*, hydration-*
|   `-- generate-icons.mjs                # Lucide'dan PWA ikonları
|-- public/                               # sw.js (elle yazılmış, VERSION "v5-2026-09-11"), icons/, images/home/
|-- docs/                                 # PROJE-DURUMU, MIMARI-AGAC, SOHBET-KAYDI, DEGISIKLIK-GECMISI, mimari-plan, contracts/
|-- kocaeli/                              # sahibin KBB açık verisi + GTFS + _arastirma/ (GIT DIŞI)
`-- next.config.ts, vercel.json, components.json, eslint.config.mjs, tsconfig.json
```

| Klasör | Görevi |
|---|---|
| `src/app/(main)` | Public sayfalar. Çoğu rotada ilk boyamayı taklit eden `loading.tsx` iskeleti var (header titremesi dersi) |
| `src/app/admin` | analitik, ayarlar, denetim, destek, duyurular, etkinlikler, gebzemai, haber-yazilari, haberler, hesap, hizmet-kategorileri, ilan-kategorileri, ilanlar, isletmeler, kullanicilar, muhasebe, nobet, rehber, sikayetler, sozlukler, talepler, veri, yerler |
| `src/features/*` | İş mantığı: `lib/` (saf), `server/` (sunucu okumaları), `components/`, `actions.ts` (Server Actions) |
| `src/lib/supabase/admin.ts` | `createAdminClient()` (service role, RLS'i atlar). **Yalnız public uygulamanın sunucu kodu**; admin kodunda asla |
| `src/lib/database.types.ts` | `scripts/db/gen-types.mjs` üretir; elle düzenleme |
| `src/core/routes.ts` | Tek URL ağacı (`routes.*`), `safeNextPath` (open redirect koruması) |
| `public/sw.js` | Navigasyon network-first → önbellek → `/offline`. `/api`, `/auth`, `/giris`, `/admin`, `/profil`, `/isletme`, `/talep`, `/ilan-ver`, `/hizmet-talebi`, `/yardim` asla önbelleğe alınmaz. Statik cache-first, görseller SWR (150 LRU); `X-SW-Cache: no` başlığı sayfayı önbellek dışı tutar; çıkışta `CLEAR_PAGES`; güncelleme `SKIP_WAITING` ile kullanıcı onaylı ("Yeni sürüm hazır - Yenile"); push tıklaması yalnız aynı origin'i açar. Dosya değişince `VERSION`'ı artır |

### 4.1 Ortak yardımcılar (yeni kod yazmadan önce bunları kullan)
- `src/lib/db-contract.ts`: tablo ve RPC adları tek yerde; yeni ad buraya eklenir.
- `src/lib/server/cron-auth.ts` `isCronAuthorized()`: her yeni `/api/cron/*` rotası bununla korunur (`x-cron-secret`/Bearer, timing-safe).
- `src/lib/images.ts` (tarayıcıda küçültme + EXIF temizleme), `src/lib/contact.ts` (`log_contact_event`), `src/lib/notify.ts` (sonner toast'ları, tek tip).
- `src/lib/app-settings.ts` `getAppSettings()`: 60 sn önbellek; `ai_*` ayarları önbelleksiz okunur (`src/features/ai/server/config.ts`).
- `src/components/wizard/*`: ortak sihirbaz, taslak `localStorage` `gebzem.draft.<key>`. `src/components/layout/nav-visibility.tsx`
  `<HideBottomNav/>`: tam ekran akışta alt menüyü gizler. `src/components/shared/auth-gate.tsx`: giriş iste, `?next` ile geri dön.
- Diğer shared: `form-screen`, `image-uploader`, `call-button`, `reveal-phone-button`, `empty-state`, `data-source-note`.
- `src/config/sitemap-extra.ts`: modül sitemap kaynakları. shadcn stili `radix-nova` (`components.json`).
- **Aynalar (birlikte güncellenir):** `features/listings/text-guard.ts` ↔ `private.listing_flags`; `features/ai/lib/models.ts` ↔ SQL model
  allowlist; `features/business/lib/verticals.ts` ↔ sözlük tabloları; `features/guide/lib/constants.ts` ↔ `institution_categories`.
- GebzemAI limitleri (`features/ai/lib/types.ts`): girdi 1.500 karakter; geçmiş 10 mesaj / 12.000 karakter; 12 kart; tur 50 sn.

---

## 5. Veritabanı

### 5.1 Temel tablolar (public şema, ~65 tablo)
| Grup | Tablolar |
|---|---|
| Kullanıcı | `profiles` (role admin/user, status active/restricted/banned, `extra_business_slots`, `kvkk_version`, `district_id`, `is_demo`), `app_settings` (key/jsonb), `demo_otp` (politika yok), `push_subscriptions`, `notifications`, `favorites`, `legal_texts` |
| İlçe | `districts` (12 ilçe; sınırlar `private.district_boundaries`), eski `neighbourhoods` (faz C'ye kadar duruyor) |
| İşletme | `businesses` (vertical, status, vacation, slug, konum), `business_photos`, `business_documents`, `business_service_categories`, `business_service_areas`, `business_service_districts`, `business_services`, `business_menu_sections`, `business_menu_items`, `business_rooms`, `business_staff` (doktorlar), `doctor_branches`, `reviews`, `vertical_subcategories`, `amenities` |
| Hizmet | `service_categories` (`auto_dispatch`, `max_providers`), `question_flows`, `service_requests`, `leads` |
| İlan | `listing_categories`, `listings`, `listing_media`, `listing_videos`, `listing_daily_stats`, `media_trash` |
| Etkinlik | `events`, `event_categories` |
| Şehir | `poi` (10 tür: pharmacy, mosque, bus_stop, place, taxi, atm, institution, fuel, ev_charge, bank), `pharmacy_duty`, `duty_import_runs`, `data_sync_runs`, `place_categories`, `institution_categories`, `transit_routes`, `transit_route_stops` |
| İçerik | `news_articles` (kendi haberlerimiz), `news_sources`, `news_items`, `news_categories`, `announcements`, `cinema_films`, `cinema_showtimes`, `cinema_import_runs` (`2026091383_cinema.sql`) |
| Destek | `contact_messages`, `support_notes` (yalnız admin), `reports`, `report_notes` (yalnız admin), `contact_events` |
| Admin/analitik | `analytics_sessions`, `analytics_page_views`, `app_installs`, `store_stats`, `audit_log`, `finance_categories`, `finance_entries`, `search_terms_daily` |
| Private | `ai_usage`, `ai_usage_daily`, `ai_turns`, `media_uploads`, `search_term_marks`, `listing_stat_marks`, `listing_view_marks`, `district_boundaries`, `neighbourhood_boundaries` |

- View'lar: `public_profiles` (güvenli kolonlar), `my_leads`. `events.contact_phone` API'den okunamaz. `reviews`: kullanıcı başına işletme başına bir.
- `events.venue_business_id` ve `reviewed_by` PGRST201 yüzünden **bilerek FK'siz**; FK ekleme.

### 5.2 Önemli RPC'ler
- **Auth/profil:** `send_sms_hook` (Auth hook), `get_demo_otp`, `delete_my_account`, `is_admin`, `mark_notifications_read`, `mark_all_notifications_read`.
- **İşletme:** `apply_business` (işletme yalnız bununla açılır), `my_business_quota`, `business_panel_stats`, `set_business_photos`,
  `set_business_service_scope`, `submit_business_review`, `delete_my_business_review`, `reply_review`.
- **Hizmet:** `submit_service_request`, `dispatch_request`, `accept_lead`, `decline_lead`, `close_request`, `customer_remove_lead`,
  `get_request_for_customer`, `get_lead_detail`, `service_provider_counts`.
- **İlan/medya:** `search_listings(p_attrs)`, `renew_listing`, `reveal_listing_phone`, `set_listing_media`, `set_listing_video`,
  `reserve_media_upload`, `listing_owner_stats`, `log_listing_share`.
- **Şehir/arama:** `global_search` (invoker), `nearby_pois`, `popular_searches`, `popular_places`, `log_search`, `district_for_point`,
  `poi_sync_apply` (service role), `duty_import_record`, `roll_demo_duty`.
- **Etkinlik:** `reveal_event_phone`. **Push:** `claim_push_notifications` (service role, SKIP LOCKED + 5 dk lease).
- **GebzemAI:** `ai_begin_turn` (limit + bütçe + rezervasyon), `ai_finish_turn` (service role), `ai_status`.
- **Admin (hepsi `assert_admin`, anon'a kapalı):** `admin_dashboard`, `admin_online_now`, `admin_analytics`, `admin_user_overview`,
  `admin_set_user_status`, `admin_grant_business_slot`, `admin_set_business_vertical`, `admin_review_listing`, `admin_review_event`,
  `admin_remove_listing_video`, `admin_request_candidates`, `admin_save_service_category`, `admin_delete_service_category`,
  `admin_publish_flow`, `admin_set_duty`, `admin_poi_sync_now`, `admin_news_sources`, `admin_refresh_news_now`, `admin_data_health`,
  `admin_clear_demo_data`, `admin_audit_log`, `admin_finance_summary`, `admin_ai_usage`, `admin_set_ai_settings`, `admin_review_business`,
  `admin_event_contacts`.
- **Diğer:** `submit_report`, `submit_contact_message`, `log_contact_event`, `track_heartbeat`, `track_page_view`, `track_install`,
  `increment_listing_view`, `expire_listings`, `news_record_fetch`, `my_lead_extras`, `get_request_photo_paths`.
- **Private yardımcılar (yeniden yazma, kullan):** `notify`, `notify_admins`, `assert_admin`, `is_banned`, `match_candidates`,
  `redispatch_requests`, `is_quiet_hours`, `initial_listing_status`, `listing_flags`, `bump_listing_stat`, `own_media_url`,
  `media_public_base`, `app_setting_int`, `request_ip_hash`, `storage_upload_quota_ok`, `tr_label` (denetim etiketleri Türkçe),
  `phone_digits`, `is_demo_otp_phone`, `otp_signup_code_visible` (`2026091387`).

### 5.3 Guard trigger'ları (özet)
- `profiles_protect`: kullanıcı kendi role/status/`extra_business_slots` kolonlarını değiştiremez; `profiles_no_self_demote` (admin kendini düşüremez).
- `businesses_before_write`: korunan kolonlar + **tür kilidi** (yalnız `admin_set_business_vertical`); `businesses_vacation`.
- `listings_before_insert/update`: ilk N ilan moderasyonu, yasaklı içerik bayrakları, günlük/aktif ilan sınırı, iş ilanı için onaylı işletme.
- `events_before_write` (limitler, kapak yalnız kendi klasöründen, https bilet linki, işletme etkinliğinde telefon hep işletmenin kendi
  telefonu), `events_review_queue` (kullanıcı düzenlemesi incelemeye döner). Etkinlik reddi kalıcıdır (`admin_hidden`).
- `poi_before_write` (kilitli satır admin alanlarını korur), `vocabulary_guard` (6 sözlükte anahtar değişmez, kullanılan satır silinemez),
  `doctor_branch_guard`, `legal_texts_guard` (yayınlanan sürüm donuk).
- `push_subscriptions_cap` (10 abonelik, izinli push servisleri), `push_subscriptions_flush` (park edilmiş push), `notifications_push_webhook`.
- `zz_fill_district` / `zz_fill_districts`: pin'den ilçe doldurur (`2026091380`). `audit_*` trigger'ları `audit_log`'a yazar.

### 5.4 Önemli `app_settings` anahtarları
| Anahtar | Canlı değer / anlam |
|---|---|
| `otp_demo_mode` | `true`: demo OTP banner'ı + `get_demo_otp`. Tek anahtar; env yok |
| `duty_data_mode` | `"demo"` (örnek liste), `off` (liste yok, Eczacı Odası linki), `live` (elle + import; gerçek import yokken liste boşalır) |
| `feature_business_applications` | `true` (yeni işletme açma açık; `src/config/site.ts` `FEATURES.businessApplications=false` yalnız DB okunamazsa yedek) |
| `business_max_per_owner` | `1` (admin `extra_business_slots` verebilir) |
| `request_review_minutes`, `request_redispatch_hours`, `max_providers_default` | 5 dk (concierge talebin otomatik dağıtıma kadar beklemesi; canlı; migration varsayılanı 30, aralık 5-1440), 6 saat, 5 firma (aralık 1-10) |
| `listing_days`, `first_listings_moderated`, `listing_daily_cap`, `listing_active_cap` | 30, 3, 10, 50 |
| `media_public_base` | R2 public adresi; `NEXT_PUBLIC_MEDIA_BASE_URL` ile aynı olmalı, yoksa yüklemeler Supabase'e düşer ve video kapanır |
| `ai_enabled`, `ai_provider`, `ai_model`, `ai_daily_messages`, `ai_per_minute`, `ai_daily_budget_usd` | `false`, `openai`, `gpt-5.4-mini`, 20, 5, 5 USD |
| `support_phone`, `support_email` | Yer tutucu; uygulama "ayarlanmamış" sayar. Canlıdan önce gerçek değer girilmeli |
| `emergency_numbers`, `maintenance_banner`, `popular_searches`, `analytics_retention_days` (180), `audit_retention_days` (730) | |

### 5.5 Cron işleri (UTC; TR = UTC+3)
`gebzem-expire-listings` 00:05 · `gebzem-ai-cleanup` 00:20 · `gebzem-poi-sync` ayın 2'si 01:23 · `gebzem-analytics-retention` 03:17 ·
`gebzem-cinema-refresh` 03:20 ve 12:20 · `gebzem-audit-retention` 03:23 · `gebzem-listing-stat-marks` 03:29 · `gebzem-purge-listings` 03:41 ·
`gebzem-roll-demo-duty` 05:31 (yalnız demo modunda) · `gebzem-duty-import` 05:35 · `gebzem-duty-import-recheck` 06:10/09:10/15:10 ·
`gebzem-duty-stale-check` 06:15 · `gebzem-end-vacations` 21:01 · `gebzem-push-retry` 10 dakikada bir · `gebzem-refresh-news` 20 dakikada bir ·
`gebzem-request-redispatch` :13 ve :43.

### 5.6 Storage
- `media` (public, 5 MB, yalnız jpeg/png/webp/gif): kullanıcı `<uid>/...`, admin `admin/...`, demo `demo/...`.
- `private-docs` (private, 10 MB, görsel + pdf): işletme belgeleri, talep fotoğrafları `<uid>/requests/` (`/api/talep-foto` imzalı adres), muhasebe fişleri `finance/`.
- R2 bucket `gbzsehir-media`: anahtar deseni `<uid>/listings/<yyyy>/<uuid>.<ext>`; kota `reserve_media_upload` (günde 100 dosya, 10 video, 1 GiB).

### 5.7 Migration listesi ve durumu
Önekler sıralama içindir, gerçek tarih değildir. **77 dosya: ilk 75'i canlıda; `2026091386` onay bekliyor; `2026091387`'nin canlı
durumu doğrulanmadı** (kontrol: `sql.mjs -e "select pg_get_functiondef('public.send_sms_hook'::regproc)"` içinde `otp_signup_code_visible` geçiyor mu).

| Dosyalar | İçerik | Durum |
|---|---|---|
| `20260910000001_init` … `000006_cron` | eklentiler, çekirdek tablolar, RLS, temel RPC'ler, storage, referans seed, ilk cron'lar | canlı |
| `20260910000007_trigger_enforcement_fix` | yetki yükseltme açığı: INVOKER sarmalayıcı + DEFINER `*_impl` | canlı |
| `20260910000008_search_path_hygiene` | `search_path` sabitleme | canlı |
| `2026091130_services_push_and_leads`, `…140_profile_business_stats`, `…160_admin_tools` | push webhook, panel istatistiği, admin araçları | canlı |
| `2026091210_verticals`, `…220_support`, `…230_admin_core`, `…240_support_notes` | işletme türleri/QR menü/oda/etkinlik, destek, analitik+audit+muhasebe, iç notlar | canlı |
| `2026091250_business_open`, `…251_business_open_fixes` | inceleme kalktı, işletme yalnız `apply_business` ile | canlı |
| `2026091260_poi_taxi`, `…262_poi_atm`, `…270_verticals_more`, `…280_user_reviews`, `…290_news_articles` | taksi, ATM, sağlık/düğün/eğitim, yorumlar, kendi haberler | canlı |
| `2026091300` … `2026091305` | yer düzeltme, şikayet sertleştirme, ticari izin tarihi, KVKK hesap silme, güvenlik paketi, analitik sınırı | canlı |
| `2026091310` … `2026091315` | atomik kayıt RPC'leri, engel uygulaması, SMS hook yalnız +905, özel talep fotoğrafı, ilan purge, sürümlü yasal metinler | canlı |
| `2026091320` … `2026091335` | `duty_data_mode`, demo temizliği v2, admin audit, `max_providers` yedeği, hizmet kategori admin, muhasebe fişi, POI admin | canlı |
| `2026091340` … `2026091345` | yeniden dağıtım, push retry, arama etkinlik/haber, haber cron, nöbet import, ilan özellik filtreleri | canlı |
| `2026091350` … `2026091364` | panel görüntülenme, sözlükler, POI eşitleme, **service-role'süz admin** (`…360`), DB hijyeni, yasal Tokyo, haber/yer sözlüğü, admin cilası | canlı |
| `2026091365_service_dispatch_fix` … `2026091369_security_hardening` | anında dağıtım, tatil modu, tümünü okundu, **OTP kilidi** (`…368`), güvenlik sertleştirme | canlı |
| `2026091370_business_rules` … `2026091378_gebzemai_openai` | hesap başına 1 işletme + tür kilidi, ilan istatistiği, kullanıcı etkinlikleri, arama, ilan videosu, GebzemAI, şehir rehberi, doktorlar, OpenAI sağlayıcısı | canlı |
| `2026091380_kocaeli_districts`, `…381_kocaeli_import_support` | ilçeler, `district_id`, `zz_fill_district`, ilçe öncelikli dağıtım; KBB/GTFS aktarım desteği | canlı |
| `2026091382_doctor_profiles`, `…383_cinema`, `…384_kocaeli_guide_categories`, `…385_search_kinds_audit` | doktor slug'ları, sinema, rehber kategorileri, arama türleri + audit | canlı |
| `2026091386_districts_phase_b` | admin kullanıcı detayı ve veri sağlığına ilçe sayıları (eklemeli; arayüz buna bağlı değil) | **yazıldı, dry-run OK, UYGULANMADI** (sahip onayı) |
| `2026091387_otp_signup_on_screen` | demo modunda yeni kayıt (onaylı hesabı olmayan, admin olmayan TR mobil) OTP'si ekranda: `private.otp_signup_code_visible`, `send_sms_hook` + `get_demo_otp` güncellemesi (sahip kararı 12.09 "Yeni kayıtta göster") | **commit edilmedi**; dry-run/canlı durumu belgelenmemiş, kontrol et |

### 5.8 Migration iş akışı
1. Migration'ı Write aracıyla yaz (BOM yok). Yeniden çalıştırılabilir olsun: `if not exists`, `create or replace`, upsert, politikayı düşür-yeniden kur.
2. Fonksiyon değiştiriyorsan **önce canlı gövdeyi oku** ve ondan başla:
   ```powershell
   node --env-file=.env.local scripts/db/sql.mjs -e "select pg_get_functiondef('public.admin_data_health'::regproc)"
   ```
   (Uzun ya da tırnaklı SQL'i dosyaya yaz: `node --env-file=.env.local scripts/dev/sqlq.mjs <dosya.sql>`.)
3. **Dry-run** (`BEGIN..ROLLBACK`; "DRY-RUN OK" ya da hata basar):
   ```powershell
   node --env-file=.env.local scripts/dev/sql-dryrun.mjs supabase/migrations/<dosya>.sql
   ```
4. Gerçek kullanıcıyı etkiliyorsa (bildirim gönderir, gerçek hesaba yazar) **sahibe sor**. Güvenlik sınıflandırıcısı canlı yazmayı
   engellerse aşmaya çalışma; etkisini anlatıp onay iste.
5. Uygula (ortamda `SUPABASE_ACCESS_TOKEN` olmalı):
   ```powershell
   node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/<dosya>.sql
   ```
6. Tipleri yenile: `node --env-file=.env.local scripts/db/gen-types.mjs`. **Uyarı:** migration canlıya uygulanmadan tip üretme (canlıda
   olmayan tipleri siler); paralel çalışmada tip üretimini tek yerden yap. Windows'ta libuv assertion ile exit 9 verebilir; dosya
   yazılmışsa zararsız.
7. Doğrula: `scripts/db/verify-auth.mjs`, `scripts/db/verify-all.mjs` (test verisini kendileri siler); FK eklediysen embed ipuçlarını
   ve canlı sayfaları kontrol et. `legal_texts` değişikliği her zaman **yeni sürüm**dür.
8. `supabase/golive/otp_golive.sql` migration değildir; SMS sağlayıcı bağlanmadan asla çalıştırma.

---

## 6. Kimlik doğrulama ve OTP

### 6.1 Nasıl çalışıyor (public)
1. `/giris` (telefon, +90 sabit, KVKK kutusu zorunlu) → `signInWithOtp` (`src/lib/auth/otp.ts`). Turnstile yalnız
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` varsa (şu an yok).
2. Supabase Auth, **Postgres Send-SMS hook**'unu çağırır: `pg-functions://postgres/public/send_sms_hook`. Gerçek SMS gönderilmez.
3. Hook demo aralığının (**+90 555 000 xxxx**) ve demo modunda **yeni kaydın** (onaylı hesabı olmayan, admin olmayan TR mobil;
   `private.otp_signup_code_visible`) kodunu `demo_otp`'ye yazar. Onaylı hesaplı numara ve admin reddedilir (hook: "...already has an
   account" → ekranda "Bu numarayla kayıtlı bir hesap var. SMS altyapısı bağlanana kadar bu numarayla giriş yapılamıyor."; diğer
   ret "Bu numaraya şu an SMS gönderemiyoruz..."; `authErrorMessage`, `src/lib/auth/otp.ts`). Numara değiştirmede yalnız demo numaralar
   geçer. **Not:** yeni kayıt kuralı commit edilmemiş `2026091387` + OTP kodu değişikliklerine bağlı; commit'li `2026091368` davranışında
   kod yalnız demo aralığına gösterilir.
4. `otp_demo_mode=true` iken demo banner kodu `get_demo_otp` ile gösterir ("Prototip modu"); `get_demo_otp` yeni kayıt kuralını okuma
   anında yeniden kontrol eder (hesap onaylanınca eski kodlar okunamaz).
5. `/giris/dogrula` (6 hane, 300 sn) → yeni kullanıcı `/giris/profil` ("Adın ne?" tek kutu, soyad büyük harf, gri daire fotoğraf,
   "Şimdilik geç"); dönen kullanıcı `?next`'e (`safeNextPath`).
6. Şifre yok, "Şifremi unuttum" yok. Uygulama girişsiz gezilir; giriş işlem anında istenir. Hesap silme ve numara değiştirme taze SMS kodu ister.

### 6.2 Admin girişi
- Admin sitesinde misafir `/admin/*` açınca aynı adreste **telefon + şifre** formu (`/giris/yonetim`, `signInWithPassword`).
- Admin olmayan hesap çıkış yaptırılıp `/giris/yetki`'ye gider. Şifre `/admin/hesap`'ta değişir. Kodla giriş yedek link olarak durur.
- Sahibin hesabı admin'dir; başlangıç şifresi bir kez sohbette açık yazıldı (hata), sahipten değiştirmesi istendi, değiştirdiği doğrulanmadı.

### 6.3 Demo numaralar (hepsi `is_demo=true`)
| Numara | Hesap |
|---|---|
| +90 555 000 00 01 | Demo admin "Yönetici" (sabit test OTP; `get_demo_otp` admin kodu döndürmez) |
| +90 555 000 00 10 … 17 | Hizmet firmaları: Parlak Temizlik (10), Usta Tesisat Gebze (11), Kombi Servis 41 (12), Renk Boya Dekorasyon (13), Gebze Nakliyat (14), Anadolu Elektrik (15), Kent Teknoloji (16), seed'de "Örnek Plastik San. ve Tic. A.Ş." → canlıda "Plastik Enjeksiyon Atölyesi" (17) |
| +90 555 000 00 20 / 21 / 22 | Normal kullanıcılar Ayşe Yılmaz / Mehmet Demir / Zeynep Kaya |
| +90 555 000 00 30 … 37 | Yemek/kafe/otel sahipleri (`seed-verticals.mjs`; 34 Kule Kahve, 36 Mor Salkım Otel) |
| +90 555 000 00 40 … 55 | Sağlık/düğün/eğitim demo işletme sahipleri (`seed-more-verticals.mjs`) |
| +90 555 000 00 90 … 99 | Kullanılmamış: **kayıt testi** için (kod doğrulama ekranında çıkar). Bu hesaplar `is_demo=false` olur; demo temizliği silmez, Profil → Hesabı sil ile silinmeli. `2026091387` canlıdaysa hesabı olmayan gerçek numarayla da kayıt testi yapılabilir |

Not: Parlak Temizlik, Kule Kahve ve Mor Salkım Otel 11 Eylül'de sahibin hesabına taşındı (sahibin deneme işletmesi "Hjnm" de orada).
Parlak Temizlik demo verisi yüzünden tatil modunda.

### 6.4 Test OTP
- Sahibin numarasında ve demo admin'de GoTrue **sabit test OTP** var (2027-06-30'a kadar). SMS gitmez, ekranda kod çıkmaz.
  Değer yalnız Supabase paneli → Authentication → Phone → Test Phone Numbers'ta; hiçbir dosyada yok, asla yazma.
- Güncellerken `sms_test_otp` ve `sms_test_otp_valid_until` **birlikte** gönderilmeli (tek başına PATCH 400 verir). Okuma:
  `node --env-file=.env.local scripts/db/auth-config.mjs get sms` (gizli alanları maskeler).
- Başkalarına ait gerçek hesaplara test kodu tanımlanmaz (sahip: "telefona gerek yok").

### 6.5 SMS sağlayıcı durumu ve plan
- **Bağlı değil.** Gerçek numaralar yalnız ilk kayıtta girebilir (ekrandaki kodla; `2026091387`'ye bağlı); onaylı hesabı olan 6 gerçek
  hesap çıkış yaparsa yeni giriş başlatamaz. Sahip: "sonra yaparız".
- Önerilen **İleti Merkezi** (yedek Netgsm; Twilio Verify pahalı). Başlık onayı ~3-5 iş günü, KEP + e-imza gerekir.
- Plan: yeni route `src/app/api/hooks/send-sms/route.ts` (**henüz yok**; `standardwebhooks` paketi kurulu) imzayı `SEND_SMS_HOOK_SECRET`
  ile doğrular ve sağlayıcıya 2 sn içinde gönderir; planlanan env adları `ILETIMERKEZI_API_KEY`, `ILETIMERKEZI_API_HASH`,
  `ILETIMERKEZI_SENDER` (henüz kodda yok). Sonra Auth hook adresi değişir, `supabase/golive/otp_golive.sql` çalışır (`otp_demo_mode=false`,
  `demo_otp` erişimi kapanır), sabit test kodları kaldırılır, `get_demo_otp`/`DemoOtpBanner` koddan temizlenir. Ayrıntı `supabase/README.md`.
- Sahip isterse önerilen arayüz düzeltmeleri: gerçek numaraya net mesaj + destek bağlantısı, test numarasına "sabit kodu yaz" notu,
  yanlış "Yeni kod gönderildi" bildirimi, admin numarasında sonsuz "Kod henüz alınamadı" döngüsü, yeniden gönder/hesap silme/numara
  değiştirmede eksik captcha token'ı.

### 6.6 Güvenlik dersi (DBAUTH-1, 11 Eylül 18:05)
Demo modunda anon'a açık `get_demo_otp` **herhangi bir gerçek numaranın** kodunu döndürüyordu; başkasının numarasıyla hesabına
girilebiliyordu. `2026091368_otp_lockdown.sql` ile kod yalnız demo aralığına kısıtlandı. Ders: demo/test kısayolları her zaman demo
aralığıyla sınırlanır; güvenlik değişikliğinin test akışına etkisi sahibe önceden söylenir (yoksa "kayıt olurken kod gelmiyor" olur).

12.09'da sahip kararıyla (`2026091387`, "Yeni kayıtta göster") hesabı olmayan yeni kayıtlara da kod ekranda gösterildi. Onaylı hesaplar ve
adminler korunur. **Sahibin kabul ettiği kalıcı risk:** hesabı olmayan bir numarayı herkes sahiplenebilir; ret mesajı numaranın kayıtlı olup
olmadığını ele verir. SMS bağlanınca (`otp_golive.sql`) bu yol kapanır.

---

## 7. Özellik modülleri

### 7.1 Ana sayfa (`src/app/(main)/page.tsx`, `src/features/home`)
Üst bar ana sayfanın içinde (hydration dersi): solda avatar + saate göre selam (Günaydın / İyi günler / İyi akşamlar / İyi geceler),
sağda hava durumu (5 günlük çekmece, Open-Meteo `/api/hava`) ve zil. Arama kutusu, geniş GebzemAI kartı + hızlı kartlar (Nöbetçi
Eczane, Durak, Şehir Rehberi, Taksi), 4'lü kategoriler (Yemek, Kafe, Hizmetler, Otel, İkinci El, İş İlanı, Sağlık, Düğün,
Eğitim ...), sinema bölümü, Gezilecek Yerler, haberler (yalnız kendi yazılarımız), etkinlik şeridi. Header kaydırınca kaybolmaz.
Slider 12.09'da sahibin isteğiyle tek görselle geri geldi. Restoranlar Yemek sayfasının "Yemek · Restoran" başlığından açılır
(`vertical-explorer.tsx` `VerticalTitle`).
**Bilerek kaldırılanlar, geri getirme:** döviz/altın, eski slider, Gebze Gündemi, Öne çıkan işletmeler, son ilanlar, popüler hizmetler,
Acil Durum hızlı kartı (yerine Taksi); 12.09: Restoran kategori kutucuğu, "Kesintiler ve afet" kartı, Şikayetler panosu (`/sikayetler`;
sahip: "şimdilik işletmeler için yorumlar yeterli"). Admin'deki Şikayetler (içerik bildirimi) ayrı sistemdir ve duruyor.

**Tanıtım / PWA:** 5 adımlı dinamik tanıtım (parallax, ilerleme çubukları, `prefers-reduced-motion`), `onboarding-gate` + `<head>`
pre-script, izin hazırlığı adımı; install prompt 2. ziyaretten itibaren. Admin sitesinde SW, analitik ve tanıtım yok.

### 7.2 Yakınımda / Keşfet ve nöbet (`src/features/nearby`)
- **Tek harita kuralı (sahip, 12.09: "keşfet ve şehir rehberinden seçtiğin şeyler aynı haritada olmak zorunda"):** Keşfet
  (`/yakinimda`) ve Şehir Rehberi listeleri (`/rehber/[kategori]`) aynı ekrandır: tek bileşen `ExploreMap`
  (`components/explore-map.tsx`), tek çip ağacı (`explore-tree.ts`), tek Google haritası, tek kart (`NearbyCard`). Haritanın üstünde
  çip yok; çipler alt çekmecede (`drill-chips.tsx`): üst seviyede "Tümü" (rehbere gider) + türler, seçilen siyah; bir alt seviyede
  seçilen yol siyah ve X'li (Kurum ✕ → Belediye ve kamu ✕ → Kaymakamlık ✕), X o seviyeye geri çıkar, kök X "Yakınımdakiler"e gider.
  ATM/Şube ve Tüm eczaneler/Nöbetçi anahtarları çipin altında. Eczane, Cami, Durak, Taksi, Gezilecek, Yakınımdakiler yakındaki ilk 60
  (`useNearbyData`); ATM, Banka, Akaryakıt, Şarj, Kurum ve bütün rehber listeleri listenin tamamı (`useGuideDataset` ←
  `GET /rehber/dizin/<slug>`, 10 dk önbellek). Seçim adres çubuğuna `replaceState` ile yazılır; eski `?tur=` linkleri çalışır. Bu iki
  kapıyı yeniden ayırma, ikinci bir liste/harita bileşeni yazma.
- `/yakinimda?tur=eczane|nobetci|cami|durak|taksi|atm|banka|akaryakit|sarj|kurum|gezilecek` (ya da `?kategori=<rehber slug'ı>`): tam ekran
  Google haritası (hemen yüklenir), Google POI'leri gizli, bizim daire pinlerimiz, alt çekmecede Türkçe duyarsız arama.
- `/nobetci-eczane` (ISR 5 dk, 08:30 → 08:30 penceresi `src/core/duty.ts`), `/eczane/[id]`, `/cami/[id]` (namaz vakitleri AlAdhan),
  `/durak/[id]` (geçen hatlar), `/gezilecek-yerler` + `[slug]`. Detaylarda `MapPreviewCard` dokununca yüklenir (kota).
- Nöbet `duty_data_mode=demo` (demo nöbet yalnız Gebze'de); elle giriş `/admin/nobet` (`admin_set_duty`), otomatik import NosyAPI
  (`NOSYAPI_KEY` yok). Nöbetçi eczane örnek-veri uyarısı güvenlik için kalıyor.
- Taksi: 17 durak, 11'inde doğrulanmış telefon; numarasızlarda "Bildir". "Bilgi hatalı mı? Bildir" → `submit_contact_message` (`bilgi_duzeltme`).

### 7.3 Şehir rehberi (`src/features/guide`)
`/rehber` (sade liste, arama, acil numaralar), `/rehber/[kategori]` (harita + çekmece; `GUIDE_SECTIONS` ya da kurum kategorisi slug'ı,
ör. `/rehber/nufus`), `/rehber/dizin` (JSON indeks), `/kurum/[slug]`, `/acil-durum` (112, 185, 186, 187, 183; tek dokunuş). Kurum
kategorileri `institution_categories` (belediye, kaymakamlık, nüfus, tapu, vergi, SGK, emniyet, jandarma, adliye, hastane, ASM, okullar,
üniversite, kütüphane, PTT, `milli_egitim` ...). ATM/banka `details.bank`, akaryakıt `details.brand`, şarj `details.operator`.
Konumsuz kayıtlar `/admin/rehber/konum` kuyruğunda pinlenir. İçe aktarılmış yerler admin'de silinmez, **gizlenir**; `locked` satır
admin düzenlemesini eşitlemeye karşı korur.

### 7.4 İşletmeler ve türler (`src/features/business`)
- Herkes normal kullanıcı başlar; Profil → `/isletme/tanitim` → `/isletme/basvuru` (tür adımı, "Sana neler açılır") → `apply_business`:
  **inceleme yok, anında yayında** (admin askıya alabilir).
- **Hesap başına 1 işletme** (`business_max_per_owner=1`); ikinci deneme `BusinessLimit` çekmecesiyle `/yardim` (işletme ekletme)
  konusuna gider; admin `admin_grant_business_slot` ile ek hak verir. Eski çoklu işletmeli hesaplar korunur (`/isletme/sec`, çerez `gbz_biz`).
- **Tür oluşturulduktan sonra kilitli** (yalnız `admin_set_business_vertical`). Türler (`VERTICALS`): yemek, restoran, kafe, otel, hizmet,
  magaza, saglik, dugun, egitim, etkinlik, diger. Listelenenler `/kesfet/[tur]` (`LISTABLE_VERTICALS`; büyük fotoğraf kartları, alt kategori çipleri Döner/Kebap..., harita).
- Türe göre araçlar: menü + QR (yemek, restoran, kafe, otel), odalar (otel), fiyatlı hizmet kataloğu + talepler (hizmet), doktorlar (saglik).
  "Personel arıyorum" yok; onaylı her işletme iş ilanı verebilir.
- Panel `/isletme`: istatistikler (gerçek `/firma` ve `/menu` görüntülenmeleri), görev listesi hâlinde profil gücü, tatil modu (dönüş
  tarihi; firma sayfası, QR menü, kart ve aramada "Tatilde"). Düzenleme adım adım: `/isletme/duzenle/[adim]`
  (temel, iletisim, konum, saatler, ozellikler, hizmet-alani). Ayrıca `fotograflar`, `yorumlar`, `hizmetlerim`, `menu`, `odalar`,
  `doktorlar`, `etkinlikler`, `talepler`.
- `/firma/[slug]` (ISR): tam ekran galeri kapak, bulanık daire geri okları, sekmeler (Genel / Menü-Odalar-Hizmetler / Yorumlar /
  Etkinlikler), olanak çipleri, çalışma saatleri (kenarlıksız, bugün mor satır), yorum yaz/düzenle/sil (sahip kendi işletmesine yazamaz),
  siyah "Ara". `/firmalar` dizin.

### 7.5 QR menü ve odalar
`/menu/[slug]` herkese açık, girişsiz, alt menüsüz QR menü. Sahip `/isletme/menu` (bölüm/ürün, fiyat, fotoğraf, tükendi, sıralama) ve
`/isletme/menu/qr` (yazdırılabilir masa kartı, `qrcode`). Oteller de QR menü alır. Odalar `/isletme/odalar` (fotoğraf, kişi, yatak, m²,
özellikler, gecelik fiyat, müsaitlik); firma sayfasında oda kartı + detay çekmecesi.

### 7.6 Doktorlar
`business_staff` yalnız `vertical='saglik'` işletmelerde; branşlar `doctor_branches`. Kişisel telefon yok, arama kliniğe gider. KVKK için
`consent_confirmed_at` zorunlu (sunucu damgalar). Doktor bilgisi internetten toplanmaz; klinik ya da admin doktorun onayıyla girer.
Sahip `/isletme/doktorlar`, admin Sözlükler + doktor yönetimi. Public: `/kesfet/saglik#doktorlar` (2 sütun kart), `/doktor/[slug]` profil.
Sağlık işletmeleri diğer kategoriler gibi tek sütun büyük kart.

### 7.7 İlanlar (`src/features/listings`)
- **İkinci El** `/ilanlar` ve **İş İlanları** `/is-ilanlari` ayrı sayfalar (eski `?tab=is-ilanlari` 308). Detay `/ilan/[id]`, `/is-ilani/[id]`
  (iş ilanında telefon girişsiz görünür, CV/başvuru yok). Filtre `?ilce=` + filtrelenebilir kategori alanları (`search_listings(p_attrs)`).
- Verme: `/ilan-ver` → `ikinci-el` (sihirbaz, 1-10 fotoğraf, IBAN/kapora uyarısı, taslak) ya da `is-ilani` (**yalnız onaylı işletme**;
  normal kullanıcıya iş ilanı FAB'ı yok). İlk 3 ilan moderasyonlu, yasaklı kategoriler (Emlak, Vasıta, İlaç, Silah, Canlı Hayvan, Alkol & Tütün).
- **Video:** ilan başına 1 (yalnız 2. el, yalnız R2): mp4/mov/webm, 100 MB, 60 sn; tarayıcıda konum metaverisi silinir (`iso-bmff.ts`),
  JPEG kapak üretilir; `reserve_media_upload` → `set_listing_video`; eskiler `media_trash`'e. Uygulamadan gerçek yüklemeyle uçtan uca denenmedi.
- **İstatistik:** `listing_daily_stats` (görüntülenme, tekil, arama, numara gösterme, favori, paylaşım) → `/profil/ilanlarim/[id]/istatistik`.
- Süre 30 gün (`expire_listings`, `renew_listing`); silinen ilan 30 gün sonra dosyalarıyla kalıcı silinir (`/api/cron/purge-listings`).
- `JOB_LOCATIONS` (`src/features/listings/constants.ts`) hâlâ Gebze OSB listesi (Kocaeli'ye genişletilecek).

### 7.8 Hizmet talepleri ve dağıtım (`src/features/services`)
1. `/hizmetler` (doğrudan 1. adım; kırmızı "Usta mı arıyorsun?") → `/hizmetler/[kategori]` → `/hizmet-talebi/[altKategori]` (sürümlü
   `question_flows`, `?adim=N`). Fotoğraflar cihazda küçültülür, IndexedDB'de bekler, `private-docs/<uid>/requests/`'e yüklenir.
2. `submit_service_request` → `/hizmet-talebi/tamam` (push izni kartı). **Anında otomatik dağıtım** (bütün kategorilerde `auto_dispatch`):
   talebin ilçesine hizmet verenler önce, havuz dolmazsa diğerleri; sahip başına tek işletme; engelli sahip hariç; demo firma gerçek talebe gitmez.
3. Firma talebi numarasız görür, `/isletme/talepler`'de "İlgileniyorum" (`accept_lead`) der; numara sonra açılır. Kabul sınırı kategori
   `max_providers` ya da `max_providers_default` (5).
4. Müşteri `/talep/[code]`: kabul eden firmalar, firmayı çıkar, kapat, yorum. Yeniden dağıtım 6 saatte bir dalga, 22:00-08:00 arası
   dalga yok, yeni firma yoksa `stalled_at` + admin bildirimi, 14 gün sonra süre dolar. Firma yoksa "Yakında".

### 7.9 Etkinlikler (`src/features/events`)
Herkes etkinlik açar: `/etkinlik-olustur` (kendi adına ya da `?isletme=<id>`). İşletme etkinliği anında yayında; kullanıcınınki
`pending_review` → `/admin/etkinlikler` (`admin_review_event`); kullanıcı düzenlemesi tekrar incelemeye döner. Limitler: kullanıcı 3 bekleyen
+ 10 yaklaşan; işletme 24 saatte 10 + 30 yaklaşan. Liste `/etkinlikler` (kategori tarzı, tarih rozetli kart, harita), `/etkinlikler/gecmis`,
minimalist detay `/etkinlik/[slug]`, `.ics` `/etkinlik/[slug]/takvim`. Kullanıcı telefonu yalnız girişliye `reveal_event_phone` ile.

### 7.10 Haberler, duyurular, sinema
- Haberler: **yalnız ekibin kendi yazıları** (`news_articles`), admin `/admin/haber-yazilari`, detay `/haberler/[slug]`, sekmeler
  (Gündem, Siyaset, Belediye, Spor ...). RSS altyapısı (`news_sources`, 20 dk cron) duruyor ama uygulamada gösterilmiyor.
- Duyurular `/duyurular` (su/elektrik kesintisi, belediye; ilçe hedefli), admin `/admin/duyurular`; `maintenance_banner` bandı.
- Sinema: Gebze Center vizyonu, `/sinema` + `/sinema/[slug]`, `/api/cron/cinema` (günde 2 kez). Kaynak Paribu Cineverse görsel/metin tekrar
  kullanımını yasaklıyor; afişler kaynağından bağlantıyla (Marsgate CDN) gösteriliyor (şartlar sahip kararı).

### 7.11 Arama (`src/features/search`)
`/ara`: `global_search` (ilan, işletme, hizmet, yer, etkinlik, haber, kurum, banka, ATM, akaryakıt, şarj, doktor), popüler aramalar ve
yerler (`popular_searches`, `popular_places`), son aramalar yalnız cihazda. Arama terimleri yalnız toplu sayı olarak (`search_terms_daily`).

### 7.12 GebzemAI (`src/features/ai`)
- `/gebzemai` (giriş gerekli; kapalıyken sakin bilgi ekranı) → `POST /api/gebzemai` (NDJSON stream, nodejs, maxDuration 60).
- `ai_begin_turn` limit/bütçe kontrolü ve rezervasyon → `runProviderAgent` (OpenAI ya da Anthropic) → en fazla 4 araç turu, 800 çıktı
  token'ı → `ai_finish_turn`. Konuşma metni saklanmaz, yalnız kullanım metaverisi.
- **9 araç** (`src/features/ai/server/tools.ts`): `nobetci_eczane`, `isletme_ara`, `yer_ara`, `etkinlikler`, `taksi_duraklari`, `son_haberler`,
  `doktor_bul` (şikayete göre branş, klinik telefonu; eşleşme yoksa hastane), `otobus_hatlari` (geometrik durak-hat bağlantısı, sefer saati
  yok, uydurmaz), `internet_ara` (yalnız DB'de sonuç yoksa; OpenAI `web_search`, kaynaklı; maliyeti günlük bütçeye eklenir). Hepsi isteğe bağlı `ilce` alır.
- Maliyet: soru başı ~0,002 USD, internet araması +~0,015 USD; günlük toplam 5 USD, kişi başı 20 soru/gün, dakikada 5. Tanı koymaz.
- Açılması için: `ai_enabled=true` (Admin → GebzemAI) + seçili sağlayıcı anahtarı public projede. **Claude açmaz; sahip açar.**
- Model allowlist'i `src/features/ai/lib/models.ts` ve `2026091378_gebzemai_openai.sql`'de; ikisi aynı tutulmalı.

### 7.13 Bildirimler ve push
RPC'ler `private.notify` / `notify_admins` ile `notifications` ekler → `notifications_push_webhook` (pg_net) → `/api/notifications/push`
(`claim_push_notifications`, VAPID, en fazla 3 deneme, 10 dk emniyet cron'u; 404/410 abonelik silinir). Abonelik yoksa bildirim park edilir,
kullanıcı push'u açınca bir kez gönderilir. Talepler, yorumlar ve yeni firmalar **anında** bildirim. İzin yalnız dokunuşla; iOS'ta
ana ekrana eklenmiş PWA gerekir. `/profil/bildirimler` ("Tümünü okundu yap"). **Admin bildirimleri uygulamada görünmez ve push'lanmaz**;
yalnız admin panelinde (`admin-notices`).

### 7.14 Profil ve destek
`/profil` (duruma göre koyu tanıtım kartı, ikonlu liste, ortak Profil başlığı), `duzenle`, `ilanlarim`, `is-ilanlarim`, `taleplerim`,
`etkinliklerim`, `favoriler`, `bildirimler`, `ayarlar` (push, ticari ileti izni, "Tanıtımı tekrar izle"), `telefon-degistir`, `hesap-sil`
(KVKK; taze kod, dosyalar silinir). Destek `/yardim`: 4 adım (Konu → Mesaj → İletişim → Kontrol et ve gönder), konular şikayet, teknik
destek, reklam/iş birliği, işletme ekletme, öneri, diğer; SSS, Mesajlarım, yasal linkler altta. Yasal sayfalar `/yasal/{kvkk,acik-riza,gizlilik,kosullar,cerez}`, `/kaynaklar`.

### 7.15 Admin paneli (ayrı site)
Genel bakış (canlı kullanıcı, bugün, bekleyen işler, 14 gün grafik, kurulumlar), analitik (kendi çerezsiz ölçümümüz
`src/lib/analytics/tracker.tsx`; mağaza sayıları elle), kullanıcılar (hareketler, gezilen sayfalar, Aktif/Kısıtlı/Engelli, ek işletme hakkı),
işletmeler, ilanlar, ilan/hizmet kategorileri (soru akışı editörü), talepler, etkinlikler, şikayetler, destek (iç notlar), duyurular, haber
yazıları, haber kaynakları, rehber (+ konum kuyruğu), yerler (her POI türü; gizle + kilitle), nöbet, sözlükler, muhasebe (KDV, 12 ay grafik,
fiş, CSV), veri (veri sağlığı, demo temizliği "SİL" onayı, POI eşitleme), denetim kaydı, ayarlar + yasal metin sürümleri, GebzemAI, hesap.

---

## 8. Kocaeli ve ilçe katmanı

| Faz | İçerik | Durum |
|---|---|---|
| **A** (DB, eklemeli) | `2026091380_kocaeli_districts.sql`: `districts` (12 ilçe), `private.district_boundaries` (OSM admin_level=6), çekirdek tablolarda `district_id`, hizmet bölgesi ilçeye, `zz_fill_district` trigger'ı pin'den ilçe doldurur, ilçe öncelikli + mesafe sınırlı dağıtım, `district_for_point` | canlı (`759382c`) |
| **B** (arayüz) | Mahalle uygulamadan kalktı: ortak `DistrictPicker` (`src/components/shared/district-picker.tsx`, 12 ilçe ızgarası + "Konumumu kullan"), konum deposu ilçe tutar (`src/lib/location/store.ts`, anahtar `gebzem.district.v1`; eski mahalle tercihi isimden ya da 35 km içindeki en yakın ilçe merkezinden taşınır; `persistDefault` varsayılanı `false`). Filtreler `?ilce=`, kartlarda ilçe adı, yazmalar `district_id` / `p_district_id` / `p_district_ids`. Metinler Kocaeli (`APP_FULL_NAME` "Gebzem - Kocaeli Şehir Rehberi", JSON-LD `areaServed`) | canlı (`1574a19`); admin raporları için `2026091386` onay bekliyor |
| **C** (temizlik) | `neighbourhoods` tabloları, kolonları ve RPC çıktılarındaki neighbourhood alanlarını kaldırmak (kodda `@deprecated`) | yapılmadı |

- İlçe sabitleri `src/config/districts.ts` (`KOCAELI_DISTRICTS`: slug, ad, KBB `ilce_id`, merkez, OSM relation; ör. Gebze 1338, İzmit 2062).
  `CITY` (`src/config/site.ts`) hâlâ Gebze: yalnız ilçe/konum yokken harita yedek merkezi.
- **Veri aktarımı (canlıda):**
  - `scripts/db/seed-districts.mjs`: 12 OSM ilçe sınırı (örtüşme 0).
  - `scripts/db/import-kocaeli.mjs` (`--dry-run`, `--rehearse`, `--only`, `--show-merges`, `--utility-places`): KBB açık verisi (eczane, cami, akaryakıt,
    taksi, emniyet, ASM, 112, müze/tarihi, millet bahçesi, plaj ...) + GTFS: **418 hat, 8.480 durak**, `transit_routes` /
    `transit_route_stops` (geometrik bağlantı; `stop_times.txt` yok, sefer saati yok). `--utility-places`: 846 KocaeliKart noktası,
    338 acil toplanma alanı, 48 ücretsiz otopark (aramada çıkar, gezilecek yerlere karışmaz).
  - `scripts/db/import-kocaeli-guide.mjs` (`--dry-run`, `--rehearse`, `--show-merges`, `--file`, `--show`, `--samples`, `--batch`,
    `--include-dropped`): 3.846 kayıtlık banka/ATM/okul/kurum/şarj araştırması → 3.492 yeni + 274 birleşme (özel muayenehane, kargo,
    dershane ve OSM yanlış etiketleri alınmadı). Birleştirme kuralı: isim + yaklaşık 120 m; kontrol `--show-merges` ile.
  - CLAUDE.md'de ayrıntısı olmayan diğer betikler: `scripts/db/import-city-guide.mjs`, `seed-news-sources.mjs`, `taxi-phones.sql`.
  - `scripts/db/apply-place-photos.mjs`: 56 gezilecek yere CC lisanslı Wikimedia fotoğrafı (atıflı); 166 yerde serbest fotoğraf yok.
- KBB koordinatları çoğunlukla EPSG:5254 (TM30), CSV'ler Windows-1254: JSON kullanılır, PostGIS'te dönüştürülür. KBB adresleri ve bazı
  Kocaeli haber siteleri Tokyo IP'lerini reddediyor; çözüm TR relay ya da izin, bölge taşımak değil.
- Ham veri `kocaeli/` (araştırma yedeği `kocaeli/_arastirma/`, 39 dosya) **git dışı**; asla commit etme.
- **Lisans ve atıf:** KBB açık verisi CC BY 4.0; OSM ODbL ("© OpenStreetMap katkıcıları" atfı zorunlu); Wikimedia fotoğrafları atıflı;
  hepsi `/kaynaklar`'da. Kişi adına kayıtlı KocaeliKart satış noktaları KVKK nedeniyle alınmadı.

---

## 9. Dış servisler

| Servis | Kaynak | Not |
|---|---|---|
| Supabase | proje `fboythglcjofakbskstg` ("gbz-app's Project"), Tokyo | Token yeni proje açamadı (403), bu yüzden bu proje. Auth: telefon açık, e-posta kaydı kapalı, 6 hane / 300 sn; `site_url` ve yönlendirme listesi `auth-setup.mjs`'te. Türkiye/Frankfurt'a taşımak için panelden proje ya da org yetkili token gerekir |
| Vercel | ekip `gebzem-s-projects`; projeler `gbzsehir`, `gbzsehir-admin` | API çağrılarında `teamId` şart. Vercel CLI oturumu yok. Node 24.x; `ssoProtection: all_except_custom_domains` (preview deploy'lar SSO arkasında). `gbzsehir-admin` API ile açıldı. Alan adı yok (yalnız vercel.app) |
| GitHub | `gbz-app/gbzseir`, dal `main` | Public; private yapılması önerildi (yapıldığı doğrulanmadı) |
| Google Cloud | proje **`gbzsehir-rehber`** (sahibin Google hesabı) | Maps JavaScript, Geocoding, Places (New). Anahtar "gbzsehir-web": yalnız bu 3 servis, referrer iki vercel.app + localhost:3000/3100. gcloud'da **her zaman** `--configuration=gbzsehir --project=gbzsehir-rehber`; varsayılan yapılandırma diğer projeye bakar, değiştirme. Bütçe uyarısı kurulmadı: fatura hesabı ("My Billing Account") diğer projeyle ortak, kurmadan önce sahibe sor. Places içeriği kalıcı saklanmaz (ToS) |
| Cloudflare R2 | bucket `gbzsehir-media` (EEUR), public r2.dev adresi, CORS iki vercel.app + localhost | Uygulama anahtarı "gbzsehir-media-app" yalnız bu bucket'a. Kurulum token'ı "gbzsehir-kurulum" (Account/Workers R2 Storage/Edit + User/API Tokens/Edit; yeni token üretebildiği için güçlü) süresiz: video uçtan uca denenince sahip silmeli. Uygulama anahtarında S3 access key = token id, secret = token değerinin sha256'sı (yeniden üretirken lazım). CORS: GET/PUT/HEAD, ETag, 3600 |
| OpenAI | `OPENAI_API_KEY` yalnız `gbzsehir` | GebzemAI; `ai_enabled=false`. Aylık ~20 USD harcama limiti önerildi |
| SMS | bağlı değil | Bölüm 6.5 |
| Nöbet kaynağı | bağlı değil | NosyAPI anahtarı ya da Kocaeli Eczacı Odası izni (sahip kararı) |

Makine: Node 24.19, npm 11.17, git 2.54, gcloud SDK 573; pnpm, Vercel CLI ve Supabase CLI yok, her şey `npx` ile. Next.js ≥16.3.3 şart
(Ağustos 2026 güvenlik düzeltmeleri); sürüm düşürme.

### 9.1 Ortam değişkeni adları (değer asla yazılmaz)
- **Public (`gbzsehir`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`,
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_MEDIA_BASE_URL`, `OPENAI_API_KEY`;
  isteğe bağlı/tanımsız: `ANTHROPIC_API_KEY`, `NOSYAPI_URL`, `NOSYAPI_KEY`, `NEXT_PUBLIC_ADMIN_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `NEXT_PUBLIC_DISABLE_SW`. Eski/okunmayan: `SEND_SMS_HOOK_SECRET` (SMS hook route'u yazılınca kullanılacak), `OTP_DEMO_MODE`, `NEXT_PUBLIC_OTP_DEMO_MODE`.
- **Admin (`gbzsehir-admin`):** `NEXT_PUBLIC_APP_MODE=admin`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `REVALIDATE_SECRET` (public ile **aynı**), `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_MEDIA_BASE_URL`. **`SUPABASE_SERVICE_ROLE_KEY` yok, eklenmeyecek.**
- **Yerel/betik:** `SUPABASE_ACCESS_TOKEN` (Management API), `VERCEL_TOKEN`, `VERCEL_ORG_ID` (deploy-wait, vercel-env-*), `ADMIN_OTP_FILE`
  (auth-setup/verify betikleri; dosya scratchpad'de), `CITY_GUIDE_FILE`, `SUPABASE_PROJECT_REF` (`scripts/db/{sql,gen-types,auth-config,auth-setup}.mjs`;
  varsayılanı proje ref'i; `src` okumaz).
- Env eklemek: `node scripts/dev/vercel-env-set.mjs <KEY> <degerDosyasi> <proje...>` (değeri dosyadan okur, yazdırmaz). Adları görmek:
  `node scripts/dev/vercel-env-keys.mjs gbzsehir gbzsehir-admin`.

### 9.2 Dokunulmayacak projeler
Vercel `gebzem`, `gbz-ver`, `2c-gebzem` (ve aynı ekipteki gametg1, kasa, project-c41p2, gapp2yxq1, qrlex); GitHub `gbz-app/gebzem`,
`gbz-app/gbz-ver`; Google Cloud `gebzem-app-push`; Cloudflare `gbz-a2cloud` token'ı, D1, Pages. Bu proje için yeni kaynak gerekirse
**ayrı** açılır, sahibe söylenir.

---

## 10. Tasarım kuralları

| Kural | Ayrıntı |
|---|---|
| Renk | Mor tema `#8C6CF0` (`BRAND_COLORS.primary`), koyu `#6D4FD8`; lavanta zemin (CSS `--background` = `oklch(0.975 0.008 300)`; hex karşılığı `BRAND_COLORS.backgroundLight` `#EFE8FB`) üstünde **beyaz kartlar** (`--card`). Kartlar %20 kısaltıldı; büyütme. Gece modu token'ları `globals.css`'te |
| Köşeler | Tek yuvarlaklık ailesi (`globals.css` `@theme`): `--radius-chip` 0.625rem, `--radius-card` 1rem, `--radius-media` 1.25rem; sınıflar `rounded-chip`, `rounded-card`, `rounded-media`. Hap düğmeler hap kalır |
| Kenarlık / gölge | **Yok.** Gölgeyi className ile ezmeye çalışma (`tailwind-merge` `shadow-soft` + `shadow-none`'ı birlikte bırakıyor); gölgesiz varyant kullan |
| İkon / yazı | Yalnız Lucide 2B ikon, **emoji yok**, logo yok; Google Sans. Profil fotoğrafı yoksa baş harf ("MS") değil ikon. Toast'lar büyük ve tek tip (`src/lib/notify.ts`) |
| Ana düğme | **Siyah** hap; detay sayfalarında büyük siyah "Ara"; geri okları bulanık daire |
| Alt menü | Her sayfada aynı: tam genişlik, düz siyah, kenarlık/boşluk yok; Anasayfa, Keşfet (`/yakinimda`), Arama, Bildirim, Profil (`src/components/layout/nav-config.ts`); dolgusuz büyük kalın ikon, seçili beyaz kalın. Kaydırınca kaybolmaz; tam ekran akışlarda ve detaylarda gizli |
| Ekran | 390px mobil öncelikli; **yatay sayfa kaydırması yok** (kapsanmış yatay şeritler olabilir), kaydırma çubuğu gizli, aşağı çekince siyahlık yok (`overscroll-behavior: none`), zoom yok (`no-zoom.tsx`), **yalnız dikey** (manifest portrait + `src/components/pwa/orientation-guard.tsx`) |
| Metin | "Örnek", "gerçekçi" gibi açıklama etiketleri yok (demo kayıtta sadece arama düğmesi gizlenir; nöbetçi eczane uyarısı hariç) |
| Görseller | Yalnız serbest lisanslı ve atıflı (Wikimedia Commons); sahip kart PNG'lerini masaüstüne koyar (`taksi.png`, `eczane.png`, `yemek5.png`) ve adıyla söyler; 512px WebP'ye çevrilip `public/images/home/`'a konur |
| Referans görsel | "İçeriği değil mantığı al": düzeni ve hissi uygula, metin/marka kopyalama |

---

## 11. Çalışma kuralları ve sahibin tercihleri

- **Dil:** Türkçe, samimi ("dostum"). Kısa ve somut. Sahibin yazım hataları olur; niyeti anla, belirsizse yorumunu tek cümleyle söyle.
- **Önce soruyu cevapla.** Sahip bir şey sorduysa işe devam etmeden cevap ver.
- **"bekle" / "bi şey yapma"** → hiçbir araç çağırma, sadece durum söyle.
- **Adım adım:** her adım test edilir, canlıya alınır, kısa Türkçe özetlenir. Hazır olanı biriktirmeden deploy et; verdiğin süreyi güncelle.
- **"ara da birşey yazmana gerek yok, bitince özet geç"** dediyse: ara rapor yok, hepsini bitir, sonunda tek kapsamlı özet (yapılanlar,
  bitmeyenler, onay bekleyenler madde madde).
- **Kapsam:** yalnız isteneni yap ("sadece anasayfaya yap dedin" dersi). Ortak dosyaya (globals.css, alt menü, ikonlar) dokunacaksan önce sor.
  Ek fikirleri öner, sormadan uygulama. Ana sayfadan bir şey kaldırıyorsan söyle.
- **Netleştirme sorusuyla durdurma:** iş sürerken makul varsayılanla ilerle, kararları sonra bildir ("dostum neden durdun"). İstisna: canlı
  veriye/gerçek kullanıcıya dokunan işler.
- **Dış servis kurulumunda** (Cloudflare, Google vb.) sahip adım beklerken başka işe dalma; ekran ekran, tutarlı talimat ver.
- **Onay gerektiren işler:** gerçek kullanıcıyı etkileyen canlı DB yazmaları (bildirim tetikleyen, gerçek hesaba yazan), onay bekleyen
  migration'lar, GebzemAI'yi açmak, yasal metin yayınlamak, demo veri temizliği, harcama doğuran servisler, yeni dış kaynak açmak.
- **Ajanlar:** büyük listelerde builder + reviewer partileri kabul (önce salt okunur eşleme, dosya sahipliği ayrı, güvenlikte şüpheci
  doğrulayıcı). Entegrasyon, 390px test, commit ve deploy ana oturumda. Ajanlar çalışırken dev sunucusu yerine `next build` + `next start`.
  Sahip 10.09'da "ajan çalıştırma şimdilik, en son bitince" dedi; 11.09'dan sonra partilere itiraz etmedi. Büyük ajan işinden önce kısaca haber ver.
- **Durum soruları** ("Hepsi bitti mi?", "söylediklerimi listele"): madde madde durum tablosu (yapıldı / kaldı / onay bekliyor).
- **Dürüstlük:** doğrulanmamış şeyi "bitti" deme; FAIL görünce önce testin doğru olduğunu kontrol et.

---

## 12. Test, build ve deploy komutları

Hepsi repo kökünden. PowerShell'de önce yerel sır dosyasını dot-source et (değerleri yazdırma): `. '<yerel secrets.ps1 yolu>'`.

```powershell
# 1) Kod kontrolleri
npx tsc --noEmit -p .
npx eslint --max-warnings=0 <değişen dosyalar>      # ya da: npm run lint
npx next build                                      # ya da: npm run build

# 2) Yerel sunucu (ajanlar dosya yazarken dev yerine prod)
npx next start -p 3100
npx next dev -p 3100
```

```bash
# 3) 390px test (başsız Edge + CDP). Git Bash'te yol dönüşümünü kapat, yoksa /firma/... C:/Program Files/Git/firma/... olur
MSYS_NO_PATHCONV=1 node scripts/dev/cdp-steps.mjs http://localhost:3100 <çıktıKlasörü> - fboythglcjofakbskstg / "shot:ana" "tap:Keşfet" "wait:1500" "shot:kesfet"
#   Adımlar: tap:<metin>, tapsel:<css>, type:<css>|<metin> (ayırıcı son "|"), wait:<ms>, shot:<ad>, text:<aranan>, url
#   Üçüncü argüman "-" = misafir; oturumlu test için scratchpad'deki oturum JSON dosyası (demo OTP ile alınır, commit edilmez)
#   Ortam: ONBOARD=1 (tanıtımı test et), DARK=1 (gece modu), TOUCH=1 (dokunmatiğe bağlı arayüz, ör. dikey kilit), VIEWPORT.
#   Servis çalışanı otomatik atlanır, konsol hataları raporlanır
node scripts/dev/cdp-auth-shot.mjs <baseUrl> <çıktı> <oturumDosyası> fboythglcjofakbskstg /profil /isletme   # oturumlu tam sayfa
node scripts/dev/hydration-probe.mjs <url>      # konsol/hydration hatalarını tam metinle
node scripts/dev/hydration-diff.mjs <url>       # sunucu HTML'i ile hydrate DOM farkı (prod)
```
Her ekranda kontrol: yatay taşma yok (`scrollWidth == innerWidth`), konsol hatası yok, gölge/kenarlık yok. Edge "CDP not available"
derse mutlak `--user-data-dir` yolu kullanan betiklerle tekrar dene; dokunmatiğe bağlı arayüzü dokunmatik öykünme olmadan görmezsin.

```bash
# 4) Gizli değer taraması (commit'ten önce, değer yazdırmadan)
git diff --cached --name-only        # .env*, kocaeli/, scratchpad, oturum JSON'u listede OLMAMALI
git diff --cached | grep -nE "sbp_|eyJhbGci|sk-[A-Za-z0-9]|whsec_|AIza|ghp_|github_pat_|BEGIN [A-Z ]*PRIVATE KEY|\+90 ?5[0-9]{2}" | grep -v "555 000"
#   Önceki oturumdaki yöntem: scratchpad'deki gerçek değerler staged diff'e karşı SAYIYLA karşılaştırılır (eşleşme 0 olmalı)

# 5) Commit (yalnız adımın dosyaları; Türkçe/çok satırlı mesajı dosyadan ver, PowerShell mesajı bölüyor)
git add <dosyalar>
git commit -F <BOM'suz mesaj dosyası>
git push origin main
```

```powershell
# 6) Deploy bekleme (VERCEL_TOKEN ve VERCEL_ORG_ID ortamda olmalı)
node scripts/dev/deploy-wait.mjs <sha> gbzsehir gbzsehir-admin
#   İkisi READY olunca canlıda durum kodları + 390px kontrol, sonra sahibe kısa Türkçe özet

# 7) Public önbelleği elle yenileme (admin eylemleri bunu otomatik yapar)
#   POST https://gbzsehir.vercel.app/api/revalidate, başlık x-revalidate-secret: <REVALIDATE_SECRET değeri>,
#   gövde {"tags":["businesses"],"paths":[{"path":"/"}]}. Etiketler PUBLIC_CACHE_TAGS: app-settings, content:news,
#   content:articles, content:announcements, businesses, services, listing-categories, listings, poi, nearby, duty, vocabularies

# 8) Veritabanı okuma / doğrulama
node --env-file=.env.local scripts/db/sql.mjs -e "select count(*) from public.poi"
node --env-file=.env.local scripts/db/verify-auth.mjs
node --env-file=.env.local scripts/db/verify-all.mjs
```
- `package.json`'da test runner yok; doğrulama tsc + eslint + build + CDP ekran testleri + DB doğrulama betikleriyle.
- `public/sw.js` değişirse `VERSION`'ı artır (şu an `v5-2026-09-11`); yoksa kurulu uygulamalar eski sayfayı gösterir.
- Demo tarihleri: `node --env-file=.env.local scripts/db/refresh-demo-dates.mjs` (ilanlar 60 gün, etkinlikler 6 hafta ileri taşınır;
  etkinlikler için en geç son çalıştırmadan ~6 hafta sonra tekrar; son çalıştırma tarihi doğrulanmadı).
- Demo temizliği: Admin → Veri ya da `node --env-file=.env.local scripts/db/remove-demo.mjs --yes` (**sahip onayıyla**, yayın öncesi).
- Oturumla kaybolan scratchpad betikleri (gerekirse yeniden yaz): `set-test-otp.mjs`, `set-owner-password.mjs`, `create-admin-project.mjs`,
  `r2/cf-setup.mjs`, `prod-smoke.mjs`, `owner-session.mjs`, `rls-owner-test.mjs`, `support-test.mjs`, `ai-tools-test.mts`,
  `transcript-extract.mjs`, `cut-checker.mjs`, `cdp-shot/click/flow.mjs`.

---

## 13. Geçmişin özeti (TSİ; ayrıntı `OTURUM.md` bölüm 2 ve Ek A)

| Tarih | Aşama | Önemli commit'ler |
|---|---|---|
| 10.09 17:49-19:00 | Sıfırdan başlangıç, ürün tanımı, mimari workflow (RN+Expo önerisi), hesaplar, Tokyo Supabase, Vercel `gbzsehir`, iskelet | `87b268a` |
| 10.09 19:00-21:18 | Temel altyapı: 8 migration, RLS, RPC, seed (40 mahalle, 95 eczane, 124 cami), PWA, telefonla giriş, tanıtım; **trigger yetki açığı** kapatıldı | `61636d0` |
| 10.09 21:18-22:19 | Modül ajanları iptal; Google Sans, logosuz, Lucide; yakınımda detayları, ilan sihirbazları, profil, işletme paneli | `75e1d6b`, `33596c5`, `a87b7d7`, `fde3f06`, `b7f23a8` |
| 10.09 22:17-23:30 | Mor/lavanta tasarım (kapsam aşımı, global kaldı), yeni profil/panel, yeni ana sayfa, arama, dikey ekran | `224d13f`, `c9d0f06`, `d5533ad`, `88960e8` |
| 10.09 23:22-11.09 00:45 | İşletme türleri, Keşfet, etkinlikler, firma detayı, QR menü, odalar, galeri, hava; işletme araçları, destek merkezi | `e6b79bd`, `29ff8c0`, `e098df1` |
| 11.09 00:45-01:50 | Admin paneli: analitik, denetim, muhasebe, kullanıcılar, destek, ayarlar, kategoriler, talepler, duyurular, veri; SW v4 | `8730b21`, `c5ed8b1`, `b72745a`, `1c7876b` |
| 11.09 02:07-03:35 | Admin'e ulaşamama; sahip admin yapıldı; inceleme kalktı, çoklu işletme, hizmet listesi | `625a225`, `eb3ec66`, `69919c3` |
| 11.09 03:49-05:21 | **Admin ayrı Vercel projesi**; alt menü; yeni ana sayfa (döviz kalktı), Yakınımda tam ekran, taksi, GebzemAI kartı, 5 sekmeli alt menü | `1d35d2e`, `dad74d0`, `8cb0179`, `1303da5`, `e7478c0`, `ed02d01`, `25b0d1a`, `8f78733`, `9782c62`, `6572d46`, `9d35f9d` |
| 11.09 05:32-06:21 | 22 maddelik UI paketi (firma sekmeleri, yorumlar, oda, kendi haberler, ATM); **Flutter + Go kararı** | `00b58db` |
| 11.09 06:36-12:08 | Ana sitede `/admin` → 307; **DB boşluk denetimi** (71 bulgu, 36 adım, 6 grup), service-role'süz admin, final polish, last mile | `0a8895f`, `aa70e40`, `ab67147`, `d6da510`, `8375c22`, `b9854f6`, `88270d2`, `b86401a` |
| 11.09 13:58-14:10 | Admin girişi telefon + şifre, `/admin/hesap` | `cff2197` |
| 11.09 14:38-16:10 | Sahibin 9 maddesi: yemek görseli, **hydration #418**, ayrı ilan sayfaları, adım adım kayıt/yardım, taksi telefonları; sağlık kartları, iş ilanı detayı | `a468479`, `4018eeb`, `f61cbe4`, `d3bf2ac` |
| 11.09 17:40-22:00 | 26 maddelik parti: **OTP açığı kapatıldı**, anında dağıtım, tatil modu, hesap başına 1 işletme, ilan video/istatistik, kullanıcı etkinlikleri, arama, rehber, doktorlar, GebzemAI; Google Cloud + R2 + OpenAI kurulumu; SW v5; **Google Maps her yerde**, Kocaeli faz A | `1c9eb03`, `9c9a164`, `9a7e593`, `5f9c63b`, `759382c` |
| 11.09 22:11-23:50 | Dalga 1: köşe ailesi, "Örnek" etiketleri kalktı, dikey kilit, daire pinler, sade rehber, doktor profilleri, sinema; KBB + rehber aktarımı | `6fc64e1` |
| 12.09 00:00-00:45 | Dalga 2a: geri dönüş takılması, arama rehber türleri + doktorlar, CC foto atıfları | `ea584ca` |
| 12.09 00:45-02:00 | **Faz B** (mahalle kalktı, `DistrictPicker`), Kocaeli metinleri, GebzemAI `doktor_bul`/`otobus_hatlari`/`internet_ara` | `1574a19`, `d4866f5` |
| 12.09 02:14-03:22 | "Kayıt olurken kod gelmiyor" teşhisi (SMS sağlayıcı yok, demo numarayla test), derin belgeler | `67d3427` |

---

## 14. Önemli kararlar

| Karar | Gerekçe | Kim |
|---|---|---|
| Önce PWA (Vercel + Supabase), sonra **Flutter + Go** native; PWA şartname. Plan: Flutter + Riverpod + go_router + FCM; Go (chi/Fiber) + pgx + sqlc + goose; tek OpenAPI sözleşmesinden sunucu ve istemci; sahibin sunucusunda PostgreSQL + PostGIS (KVKK: veri Türkiye'de); SMS Netgsm/İleti Merkezi + JWT; medya Cloudflare R2/Images/Stream; public web ve admin SEO için Next.js'te kalır, Go API'ye bağlanır. Sıra: bu paketi bitir → teknik doküman → Go → Flutter → veri taşıma ve mağaza (iOS/Android testi GitHub üzerinden) | "baştan yazarız ama sağlam olur" | Sahip |
| Telefon + OTP, şifre yok; girişsiz gezinme; admin'de telefon + şifre | Sürtünmesiz kayıt; admin güvenliği | Sahip |
| Uygulama içi mesajlaşma yok, yalnız telefon | Sahip isteği | Sahip |
| Supabase Tokyo + Vercel `hnd1`; yasal metinler "Tokyo/Japonya" der | Token proje açamadı; DB'ye yakınlık | Claude |
| Mor/lavanta tasarım, beyaz kart, siyah ana düğme, gölge/kenarlık yok, emoji yok, Google Sans, Lucide | Referans görseller | Sahip |
| Admin **ayrı Vercel projesi** `gbzsehir-admin`; uygulamada admin'e hiçbir yol yok; `/api/revalidate` + `REVALIDATE_SECRET` | "ayrı site", "uygulamaya gömme" | Sahip |
| Admin sitesinde service-role anahtarı yok; admin RPC'leri + pg_net kuyruğu | Anahtar kopyalama engellendi, en az yetki | Claude |
| İşletme incelemesi yok, anında yayın; **hesap başına 1 işletme**; tür kilitli; "personel arıyorum" yok | Sahip notları | Sahip |
| Hizmet talebi: firma numarasız görür, "İlgileniyorum", en fazla 5 firma, numara sonra; **anında dağıtım**, ilçe önceliği | Güven + KVKK; "direk düşmesi gerekiyor" | Sahip |
| Herkes etkinlik açar; kullanıcı etkinliği admin onaylı | Sahip isteği | Sahip |
| Haberler yalnız kendi yazılarımız (RSS gösterilmez) | Sahip isteği | Sahip |
| Kapsam Kocaeli 12 ilçe, mahalle yok; faz A/B/C ile geriye uyumlu geçiş; ad "Gebzem" kalır | Sahip isteği; güvenli geçiş | Sahip / Claude |
| Haritalar Google Maps; Google POI'leri gizli, daire pinler; detaylarda dokununca yükleme | Sahip isteği + kota | Sahip / Claude |
| Demo OTP yalnız demo aralığı + (12.09 sahip kararıyla, `2026091387`) hesabı olmayan yeni kayıt; onaylı hesaplara ve admin'e kod gösterilmez; gerçek hesaplara test kodu yok | Kritik açık; SMS yokken kayıt açık kalsın ("Yeni kayıtta göster"), kalıcı riski sahip kabul etti | Claude + Sahip |
| `duty_data_mode` demo/off/live; demo nöbet etiketli | Yanıltıcı veri olmasın | Claude |
| Doktor bilgisi internetten toplanmaz; `consent_confirmed_at` zorunlu | KVKK | Claude |
| GebzemAI: önce DB, internet yalnız sonuç yoksa; tanı yok; 5 USD/gün, 20 soru/kişi; **sahip açar** | Maliyet ve doğruluk | Sahip / Claude |
| Yasal metin değişikliği = yeni sürüm (Çerez 0.2, KVKK 0.3 taslak); yayını sahip yapar | Yayınlanan sürüm dondurulur | Claude |
| İçe aktarılmış rehber yerleri silinmez, gizlenir; `locked` admin düzenlemesini korur | Yeniden aktarımda geri gelmesin | Claude |
| Fotoğraflar yalnız serbest lisanslı ve atıflı | Telif | Sahip / Claude |
| Ham Kocaeli verisi `kocaeli/` git dışı | Lisans/boyut | Claude |
| SMS sağlayıcı sonraya (İleti Merkezi önerisi) | "sonra yaparız" | Sahip |

---

## 15. Hatalar ve dersler (en önemlileri; ayrıntı `OTURUM.md` bölüm 4)

1. **Kapsam aşımı** (global mor tema; "sadece anasayfaya yap dedin") → yalnız isteneni değiştir; ortak dosya için önce sor.
2. **Trigger yetki yükseltme** (kullanıcı kendini admin yapabildi) → RLS/trigger'ı gerçek kullanıcı rolüyle uçtan uca test et.
3. **Demo OTP gerçek numaraların kodunu veriyordu** → test kısayolu her zaman demo aralığıyla sınırlı; etkisini sahibe önceden söyle.
4. **Şifre ve test kodu sohbete açık yazıldı** → gizli değer asla sohbete, belgeye, çıktıya yazılmaz.
5. **Profilde admin linki** (kurala aykırı; "allah aşkına iyi misin?") → kuralları açıklama yaparken de uygula.
6. **Admin'de `createAdminClient()`** (anahtar yokken çöktü) → admin kodunda yok; engeli aşmaya çalışma.
7. **Soruyu cevaplamadan işe devam / "bekle" dendiğinde araç kullanımı** → önce cevap, "bekle"de dur.
8. **"Ayrı site" ve "şifreli admin girişi" yanlış anlaşıldı** → temel beklentiyi (giriş yöntemi, deploy biçimi) tek cümleyle teyit et.
9. **Deploy biriktirme** ("uygulama güncel mi?") → hazır olanı parça parça deploy et.
10. **10 işletme sınırı doğrudan insert ile aşılabiliyordu; `renew_listing` ilan sınırını atlatıyordu** → kısıtı DB/RLS'te de koy; definer RPC yollarını ayrıca denetle; deploy öncesi karşıt inceleme.
11. **Open redirect** (`safeNextPath`) ve **sahte `X-Forwarded-For`** → kontrol karakteri/ters bölü reddi; IP'de önce `cf-connecting-ip`, sonra en sağdaki XFF.
12. **`alter default privileges ... revoke` etkisizdi** → private fonksiyonlara tek tek revoke.
13. **`PGRST201`** (canlıda `/firma` 500) → FK ekleyen migration sonrası embed ipucu ve canlı sayfa kontrolü.
14. **Hydration #418** → prod build'de, sunucu HTML ↔ DOM farkıyla teşhis; paylaşılan layout'ta yola bağlı yapı yok; `suppressHydrationWarning` yalnız metni kurtarır.
15. **Tip üretimi canlıda olmayan tipleri sildi** → migration canlıya gitmeden `gen-types` çalıştırma; tek yerden koordine et.
16. **Git Bash yol dönüşümü** (sayfalar `/offline`'a düştü, iki kez) → `MSYS_NO_PATHCONV=1`; önce girdiyi doğrula, sonra ortamı suçla.
17. **Test betiği hatası uygulama hatası sanıldı** (KVKK kutusu, yanlış metin, `type:` ayırıcısı) → FAIL'de önce testi doğrula.
18. **PowerShell tuzakları** (Türkçe commit mesajı bölündü, `Set-Content` BOM ekledi, tırnaklı SQL bozuldu) → `git commit -F`, SQL'i Write ile dosyaya yaz.
19. **Yanlış barındırma bilgisi** (yasal taslak "AB" diyordu) → hukuki metne altyapı bilgisini gerçek ayardan oku; servis değişince yasal metni güncelle.
20. **Devir belgesi çok kısa kaldı** ("sohbet kapanırsa patlarız") → belgeler baştan derin tutulur, her büyük işten sonra güncellenir.
21. **Destek iç notu gönderene görünüyordu** → satır bazlı RLS sütun gizlemez; gizli alanı ayrı tabloya koy (`support_notes`, `report_notes`).
22. **Ajan regex'e gerçek NUL baytı yazdı** → kaynakta kontrol karakteri tara; `String.fromCharCode(0)` kullan.
23. **Taşınan özelliğin eski adresi 404 verdi** (`/admin`) → taşınan her adres yönlendirilir (307).
24. **Tasarım yenilemesinde işlev değişti** (iş ilanı detayı) → işlev değişikliklerini ayrı raporla, onaya sun.
25. **"DB askıya al" dendiği hâlde migration uygulandı** → küçük şema değişikliği gerekiyorsa önce sahibe söyle.
26. **Karakter sayımı uyuşmadı** → istemci `Array.from(text).length`, sunucu `char_length`; aynı birimle say.
27. **Olmayan kolon adı (42703)** → sorgudan önce kolonu şemadan kontrol et.
28. **ISR önbelleği yeni veriyi gizledi** (300 sn) → doğrulamayı API ile yap ya da önbelleği tazele.
29. **Kısmi geri almadan sonra import kırıldı** → geri almadan sonra tsc çalıştır.
30. **Gerçek admin hesabına bağlı demo firmalar** → betikle değil ayrı SQL ile temizlenir; yoksa audit tetikleyicisi gerçek admin adına kayıt yazar.
31. **Görsel kesimi** → sahibin PNG'lerinde dama deseni resme gömülü olabilir; sabit eşik değil ölçülen gri aralık kullan, sonucu gözle kontrol et.
32. **Windows:** `Remove-Item` korumalı yol engeli → `git clean -- <yol>` ya da `node -e "fs.rmSync(...)"`; gcloud başarılı işlemi PowerShell'de
    "RemoteException/stderr" gibi gösterir; durdurulan arka plan sunucusunun "exit 127/255" raporu hata değil; ripgrep iç içe süslü parantezli
    glob kabul etmez; tsx testlerinde `server-only` stub'lanır; scratchpad'den `sharp` için `createRequire` gerekir.
33. **Çok ajan tek çalışma ağacında** → katı dosya sahipliği; tam tsc'yi ajanlar bitince değerlendir; hâlâ yazılan dosyaları commit'e katma.
34. **Engel süresi** → `now()+876000h` (Auth "infinity" okuyamıyor); boolean ban yerine `admin_set_user_status`.

---

## 16. Açık işler ve sahibin onayını bekleyenler (`docs/PROJE-DURUMU.md` 4.2 / 4.3 ile aynı)

### 16.1 Sahibin kararı / onayı bekleyenler
1. **`2026091386_districts_phase_b.sql`**: dry-run tamam, canlıya uygulama güvenlik filtresine takıldı; arayüz buna bağlı değil. Onay gelirse:
   `node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/2026091386_districts_phase_b.sql`, ardından `gen-types`.
   **`2026091387_otp_signup_on_screen.sql`** + OTP arayüz değişiklikleri: commit edilmedi; canlıda olup olmadığı doğrulanmadı (bölüm 5.7).
   Canlı değilse dry-run → sahip onayı → uygula; sonra kodla birlikte commit + deploy.
2. **GebzemAI'yi açmak** (Admin → GebzemAI). Bütçe 5 USD/gün; OpenAI panelinde aylık limit önerildi.
3. **Yasal taslaklar** Çerez 0.2 ve KVKK 0.3 yayımlanmayı bekliyor; şirket bilgisi yer tutucuları ve avukat incelemesi (Tokyo barındırma,
   OpenAI/ABD, Cloudflare, arama istatistikleri, yurt dışı aktarım).
4. **SMS sağlayıcı** (bölüm 6.5), **gerçek nöbet kaynağı** (NosyAPI ya da Eczacı Odası izni), **GTFS sefer saatleri** (`stop_times`).
5. **Sinema kaynağının şartları** (Paribu Cineverse tekrar kullanım yasağı).
6. **Anahtarlar:** sohbete yapıştırılan bütün anahtarların yenilenmesi (Supabase, Vercel, GitHub, OpenAI), OpenAI/Google harcama limitleri,
   Cloudflare `gbzsehir-kurulum` token'ının silinmesi; admin başlangıç şifresi değişti mi.
7. **Yayın öncesi:** demo veri temizliği (sahibin hesabındaki demo işletmeler Kule Kahve, Mor Salkım Otel, Parlak Temizlik, "Hjnm" için karar),
   `JOB_LOCATIONS` Kocaeli'ye, "Kocaeli Gündemi" adı, gerçek destek telefonu/e-postası, Parlak Temizlik tatil modu.
8. **166 gezilecek yerin** serbest lisanslı fotoğrafı yok (admin'den eklenebilir).
9. Sahibin yanıtlamadığı küçük sorular: iş ilanı detayındaki üç işlev değişikliği, Kişisel bilgilerde Ad/Soyad tek kutu, engelli firmanın
   telefonunun müşteriye gizlenmesi.

### 16.2 Sırada (teknik)
1. **Faz C:** neighbourhood tabloları/kolonları/RPC alanlarını kaldır (`@deprecated` işaretliler).
2. GPS yokken uzaklık ilçe merkezinden ölçülüyor ("merkeze" ibaresi ya da yalnız GPS'le gösterme; ürün kararı).
3. Hava durumu ve namaz vakitleri Gebze merkezine göre; ilçeye göre yapılabilir. `roll_demo_duty` yalnız Gebze.
4. Admin 2FA (TOTP), Cloudflare Turnstile, repo'nun OneDrive dışına taşınması.
5. Soft 404: `/firma/<olmayan>` ve `/haberler/<olmayan>` HTTP 200 dönüyor (SEO).
6. Kullanılmayan `maplibre-gl`, `react-map-gl` paketleri kaldırılabilir.
7. İlan videosu gerçek yüklemeyle uçtan uca test; eski admin ekranlarındaki işlemler (İşletmeler, İlanlar, Şikayetler, dekont yükleme) tarayıcıda tek tek test.
8. Rehberde 314 kayıt doğrulama bekliyor, 108 kayıtta pin yok; 6 isimsiz taksi durağının numarası yok; Yardım formunda fotoğraf ekleme yok.
9. Sonra Flutter + Go: önce teknik doküman (şema, OpenAPI, ekran/akış listesi, iş kuralları), GitHub üzerinden iOS/Android build.
10. Doğrulanmadı: `editor/hours-editor.tsx` kenarlık sınıfları, `image-uploader.tsx` kesikli kutu ve `divide-y` ayırıcılar kalmış olabilir
    (tasarım kuralına aykırı); aramada "KOÜ Ücretsiz Otopark" 3 kez çıkıyor; ana sayfada 483 ms'lik uzun görev.
11. Kategori metnindeki bir kelime yüzünden işletme birden fazla alt kategoride çıkabiliyor (ör. Hacıhalil Ev Yemekleri Tatlı'da da).
12. Yasal taslaklar Admin → Ayarlar → Yasal metinler'den yayımlanır; yurt dışı aktarım bölümünde "[Hukuki inceleme]" yer tutucusu var.
13. GTFS sefer saatlerinin kaynağı KBB/Ulaşımpark; KocaeliKart ücret tablosu yok. OSM'de ATM az; eksikler admin'den girilir.
14. Bilinen zararsız sorunlar, kovalama: build'deki "Google Sans font override" uyarısı, `/profil/bildirimler` dev'de 500 (Turbopack HMR), `gen-types` exit 9.

---

## 17. Yapma listesi (asla)

- Token, anahtar, şifre, OTP kodu, gerçek kullanıcı telefonu ya da `.env.local` içeriğini dosyaya, commit'e, belleğe, sohbete veya çıktıya **yazma**.
- `.env*`, `kocaeli/`, scratchpad dosyalarını, oturum JSON'larını **commit etme**. Gizli taramasız commit atma; `git add -A` ile toplu ekleme yapma.
- Başka projelere dokunma: Vercel `gebzem`, `gbz-ver`, `2c-gebzem` ve ekipteki diğerleri; GitHub `gbz-app/gebzem`, `gbz-app/gbz-ver`;
  Google Cloud `gebzem-app-push` (varsayılan gcloud yapılandırmasını değiştirme); Cloudflare `gbz-a2cloud`, D1, Pages.
- gcloud komutunu `--configuration=gbzsehir --project=gbzsehir-rehber` olmadan çalıştırma.
- Uygulamadan admin'e link, bildirim ya da push verme. Admin kodunda `createAdminClient()` kullanma. Admin projesine `SUPABASE_SERVICE_ROLE_KEY` ekleme.
- Gerçek kullanıcıyı etkileyen canlı DB yazmasını sahibin onayı olmadan yapma; güvenlik sınıflandırıcısını aşmaya çalışma.
- Migration'ı dry-run'sız uygulama; `CREATE OR REPLACE`'i canlı tanımı okumadan yazma; migration canlıya gitmeden `gen-types` çalıştırma.
- `supabase/golive/otp_golive.sql`'i SMS sağlayıcı bağlanmadan çalıştırma (bütün girişler bozulur).
- Yayınlanmış yasal metni değiştirme (yeni sürüm aç); yasal taslağı sahip yerine yayınlama.
- GebzemAI'yi (`ai_enabled`) sahip yerine açma; demo veriyi sahip onayı olmadan silme.
- Başkalarına ait gerçek hesaplara sabit test OTP'si tanımlama. Onaylı hesaba ya da admine ekranda kod gösteren yol açma.
- Bilerek FK'siz bırakılan kolonlara (`events.venue_business_id`, `reviewed_by`) FK ekleme; ana sayfadan kaldırılanları geri getirme.
- Tasarımda gölge, kenarlık, emoji, logo, yatay sayfa kaydırması, yatay ekran, zoom ekleme; alt menüyü sayfaya göre farklılaştırma.
- Uygulama içi mesajlaşma ekleme; mahalle alanını geri getirme; OpenStreetMap karosu kullanma.
- Keşfet ile Şehir Rehberi listelerini ayırma (tek `ExploreMap`, bölüm 7.2); filtre çiplerini haritanın üstüne geri koyma.
- Telifli ya da lisanssız fotoğraf koyma; Google Places içeriğini kalıcı saklama; doktor bilgisini internetten toplama.
- Vercel bölgesini `hnd1`'den ya da Supabase bölgesini değiştirme; `vercel.json`'a cron ekleme (zamanlanmış işler pg_cron'da).
- "bekle" denince araç çağırma; sorulana cevap vermeden işe devam etme; istenmeyen kapsama girme.
- `public/sw.js`'i değiştirip `VERSION`'ı artırmamak; `src/lib/database.types.ts`'i elle düzenlemek.
