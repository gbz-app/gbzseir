# Gebze Şehir Uygulaması: Mimari ve Yol Haritası
*10 Eylül 2026. Şehir olarak Gebze varsayıldı ama altyapı çok şehirli kuruldu.*

Dostum, üç ayrı teklifi üç ayrı jüri puanladı. Bu plan toplamda en yüksek puanı alan **"hızlı / tek geliştirici" teklifi** üzerine kuruldu. Diğer iki tekliften jürilerin "mutlaka al" dediği fikirleri ekledim ve jürilerin bulduğu hataları düzelttim. Emin olmadığım her şeyin yanında **(doğrulanmadı)** yazıyor. Hukuki kısımlar araştırma özetidir, avukat görüşü yerine geçmez.

---

## 1. Kısa cevap: React Native mi Flutter mı?

**Karar: React Native + Expo. Flutter kullanma.**

Gerekçeler (PWA'dan geçiş açısından):

1. **PWA'daki kodun önemli kısmı mobil uygulamaya taşınır.** PWA TypeScript/React ile yazılacak. Şu parçalar Expo'ya olduğu gibi geçer:
   - zod şemaları
   - Armut tarzı soru akışı motoru
   - API istemcisi ve TanStack Query hook'ları
   - nöbet gününün 08:30'da başlaması kuralı
   - tr-TR tarih, fiyat ve telefon formatlama
   - mesafe hesapları ve i18n metinleri

   Mantık katmanının kabaca %70-90'ı yeniden kullanılır. Bu benim tahminim, ölçülmüş bir veri değil. Flutter'da bunların hepsi Dart ile baştan yazılır ve web ile mobil arasında birbirinden kopan iki kural seti oluşur.
2. **SEO yüzünden web tarafı zaten Next.js olmak zorunda.** Flutter web ekranı canvas'a çizer. Flutter'ın kendi SSS'i de indekslenmesi gereken içerik için uygun olmadığını söylüyor. Expo web'in sunucu tarafı render'ı (SSR) hâlâ alfa aşamasında (`unstable_useServerRendering`), react-native-web ise bakım modunda. Nöbetçi eczane, ilan ve gezilecek yer sayfaları trafiğini Google'dan alacak.
3. **Uygulamanın içeriği liste, form, harita, konum, kamera ve push bildirimi.** Flutter'ın çizim ve animasyon gücü burada bir şey kazandırmaz.
4. **Web, API, admin ve mobilde tek dil kullanılır.** Tek geliştirici için büyük verim demek. Türkiye'de React/TS bilen geliştirici bulmak da daha kolay görünüyor. Bunu destekleyen resmi bir anket bulamadım, karar da buna dayanmıyor.
5. **Native'e geçmenin asıl sebebini Expo hazır karşılıyor.** Hizmet veren firmaların iPhone'larına güvenilir bildirim, expo-notifications ve ücretsiz Expo push servisiyle çözülüyor. Bunlara ek olarak EAS Build/Update, expo-location, expo-image-picker/manipulator, SecureStore ve DOM components hazır geliyor.

**Dürüst uyarı:** Mobilde ekranlar (JSX) yeniden yazılır. Paylaşılan kısım mantık, şema, API ve tasarım token'larıdır. Kimseye "tek kod tabanı" sözü verme.

**Reddedilenler:**
- Flutter.
- Expo web'i ana site yapmak.
- iOS için Capacitor ya da canlı siteyi saran WebView. Apple 4.2 kuralı ("paketlenmiş web sitesi") yüzünden ret riski yüksek.

Android'de ara çözüm olarak PWA'yı Trusted Web Activity (TWA) olarak Google Play'e koyabilirsin.

---

## 2. Yol haritası özeti (PWA prototip → mobil uygulama)

Süreler **tek geliştirici** içindir. 2 geliştiriciyle kabaca %35-40 kısalır (tahmin).

| Aşama | Zaman | Kapsam | Çıkış kriteri |
|---|---|---|---|
| **0: Hazırlık ve izinler** | Hafta 1 | Repo, iskelet, Supabase, izin yazıları, SMS başlığı başvurusu, avukat randevusu, veri doğrulama | Boş PWA canlıda, izin yazıları gönderilmiş |
| **1: "Yakınımda" + haber başlıkları** (girişsiz, herkese açık) | Hafta 2-5 | Nöbetçi ve tüm eczaneler, cami ve namaz vakti, durak ve planlanan saatler, gezilecek yerler, RSS başlıkları | Herkese açık yayın, eczane ve muhtarlıklara QR, ilk SEO trafiği |
| **2: Hesap + 2. el ilan + iş ilanı** | Hafta 6-12 (+1-2 hafta Türkiye'ye taşınma) | Telefon OTP, profil, hesap silme, ilan çekirdeği, moderasyon, iş ilanları | **KVKK karar kapısı:** Açılış için avukat görüşü gerekli, avukat Path A'yı onaylamazsa Türkiye'ye taşınma da |
| **3: Hizmet Al** (önce concierge modunda) | Hafta 13-18 | Soru akışı motoru, sihirbaz, firma kaydı, eşleştirme, atomik kabul, Web Push ve SMS | Her kategoride ilçe başına en az 3 firma |
| **4: Pilot + Android TWA** | Hafta 19-22 | Kullanılabilirlik testleri, 20-30 firma, düzeltmeler, Google Play'de TWA | Talep kanıtlandı mı? iOS'taki firmalar talepleri kaçırıyor mu? |
| **5: Expo uygulaması** (önce firma modu) | Hafta 23-36 (~3 ay) | Firma modu ve push, yakınımda (native harita), sihirbaz, kamerayla ilan verme, App Store | TestFlight → App Store, Expo build TWA'nın yerine geçer |
| **6: Ölçek ve gelir** | Ay 9 ve sonrası | Firma kredisi veya abonelik, vitrin ilan, maskeli arama, Diyanet API, ikinci şehir | |

Özet sıra: önce hiçbir şeye bağımlı olmayan salt okunur hub, sonra ilanlar, en son iki taraflı pazar yeri. Her aşama tek başına işe yarar. Sonraki aşama gecikse bile elinde yayında bir ürün olur.

---

## 3. Teknoloji yığını

| Katman | Seçim | Not |
|---|---|---|
| **Repo** | pnpm workspaces. Turborepo, Expo gelince eklenir. Node 22/24 LTS, TypeScript strict | Repoyu **OneDrive'dan çıkar** ve `C:\dev\gbzsehir` altına taşı. pnpm symlink'leri ve Docker bind mount'ları OneDrive senkronunda EPERM hatası verir ve kurulumu yavaşlatır. |
| **PWA framework** | Next.js **16.3.x (en az 16.3.3)**, App Router, SSR/ISR, React 19.2, Turbopack | 16.3.3, Ağustos 2026'daki kritik RCE yamalarını içeriyor. Güncellemeleri Renovate ile otomatik takip et. **Server Actions kullanma**, iş mantığı API'de durur. |
| **PWA katmanı** | `@serwist/turbopack` | Service worker bir route handler üzerinden sunulur. Kararlı sürüm numarası **doğrulanmadı** (9.5.x mi, 10.x preview mı), sabitlemeden önce npm'den kontrol et. |
| **UI** | Tailwind CSS v4 + shadcn/ui (drawer için vaul, bildirim için sonner) | Mobil öncelikli, alt sekme çubuğu: Ana Sayfa / Yakınımda / İlanlar / Hizmet Al / Profil |
| **Harita (web)** | MapLibre GL JS **5.24.x'e sabitli** + `react-map-gl/maplibre` v8, OpenFreeMap "liberty" | v6 sadece ESM ve WebGL2 destekliyor, react-map-gl ile uyumu doğrulanmadı. Canlıya geçince Kocaeli PMTiles kendi sunucunda. Harita isteğe bağlı açılır, sayfalar önce liste gösterir. |
| **Harita (mobil)** | react-native-maps 1.29 (varsayılan). Alternatif: @maplibre/maplibre-react-native v11 (yalnız New Architecture) | Google Maps SDK kullanım ücreti $0 ama **API anahtarı, faturalı hesap ve Google logosu/atfı zorunlu**. |
| **Veritabanı** | Supabase Pro, Frankfurt ($25): Postgres + PostGIS, pg_trgm, unaccent, ltree, pg_cron, pg_net | Free plan 7 gün hareketsizlikte uyutuluyor, demo için kullanma. Tüm şema, RLS ve SQL fonksiyonları git'te migration olarak durur. |
| **API** | Hono 4 + @hono/zod-openapi, Next route handler'a mount edilir (`app/api/[[...route]]`) | Tek dosya değişikliğiyle ayrı bir Node sunucusuna taşınır. OpenAPI'den openapi-fetch ile mobil istemci üretilir. |
| **Arka plan işleri** | pg_cron + pg_net → `/api/internal/*` (outbox + tekrar deneme taraması). Ağır ETL işleri (KBB, GTFS) GitHub Actions'ta | İş fonksiyonları düz TS olarak yazılır. Türkiye'ye taşınınca (Path B) aynı fonksiyonlar **pg-boss 12.x** worker'ında çalışır. v10 eski, ondan başlama. |
| **Auth / SMS OTP** | Supabase telefon OTP + **Send SMS Hook** → İleti Merkezi (öncelikli OTP), Netgsm OTP yedek. Yalnız +90 5xx numaralar. Turnstile. | Hook'un toplam süre bütçesi **5 saniye**, tekrar denemeler dahil. Sağlayıcı çağrısını 2 saniye altında tut. JWKS doğrulaması için **asimetrik JWT anahtarlarını** aç. Yalnız telefonla giriş olduğu için Sign in with Apple gerekmiyor. |
| **Bildirim** | Web Push (VAPID, `web-push`), iOS 18.4+ için Declarative Web Push. SMS. Admin uyarıları için Telegram botu. Aşama 5'te Expo push. | Payload'larda kişisel veri olmaz, çünkü push servisleri yurt dışında. |
| **Depolama** | Supabase Storage: `media` (herkese açık) ve `private-docs` (yalnız admin, kısa ömürlü imzalı URL) | Fotoğraf istemcide WebP 1600 px + 480 px küçük resim olarak yeniden kodlanır, EXIF/GPS silinir. **AVIF kullanma**, 16.3.3'te güvenlik nedeniyle kapatıldı. |
| **Arama** | Postgres `turkish` FTS + unaccent + pg_trgm, `search_norm` kolonu üzerinde | Metin tr-TR kurallarıyla küçük harfe çevrilir (I/ı/İ/i sorunu). Meilisearch ancak ihtiyaç doğarsa. |
| **Admin** | Refine v5 + @refinedev/supabase + antd SPA, Cloudflare Pages üzerinde, **Cloudflare Access** arkasında | Görsel akış editörü sonraya kalır. Soru akışları git'te JSON dosyası olarak durur. |
| **Hosting** | Vercel Pro (fra1) + Supabase Frankfurt. Next build'de `output: 'standalone'` açık. | Vercel Hobby ticari kullanıma kapalı. Path B hazır bekler: Türkiye'de VPS + Coolify + self-hosted Supabase. |
| **Gözlem** | Sentry (`beforeSend` ile telefon ve koordinat temizlenir), Umami (çerezsiz), Telegram | Path B'de GlitchTip ve Umami kendi sunucunda. |
| **Mobil** | O gün güncel Expo SDK (bugün SDK 57 / RN 0.86), Expo Router, EAS, Uniwind, TanStack Query, react-hook-form + zod, Zustand | Expo SDK'ları RN'in bir sürüm gerisinden gelir. RN çekirdeğini değil, Expo'nun desteklediği sürümü takip et. |

---

## 4. Mimari

### Temel kurallar
1. **Mantık için yalnız iki yüzey var:**
   - (a) SQL fonksiyonları (RPC) + RLS'li görünümler,
   - (b) Hono `/api/v1`.

   Server Component'ler de aynı `packages/api` istemcisini kullanır. Yalnız web'e özgü veri yolu yok, bu yüzden Expo tüm backend'i hazır bulur.
2. `packages/core` React, DOM ya da Next import edemez. Bunu eslint `no-restricted-imports` ile zorunlu kıl.
3. **Tek URL ağacı** (`core/routes.ts`): web sayfaları, SMS linkleri, push payload'ları ve ileride Expo Router aynı yolları kullanır. `assetlinks.json` baştan sunulur, TWA için zaten gerekli.
4. **Taşınabilirlik:** Edge Function yok, SQL git'te, Next standalone Docker imajı üretiliyor. Supabase'e özgü tek parça Auth hook'ları.

### Bileşen diyagramı

```
┌──────────────────────────────── İSTEMCİLER ─────────────────────────────────┐
│  PWA (Next.js 16.3, Vercel fra1)          Admin (Refine SPA)                 │
│  - SSR/ISR SEO sayfaları + JSON-LD        Cloudflare Pages + Access          │
│  - Giriş sonrası alanlar, /firma-panel    Mobil (Expo, Aşama 5)              │
│  - Serwist SW, Web Push, IndexedDB outbox                                    │
└──────────┬──────────────────────────────────────┬────────────────────────────┘
           │ (a) supabase-js: RLS okuma + RPC      │ (b) REST /api/v1 + Supabase JWT
           ▼                                      ▼
┌────────────────────────────────┐    ┌────────────────────────────────────────┐
│ SUPABASE (Frankfurt)           │◄───│ HONO API (Next route handler)          │
│ Postgres + PostGIS, RLS        │    │ yazma + zod/form-engine doğrulama,     │
│ nearby_pois, duty_pharmacies,  │    │ rate limit, reveal-phone, contact-evt, │
│ accept_lead, match_providers   │    │ /hooks/send-sms, /internal/* işler,    │
│ Auth (OTP), Storage            │───►│ /revalidate (ISR tag temizleme)        │
│ pg_cron + pg_net ──(tetikler)──┼───►│ Kanal adaptörleri                      │
└──────────┬─────────────────────┘    └───────┬────────────────────────────────┘
           │ outbox satırları                 │
           ▼                                  ▼
┌──────────────────────────┐     ┌─────────────────────────────────────────────┐
│ VERİ ALIMI               │     │ BİLDİRİM                                    │
│ GitHub Actions: KBB açık │     │ Web Push (VAPID) · SMS: İleti Merkezi /     │
│ veri, GTFS (aylık)       │     │ Netgsm · Telegram (admin) · Expo push       │
│ pg_cron: NosyAPI,        │     │ (Aşama 5) · notification_delivery log       │
│ CollectAPI, AlAdhan, RSS │     └─────────────────────────────────────────────┘
└──────────────────────────┘

Path B (Türkiye): Türkiye'de VPS + Coolify → self-hosted Supabase (GoTrue, PostgREST,
Storage) + Next standalone + Hono + pg-boss 12.x worker + kaynak portunu loglayan proxy.
```

### Monorepo klasör yapısı

```
C:\dev\gbzsehir\                (pnpm workspaces; Turborepo Expo gelince)
├─ apps/
│  ├─ web/                      Next.js 16.3 PWA + Hono API
│  │  ├─ app/[city]/            nobetci-eczane, eczaneler, camiler, duraklar, durak/[id],
│  │  │                         gezilecek-yerler/[slug], ilanlar, ilan/[slug], is-ilanlari,
│  │  │                         is-ilani/[slug], haberler, hizmetler/[kategori]/(talep)
│  │  ├─ app/firma/[slug]/      herkese açık firma sayfası
│  │  ├─ app/(auth)/giris/      telefon OTP
│  │  ├─ app/(app)/             hesap, ilan-ver, talep/[code], firma-panel/*
│  │  ├─ app/api/[[...route]]/  Hono mount
│  │  ├─ app/sw.ts, manifest.ts, sitemap.ts, robots.ts, kaynaklar/, offline/
│  │  └─ src/server/            routes/v1, routes/internal, hooks/send-sms,
│  │                            adapters/{sms-iletimerkezi,sms-netgsm,webpush,telegram,expo}
│  ├─ admin/                    Vite + Refine v5 + antd
│  └─ mobile/                   (Aşama 5) Expo Router
├─ packages/
│  ├─ core/                     SAF TS: zod şemaları, form-engine, dutyDay (08:30),
│  │                            geo, trNormalize, format-tr, routes.ts, moderasyon kuralları
│  ├─ flows/                    hizmet akışları + ilan özellik şemaları (JSON, CI'da doğrulanır)
│  ├─ api/                      supabase istemci fabrikası, RPC sarmalayıcıları,
│  │                            openapi-fetch istemcisi, TanStack Query hook'ları
│  ├─ tokens/                   tokens.json → Tailwind @theme + RN teması
│  └─ config/                   tsconfig, eslint (import sınırları), prettier
├─ supabase/                    config.toml, migrations/, seed.sql, tests/ (pgTAP, Aşama 3)
├─ scripts/etl/                 kbb-opendata.ts (proj4), gtfs-import.ts, geo-seed.ts, places.csv
├─ .github/workflows/           ci, db-deploy, etl-weekly, gtfs-monthly
└─ docs/                        ADR'ler, veri lisansları, KVKK metin taslakları
```

---

## 5. Modüller

### 5.1 Yakınımda (eczane, nöbetçi eczane, cami, durak, gezilecek yer)

Hepsi tek bir `poi` tablosunda durur: `geography(Point)` + GiST indeksi. RPC `nearby_pois(kind, lat, lng, radius_m, lim)`, `ST_DWithin` ile adayları süzer ve `ORDER BY geog <-> nokta` ile en yakından sıralar.

| Özellik | Veri kaynağı | Riskler ve önlemler |
|---|---|---|
| **Tüm eczaneler** | KBB Açık Veri "Eczaneler" (CC BY; Gebze'de 95 kayıt, telefonlu). API: `kavisacikveri.kocaeli.bel.tr/api/public/OpenDataPublic/{id}` | Araştırmada JSON dosyası EPSG:5254 (TM30) koordinatlı GeoJSON olarak bulundu, fakat bir jüri bunu teyit edemedi ve kayıt meta verisi "Private" görünüyor. **Hafta 1'de kendin indirip doğrula.** proj4 ile WGS84'e çevir. CSV ISO-8859-9 kodlu. Ham indirmelerin kopyasını sakla. OSM ile boşluk doldurma sonraya kalır (ODbL yükü). |
| **Nöbetçi eczane** | Birincil: **NosyAPI** ($6/ay, 5k kredi). Çekim saatleri 09:05, 10:05, 11:05, 13:05, 15:05, 17:05, 19:35. Bu, NosyAPI'nin gerçek yenileme takvimine denk düşer. 4 ilçe için yaklaşık 850 kredi/ay. İkincil: **CollectAPI** 08:35'te (ücretsiz kotası **doğrulanmadı**). | Güvenlik açısından kritik özellik:<br>• Nöbet 08:30'da değişiyor, NosyAPI ilk kez 09:00'da yenileniyor.<br>• **Süresi bitmiş nöbet penceresi asla gösterilmez.** "23:59'A KADAR" gibi notlar ayrıştırılır.<br>• İki kaynak karşılaştırılır, uyuşmazsa Telegram uyarısı.<br>• 09:15'e kadar taze liste yoksa kırmızı "Liste doğrulanamadı" bandı ve kocaelieo.org.tr linki.<br>• Gündüz modu: hafta içi normal çalışma saatlerinde "En yakın eczaneler (çoğu açık)" ile nöbet listesi birlikte gösterilir. Kesin saatler doğrulanmadı.<br>• Her görünümde kaynak, "Son güncelleme" ve "Gitmeden önce arayın".<br>• **İzinsiz kazıma yok.** Kocaeli Eczacı Odası'ndan feed ya da izin iste. Gaziantep EO'nun JSON feed'i emsal gösterilebilir, jüri bunu teyit edemedi. NosyAPI'ye verinin kaynağını yazılı sor. |
| **Camiler** | KBB "Camiler" (CC BY; Gebze'de 124 kayıt, isimli) | OSM'de 104 caminin sadece 55'inde isim var. Belediye verisi daha iyi. |
| **Namaz vakti** | Prototipte AlAdhan `method=13` (Diyanet yöntemi, "experimental"), günlük ve ilçe bazında önbellekli. Canlıda Diyanet **Awqat Salah** API'si: başvuru gerekiyor, kota çok düşük (günde 10 çağrı), yılda bir kez çekilir. | Birkaç dakikalık fark kullanıcının gözüne batar. "Diyanet yöntemiyle hesaplanmıştır" etiketi konur. Diyanet başvurusunu hafta 1'de yap. |
| **Durak, hat, saat** | KBB resmî **GTFS** (CC BY, KentKart çıktısı, Ağustos 2026). Aylık GitHub Action. Gebze, Darıca, Çayırova ve Dilovası kutusu yaklaşık 2.060 durak. | 100 MB'lık `stop_times` akış halinde işlenir. "Kocaeli Test" ajansı atılır, 24:00+ saatler düzeltilir. Takvimde bayram yok: **`holiday_override`** tablosu kullanılır (resmî tatilde pazar tarifesi, Ramazan notu). Tüm saatler "planlanan saat" etiketi alır. Canlı süre için e-Komobil'e derin link. Marmaray/YHT elle girilir. M1 metro **açıldığı teyit edilince** eklenir. |
| **Gezilecek yerler** | KBB "Tarihi Yapılar ve Müzeler" (Gebze'de 9 kayıt) + elle seçilmiş 25-40 yer (Wikidata CC0 ile ID ve koordinat). Kendi metnin, kendi fotoğrafın ya da lisanslı Commons görselleri. | kocaeliyikesfet.com ve kulturportali.gov.tr'den metin kopyalama. Google Places kullanma: pahalı, önbelleğe alınamıyor, Google markası zorunlu. |
| **Harita** | OpenFreeMap (anahtar yok, ticari kullanım serbest, **SLA yok**) | Canlıda Kocaeli PMTiles R2 ya da kendi sunucunda. Harita isteğe bağlı, sayfa önce liste. Overpass'a ve tile.openstreetmap.org'a istemciden asla istek atılmaz. |

**Konum deneyimi:**
- Konum yalnız "Yakınımdakileri göster"e dokununca istenir (`enableHighAccuracy:false`, `maximumAge` 5 dk).
- Koordinat sunucuya gönderilmeden önce yaklaşık 100 m'ye yuvarlanır ve loglanmaz.
- Son konum localStorage'da tutulur (try/catch içinde). İlçe/mahalle seçici her zaman görünür, Gebze merkezi yaklaşık 40.80K, 29.43D.
- iOS ana ekran uygulamalarının konum iznini her oturumda yeniden sorduğu bildiriliyor. Bu topluluk raporu, resmî değil.

**SEO:**
- `/gebze/nobetci-eczane` ISR ile üretilir (`revalidate` 300 sn, veri alındıktan sonra `revalidateTag`).
- JSON-LD tipleri: Pharmacy, PlaceOfWorship, TouristAttraction.
- Bu sayfa arama trafiği için ana kanca.

### 5.2 İlanlar (2. el) + iş ilanları: ortak çekirdek

Tek bir `listing` tablosu (`type: classified | job`). Özellikler JSONB'de tutulur ve **hizmet akışlarıyla aynı form motoruyla** doğrulanır.

**Durum akışı:** `draft → pending_review → active → paused / expired / sold / filled / rejected / deleted`
- 30 gün geçerli. 3 gün kala hatırlatma gider, tek dokunuşla yenilenir.
- Satılan veya dolan ilan 7 gün sonra gizlenir. Süresi dolan ilan **410 ya da "Satıldı"** sayfası döndürür.
- Filtreli liste URL'lerinde canonical/noindex kuralları uygulanır.

**İletişim (mesajlaşma yok):**
- İlanda yayınlanabilecek tek numara **doğrulanmış giriş telefonu**. Serbest metin numara kabul edilmez.
- **2. el:** "Numarayı göster" dokunuşu hız sınırlıdır: anonim kullanıcıya Turnstile arkasında cihaz+IP başına günde 3-5, üyeye günde 30. Her gösterim `contact_event`'e yazılır. Ardından "Ara" (`tel:`) gelir. Masaüstünde numara formatlı gösterilir ve kopyalama düğmesi olur.
- **İş ilanı:** Telefon **giriş ya da üyelik şartı olmadan** görünür. Başvuru butonu yok, CV toplanmaz. İŞKUR'un iş ilanı sitelerine tanıdığı özel istihdam bürosu muafiyeti iletişim bilgisinin serbestçe erişilebilir olmasına bağlı. Bunu avukatla teyit et. Kazımaya karşı görünmez rate limit ve proof-of-work.
- Arama tıklaması: önce `fetch('/api/v1/contact-events', {keepalive:true, headers:{Authorization}})`, sonra `location.href='tel:+90…'`. sendBeacon kullanılmaz, çünkü Authorization başlığı gönderemez.

**Güven ve güvenlik:**
- Her kullanıcının **ilk 3 ilanı** ön moderasyondan geçer. Güvenilir kullanıcılar doğrudan yayınlar.
- Otomatik bayraklar:
  - IBAN (`TR\d{24}`)
  - "kapora", "ön ödeme", "kargo ile gönderirim", "kayıt ücreti"
  - metinde telefon numarası veya URL
  - EİDS'den kaçma denemeleri ("satılık daire", plaka regex'i)
  - iş ilanında yaş veya cinsiyet ayrımcılığı içeren ifadeler
- **Yasak kategoriler:** Emlak ve Vasıta (EİDS), ilaç, silah, canlı hayvan, alkol ve tütün.
- 2. el ilanlarda "Kapora veya ön ödeme göndermeyin" bandı.
- Şikayet, engelleme, gölge ban, telefon kara listesi, telefon başına günlük ilan limiti.
- Aşama 2 sonunda: kopya ya da çalıntı fotoğraf için pHash.

**İş ilanına özgü:**
- İlanı yalnız **kurumsal hesap (L1 doğrulanmış firma)** verebilir. Bu, "kayıt ücreti" isteyen sahte ilanlara karşı önlem. Ev yardımcısı veya bakıcı gibi küçük bir bireysel kategori isteğe bağlı açılabilir.
- Özellikler: pozisyon, çalışma şekli, vardiya, SGK, sektör (GOSB/OSB), maaş aralığı veya "gizli".
- JobPosting JSON-LD eklenir, fakat **Google'ın iş arama deneyimi Türkiye'de sunulmuyor**. Bundan trafik bekleme.

### 5.3 Hizmetler (Armut tarzı): akış

**Sihirbaz (müşteri):**
1. `/gebze/hizmetler/[kategori]` SEO sayfasından (ya da arama ve popüler kutucuklardan) bir **alt kategori** seçilir.
2. İstemci, kategorinin yayımlanmış `question_flow_version` JSON'unu çeker. **Her ekranda bir soru** gösterilir.
   - İlerleme çubuğu yalnız görünür sorulardan hesaplanır.
   - Her adım `?adim=N` olarak tarayıcı geçmişine yazılır, geri tuşu çalışır.
   - Tek seçimli sorular kendiliğinden ilerler.
   - Cevaplar localStorage'a otomatik taslak olarak kaydedilir.
3. Sistem adımları sona eklenir: Konum (ilçe/mahalle ya da "Konumumu kullan") → Zaman (Acil / belirli tarih / 1-2 hafta / esnek) → Fotoğraf (EXIF silinmiş) → Not → Özet → İletişim.
4. **OTP yalnız son adımda** istenir: 6 hane, 3 dk geçerli, 5 deneme, 60 sn sonra yeniden gönderim, `autocomplete="one-time-code"`, Android'de WebOTP. Hesap sessizce oluşturulur. KVKK notu: "Talebin ve numaran en fazla 5 firmayla paylaşılır." "Numaram gizli kalsın, firmaları ben arayayım" seçeneği vardır.
5. `POST /v1/service-requests`: sunucu cevapları **aynı form-engine ile** yeniden doğrular. `flow_version_id` + `answers_snapshot` saklanır. Durum `open` olur, kategori concierge modundaysa `admin_review` olur ve Telegram'a bildirim düşer.

**Eşleştirme ve bildirim:**

6. `match_providers()` önce kesin filtreleri uygular:
   - firma aktif ve duraklatılmamış
   - kategori ya da üst kategori eşleşiyor (`include_descendants`)
   - hizmet bölgesi talebi kapsıyor (ilçe, mahalle ya da `ST_DWithin` yarıçapı)
   - doğrulama seviyesi kategorinin istediği seviyede ya da üstünde
   - günlük lead limiti aşılmamış
   - müşterinin kendi firması değil ve müşteri tarafından engellenmemiş

   Sonra puanlar: 0.30 mesafe + 0.20 Bayes puanı + 0.15 yanıt oranı + 0.15 adalet (son 7 günde az lead alan öne çıkar) + 0.10 doğrulama + 0.10 profil doluluğu + küçük rastgelelik. Puan gerekçeleri `match_reasons`'a yazılır.
7. `dispatch_wave()`, 1. dalgada 8 firmaya lead açar. **PWA döneminde her yeni lead'de SMS gider**, abone olan firmaya ayrıca Web Push. SMS'te kişisel veri yok: "Gebze Osmanyilmaz: yeni Ev Temizligi talebi https://…/f/abc". Bu SMS, ana ekrana ekleme yapmamış iPhone'lu firmaların ilk 5 yarışında geride kalmasını önler.
8. 2 saatte kabul eden sayısı 2'nin altındaysa 2. dalga gider. 3. dalga komşu ilçelere (Darıca, Çayırova, Dilovası) genişler. En fazla 25 firma bildirim alır. Hiç aday yoksa durum `no_match` olur, müşteriye dürüst bir mesaj gider ve `unmet_demand` tablosuna yazılır. Bu tablo firma toplama listen olur.
9. Sessiz saatler 22:00-08:00: bildirimler kuyrukta bekler, acil kategoride firma izin verdiyse (çilingir, acil tesisat) hemen gider.

**Kabul (atomik):**

10. Firma anonim bir lead görür: kategori, kişisel veri içermeyen cevaplar, mahalle, yaklaşık konum dairesi, fotoğraflar, "Ayşe K.", "2/5 firma kabul etti". **"Kabul et ve numarayı gör"**:
```sql
UPDATE service_request
   SET accepted_count = accepted_count + 1
 WHERE id = $1 AND status = 'open' AND accepted_count < max_providers
RETURNING accepted_count;
-- satır dönmezse: lead = closed_full, firmaya "Bu talep doldu"
-- son slot dolunca: status = 'filled', bekleyen lead'ler kapatılır ve "doldu" bildirimi gider
```
11. Kabulden sonra firma ad, telefon ve "Ara" butonunu görür. Müşteri numarasını gizlediyse "Müşteri sizi arayacak" yazar. Her numara görüntüleme `contact_event`'e loglanır.
12. Müşteri sayfasında kabul eden firmaların kartları görünür: logo, Onaylı rozeti, puan, "Ara" butonu ve firmanın isteğe bağlı **tek yönlü** teklif notu (en fazla 280 karakter). Arama iki yönde de yapılabilir. **Sohbet yok.**
13. 48 saat sonra "Hizmet aldın mı?" SMS'i gider, ardından değerlendirme daveti. Değerlendirme yalnız lead'i olan ve işe alındığı teyit edilen firmaya yazılabilir.

**Pilot kuralları:**
- Her kategori `auto_dispatch=false` (**concierge**) başlar: admin talebi görür, "Eşleştir ve gönder"e basar.
- Kategori, ilçe başına **en az 3** aktif firma olunca otomatiğe alınır.
- Doğrulama seviyeleri:
  - L0: telefon doğrulandı
  - L1: vergi levhası ve VKN kontrol edildi, "Onaylı Firma" rozeti
  - L2: meslek belgesi var (elektrik, doğalgaz vb.)
- Belgelerin süresi dolunca gece çalışan iş seviyeyi düşürür.
- Soru akışları `packages/flows` altında JSON olarak durur: ev temizliği, boya/badana, nakliyat, su tesisatı, elektrik, klima, kombi, tadilat, özel ders, çilingir. `/dev/flow-preview` ile önizlenir. Görsel akış editörü Aşama 6'ya kalır.
- Gelir kancaları şemada hazır ama kapalı: `lead_price_credits=0`, cüzdan ve kayıt defteri (ledger) tabloları.

**Sonradan eklenebilecekler:**
- Kabulü "ilk 5 kazanır" yerine 10-15 dakikalık bir pencerede toplayıp puana göre dağıtmak.
- Netgsm veya Verimor ile maskeli numara.

### 5.4 Haberler

- Her 20 dakikada RSS toplanır. 10 Eylül 2026'da çalıştığı doğrulanan kaynaklar: yenigebze, gebzehaber, habergebze, gebzeninsesi, gebzehurses, golgegazetesi, ozgurkocaeli, bizimyaka, cagdaskocaeli, kocaelifikir, seskocaeli, kocaeli.bel.tr ve darica.bel.tr.
- **Yalnız** başlık, en fazla 280 karakter özet, kaynak, saat ve dış link saklanır. `content:encoded` içindeki tam metin ve fotoğraflar alınmaz. Bu, FSEK m.36'nın izin verdiği güvenli kalıp.
- Kendi haber sayfası yok, bölümün adı **"Gebze Gündemi (kaynaklardan derleme)"**. İlk yıl kendi editoryal haberini yazma, 7418 sayılı Kanun'un "internet haber sitesi" yükümlülüklerine girme.
- Gebze Belediyesi'nin RSS'i yok: `duyurular.html` günde bir kez, kibarca ve tanımlı user-agent ile çekilir. Belediyeden feed iste.
- Tekilleştirme: guid + normalize edilmiş başlık hash'i.
- Şubat 2026'da TBMM'ye sunulan "Dijital Telif ve Çevrimiçi Haber İçerikleri" teklifi ileride yükümlülük getirebilir. Takip et.

### 5.5 Profil (bireysel / kurumsal)

- Kişi her zaman bir `profile`dır: telefon (E.164, benzersiz), ad, rol, durum, KVKK metin sürümü, kanal bazlı pazarlama onayları.
- **Kurumsal** olmak = bir `business`'ın `business_member`'ı olmak (owner / manager / staff). Tek `business` varlığı üç rolde kullanılır: **hizmet veren**, **işveren** ve **esnaf satıcı**.
- Herkese açık sayfalar:
  - `/kullanici/:id`: ad ve soyadın baş harfi, üyelik tarihi, "telefon doğrulanmış" rozeti, ilanlar
  - `/firma/[slug]`: hizmetler, bölgeler, rozet, değerlendirmeler, açık iş ilanları, "Ara" butonu
- **Uygulama içi hesap silme** baştan var (Apple 5.1.1(v)): ilanlar yayından kalkar, talep ve lead'ler anonimleştirilir, `contact_event`'ler hash'lenmiş halde kalır.
- Her kullanıcı içeriğinde şikayet ve engelleme (Apple 1.2).

---

## 6. Temel veri modeli

| Alan | Tablolar | Önemli alanlar |
|---|---|---|
| Coğrafya | `city`, `district`, `neighbourhood` | slug, `centroid geography`, `polygon` NULL. Tüm içerik tablolarında `city_id` var, bu yüzden ikinci şehir şema değiştirmeden eklenir. |
| Kimlik | `profile` (1:1 `auth.users`), `consent_record` | phone (E.164), role, status (`active/restricted/banned/shadow`), `trusted_publisher`, `kvkk_notice_version`, `consent_sms_mkt`, `deleted_at` |
| Yakınımda | `poi`, `pharmacy_duty`, `prayer_times`, `place_detail`, `data_source_run` | `poi`: kind, `location geography(Point)` + GiST, source (`kbb/osm/gtfs/manual`), `source_ref`, license, `UNIQUE(source, source_ref)`. `pharmacy_duty`: `duty_start/duty_end` (timestamptz), source, `fetched_at`. `data_source_run`: son başarılı çekim, satır sayısı, hata. Admin'deki veri sağlığı ekranı bundan beslenir. |
| Ulaşım | `transit_route`, `transit_stop_route`, `stop_departure`, `holiday_override` | `stop_departure(stop_poi_id, route_id, headsign, service_day, dep_minute)`, indeks `(stop, service_day, dep_minute)` |
| Haber | `news_source`, `news_item` | `feed_url`, `permission_status`. `news_item`: title, summary (en fazla 280), url, `published_at`, `title_hash`, `UNIQUE(source_id, guid)` |
| Firma | `business`, `business_member`, `provider_profile`, `provider_category`, `provider_service_area`, `provider_document`, `provider_review` | `tax_no_enc` (şifreli), `verification_level` 0-3. `provider_profile`: `accepts_leads`, `paused_until`, `daily_lead_cap`, sessiz saatler, `urgent_opt_in`, puan ve yanıt istatistikleri. Hizmet bölgesi: `district / neighbourhood / radius` + GiST |
| Hizmet | `service_category`, `question_flow`, `question_flow_version`, `service_request`, `request_media`, `request_status_history`, `lead`, `unmet_demand` | Kategori: ltree yolu, synonyms, `max_providers=5`, `notify_pool_size=8`, TTL'ler, `min_verification_level`, `auto_dispatch`. Akış sürümü **yayımlanınca değiştirilemez**. Talep: `public_code`, `answers` + `answers_snapshot`, özel konum + yuvarlanmış `display_location`, `hide_phone`, `accepted_count`, durum makinesi. Lead: `wave_no`, `match_score`, `match_reasons`, status, `offer_note(280)`, `UNIQUE(request_id, business_id)` |
| İlan | `listing_category`, `listing`, `listing_media`, `listing_favorite` | Kategori: `requires_business`, `is_banned`, `max_free_active_per_user`. İlan: `type`, JSONB `attributes` (GIN + generated kolonlar), `price_try`, yaklaşık konum, status, `expires_at`, `featured_until`, `bump_at`, sayaçlar, `search_norm` + `search_tsv` |
| İletişim | `contact_event` | `subject_type` (lead/listing/job/business/pharmacy), `event` (`phone_reveal/call_click`), direction, `ip_hash` |
| Bildirim | `outbox`, `notification`, `notification_delivery`, `push_subscription`, `device_token`, `notification_preference` | outbox: `status`, `attempts`, `run_after`. delivery: channel, `provider_msg_id`, status, error. Web Push aboneliği 404 ya da 410 dönünce silinir. |
| Güven ve hukuk | `report`, `user_block`, `moderation_rule`, `phone_blacklist`, `legal_notice`, `traffic_log`, `audit_log`, `legal_text` | `report.sla_due_at` (kullanıcı şikayeti 24 saat). `legal_notice.due_at` (5651 m.8/A kararları **4 saat**). `traffic_log`: IP, port, zaman, `user_id`, günlük hash zinciri, 2 yıl saklanır. |
| Gelir (kapalı) | `provider_wallet`, `credit_transaction` (append-only), `credit_package`, `plan`, `business_subscription`, `payment` | iyzico / PayTR, e-Arşiv |

---

## 7. PWA prototipinde gerçek olanlar ve mock olanlar

| Gerçek | Mock / manuel / ertelenen |
|---|---|
| Nöbetçi ve tüm eczaneler, camiler, namaz vakti, durak ve planlanan saatler, gezilecek yerler, haber başlıkları | **Canlı otobüs varışı** yok, e-Komobil'e link |
| Telefon OTP, profil, hesap silme, KVKK onayları | **Otomatik eşleştirme**, concierge modunda başlar, kategori olgunlaşınca açılır |
| 2. el ve iş ilanı yayınlama, fotoğraf yükleme, moderasyon, şikayet ve engelleme | **Ödeme ve firma kredisi** yok (şemada hazır, kapalı) |
| Hizmet sihirbazı, talebin saklanması, lead, atomik kabul, `tel:` ile arama | **Görsel akış editörü**, akışlar git'te JSON |
| Web Push + SMS + Telegram | **Native push** Aşama 5'te |
| Postgres Türkçe arama | Meilisearch ya da Algolia yok |
| | Değerlendirmeler pilotta küçük ölçekli, maskeli arama Aşama 6'da |
| | Geliştirmede Supabase'e **yalnız test verisi** girer, gerçek kişisel veri avukat görüşünden sonra |

### iOS ve Android PWA kısıtları

| Konu | iOS (Safari / WebKit) | Android (Chrome) |
|---|---|---|
| Kurulum | Otomatik yükleme istemi yok. Kendi "Ana ekrana ekle" talimat sayfanı göster (`navigator.standalone` false ise). iOS 26'da ana ekrana eklenen site varsayılan olarak web uygulaması gibi açılıyor. | `beforeinstallprompt` var. Manifest'e `description` ve `screenshots` eklersen mağaza benzeri zengin kurulum penceresi çıkar. |
| Push | **Yalnız ana ekrana eklenmiş PWA'da** (iOS 16.4+) ve kullanıcı dokunuşuyla izin istenerek. 18.4+ Declarative Web Push destekliyor. Safari sekmesinde push yok. | Normal sekmede de çalışır. |
| Arka plan | Background Sync ve Periodic Sync **yok**. Bekleyen gönderimler IndexedDB outbox'ta tutulur, `online` olayında ya da bir sonraki açılışta tekrar denenir. | Background Sync var, ama sadece bonus olarak düşün. |
| Depolama | Nadir ziyaret edilen ve kurulmamış sitelerin verisi silinebilir. Asıl kaynak her zaman sunucu. | Daha toleranslı. |
| Konum | HTTPS şart. Ana ekran uygulamasında iznin her oturumda tekrar sorulduğu bildiriliyor (topluluk raporu). | Normal davranış. |
| Arama / kamera | `tel:` ve `<input capture=environment>` çalışıyor. | Çalışıyor. |
| Mağaza | Sarmalayıcı uygulama 4.2 riski taşır, iOS için Expo uygulaması gerekir. | **TWA** (Bubblewrap + Digital Asset Links) kabul edilen bir yol. |

**Service worker kuralları:**
- Nöbetçi eczane: NetworkFirst, 3 sn zaman aşımı, her zaman "Son güncelleme" ile.
- POI verisi: StaleWhileRevalidate.
- Görseller: CacheFirst ve LRU sınırı.
- **Kimlik doğrulamalı yanıtlar asla önbelleğe alınmaz.**
- Service worker sürümlenir ve "Yeni sürüm var" uyarısı gösterilir.

---

## 8. Hukuki ve operasyonel dikkat noktaları (kısa)

Bu bölüm avukat görüşü değildir. Sabit ücretli bir hukuk incelemesi ayarla.

- **KVKK:**
  - Supabase Frankfurt ve Vercel'de veri tutmak **yurt dışına aktarımdır**. Açık rıza bunu karşılamaz. Kurulun standart sözleşmesi imzalanmalı ve 5 iş günü içinde bildirilmeli.
  - Supabase veya Vercel'in Türk standart sözleşmesini imzaladığına dair **bir kanıt yok**, Supabase DPA'sı AB SCC'lerini referans alıyor. **Gerçekçi beklenti Path B: Türkiye'de barındırma.**
  - Karar kapısı: üyelik herkese açılmadan önce avukat görüşü alınır. Onay çıkmazsa Aşama 2 içinde Türkiye'deki VPS'e taşınılır (Coolify + self-hosted Supabase + Next standalone).
  - Aydınlatma metni, pazarlama onayları kanal bazında ve varsayılan işaretsiz, veri sahibi başvuru süreci, saklama ve imha politikası.
  - VERBİS: 50'den az çalışan ve 100M TL altı bilanço ile büyük ihtimalle muafsın.
  - Sentry, Turnstile ve push servisleri de yabancı işleyen. Payload'lar kişisel veri içermez, aydınlatma metninde belirtilir.
- **5651 (yer sağlayıcı):**
  - **BTK'ya yer sağlayıcı bildirimi zorunlu** görünüyor (bildirmezsen 10-100 bin TL idari para cezası, avukatla teyit et). KEP adresi al.
  - m.8/A kaldırma ve erişim engeli kararları **4 saat** içinde uygulanır. Kullanıcı şikayetleri ve m.9 talepleri için 24 saat hedefle. Bu yüzden telefonuna düşen bir nöbet (on-call) düzeni kur.
  - Trafik logları 1-2 yıl, bütünlükleri korunarak saklanır. Günlük hash zinciri ucuz bir yöntem.
  - **Mobil operatörler kullanıcıları ortak IP arkasında (CGNAT) topluyor, bu yüzden kaynak port loglanmalı.** Vercel'de bu mümkün değil: `x-forwarded-port` 443 döner. Cloudflare proxy arkasında da kaybolur. Path B'de kendi proxy'n (Traefik/Caddy) istemci portunu loglar. Avukat neyin yeterli olduğunu teyit etsin.
- **Haber telifi:** Başlık, kısa özet ve link. Tam metin ve fotoğraf yok (FSEK m.36). Kendi haberi yayımlamak 7418 yükümlülüklerini getirir.
- **İlan dolandırıcılığı ve EİDS:**
  - **Emlak ve Vasıta açma.** Taşıt ilanlarında 16.06.2025'ten, tüm konut satışlarında 01.02.2026'dan beri e-Devlet üzerinden yetki doğrulaması zorunlu.
  - Yasak kategoriler: ilaç, silah, canlı hayvan, alkol ve tütün.
  - Kapora ve IBAN uyarıları, ön moderasyon.
- **İŞKUR:** İş ilanlarında iletişim bilgisi üyeliksiz erişilebilir olmalı. Başvuru butonu ve CV toplama yok. Avukatla teyit et.
- **İYS / 6563:**
  - OTP ve işlemsel SMS ("talebin alındı") alıcı onayı gerektirmez.
  - Pazarlama SMS'i ve e-postası İYS üzerinden gönderilmeli ve onay alınmalı.
  - **Düzeltme:** Tacir ve esnafa ticari ileti **önceden onay almadan** gönderilebilir, ama gönderen İYS'ye kayıtlı olmalı ve ret talebine uymalı. Esnafın kişisel cep numarası için KVKK yine geçerli. Firma toplamayı elden yapmak yine de akıllıca.
  - Push bildirimi için şu an İYS kategorisi yok, yine de izin iste.
- **App Store:**
  - 1.2: filtreleme, şikayet, engelleme ve 24 saatte aksiyon.
  - 5.1.1(v): uygulama içi hesap silme.
  - 4.3(a): şehir başına ayrı uygulama yasak, **tek çok şehirli uygulama** yap.
  - 4.2: native değer göster (push, harita, kamera, widget).
  - İnceleme için demo hesabı hazırla.
- **Google Play:** **Organizasyon hesabı** aç (D-U-N-S gerekli). Kasım 2023'ten sonra açılan kişisel hesaplar yayından önce 12 test kullanıcısıyla 14 günlük kapalı test yapmak zorunda. Play App Signing'i aç, SHA-256 parmak izini `assetlinks.json`'a koy. Paket kimliğini baştan sabitle (ör. `com.<marka>.app`), Expo build'i aynı mağaza sayfasında TWA'nın yerine geçsin.

---

## 9. Maliyet tahmini

Kur yaklaşık ₺45/$. Türk sağlayıcı fiyatları tahmindir.

| Kalem | Prototip / pilot (aylık) | Canlı, 20-50k aylık kullanıcı (aylık) |
|---|---|---|
| Supabase | Pro $25 | $50-115 (Path A: compute ve depolama aşımı) |
| Vercel | Pro $20 (Hobby yalnız özel geliştirme sırasında) | $20-70 |
| Türkiye VPS (Path B) | — | 1-2 sunucu + Coolify + yedek: **$100-200 (doğrulanmadı)**. Supabase ve Vercel kalemlerinin yerine geçer. |
| NosyAPI | $6 | $13-20 |
| SMS | İleti Merkezi 10k = ₺879 (**yeni abonelik ilk ödeme fiyatı**, yenilemede pahalanabilir). Netgsm OTP 10k = ₺1.999 (yeni müşteri kampanyası). Pilot süresine yayınca yaklaşık ₺300-600/ay. | 20-40k SMS: yaklaşık ₺3-10k/ay. Firmalar native push'a geçtikçe düşer. |
| Harita, açık veri, AlAdhan, RSS, GitHub Actions, Cloudflare (Pages, Access, Turnstile, DNS), Sentry Developer, Umami, Telegram, Expo push | $0 | PMTiles R2 $0-5, Sentry Team $26 (isteğe bağlı) |
| Mobil | — | Apple $99/yıl (≈ $8/ay), EAS Free |
| Alan adı | ≈ $1-2 | ≈ $1-2 |
| **Toplam** | **≈ $52/ay + SMS** | **Path A ≈ $180-350/ay, Path B ≈ $200-400/ay, ikisine de SMS eklenir** |

**Tek seferlik:**
- Google Play $25 (D-U-N-S ücretsiz)
- KVKK / 5651 / İŞKUR / EİDS hukuk incelemesi yaklaşık ₺60-150k (tahmin, en büyük altyapı dışı kalem)
- QR afiş baskısı

**Dahil olmayanlar:** moderasyon için insan emeği (24 saat ve 4 saat hedefleri gerçek bir iş yükü), ödeme altyapısı komisyonları, eczane veya haber verisi için ücretli lisans istenirse onun bedeli.

---

## 10. Bu hafta yapılacaklar

1. **Repoyu OneDrive'dan çıkar:** `C:\dev\gbzsehir` altında `git init` yap, GitHub'da özel repo aç. Masaüstündeki klasörü kullanma.
2. **Şirket, marka ve alan adı kararını ver, alan adını al.** SMS başlığı, D-U-N-S, BTK bildirimi ve İYS için şirket evrakı gerekecek.
3. **SMS:** İleti Merkezi ve Netgsm hesaplarını aç, **SMS başlığı başvurusunu** hemen yap, onay günler sürüyor. İleti Merkezi panelinde günlük harcama uyarısı kur.
4. **İzin yazılarını gönder:**
   - Kocaeli Eczacı Odası (feed ya da izin)
   - KBB Ulaşım / Ulaşımpark (GTFS lisans teyidi ve GTFS-Realtime sorusu)
   - Diyanet Awqat Salah başvurusu
   - 3-4 yerel haber sitesi (başlık + link kullanımı)
   - Gebze Belediyesi (duyuru feed'i)
   - NosyAPI'ye veri kaynağı sorusu
5. **Avukat randevusu:** Sabit ücretli bir inceleme. Sorulacaklar: Path A mı B mi, BTK bildirimi, KEP, kaynak port loglama, İŞKUR, EİDS, aydınlatma metni.
6. **Google Play organizasyon hesabı için D-U-N-S başvurusu** yap.
7. **Veri doğrulama (1-2 gün):**
   - KBB API'den Eczaneler, Camiler, Tarihi Yapılar ve GTFS'i indir. Dosya formatını ve koordinat sistemini (EPSG:5254 mü?) kendin doğrula, proj4 dönüşümünü haritada kontrol et.
   - NosyAPI deneme kredisiyle Gebze nöbet listesini çek.
   - CollectAPI'nin gerçek kotasını öğren.
8. **İskelet:**
   - pnpm workspace, Next.js 16.3.3, Tailwind v4 + shadcn, alt sekme çubuğu, manifest, Serwist, iOS "Ana ekrana ekle" sayfası.
   - `output: 'standalone'`.
   - Vercel'e deploy.
9. **Supabase Pro projesi (Frankfurt), yalnız test verisiyle:**
   - Eklentiler, migration klasörü, `poi` tablosu ve `nearby_pois` RPC.
   - Windows'ta yerel `supabase start` Docker Desktop ve WSL2 istiyor. Zahmetliyse ikinci bir bulut projesini geliştirme ortamı olarak kullan.
10. **`packages/core`:** `dutyDay` (08:30, Europe/Istanbul), `trNormalize`, `geo`, `routes.ts`. eslint import sınırı kuralı. Vitest.
11. **Metin taslakları:** KVKK aydınlatma metni, kullanım koşulları, `/kaynaklar` atıf sayfası ("Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY)", "© OpenStreetMap contributors", OpenFreeMap).
12. **Tanıtım listesi:** Aşama 1 yayını için QR konulacak 10-20 eczane ve muhtarlığın listesini çıkar.

---

## 11. Sana sormam gereken açık sorular

1. **Şehir kesin Gebze mi?** Darıca, Çayırova ve Dilovası da ilk sürümde olsun mu? Sonraki şehir planlı mı?
2. **Kaç kişisiniz?** Tek geliştirici mi, ekip mi? Tasarımcı ve moderasyon yapacak biri var mı? Moderasyon için gerçekçi olarak kim 24 saat ve 4 saat içinde cevap verecek?
3. **Bütçe:** Aylık altyapı tavanın ve tek seferlik hukuk bütçen ne? Pilot sonrasında ne kadar SMS harcaması kabul edilebilir?
4. **Marka ve şirket:** Marka adı ve alan adı ne olacak? Hangi şirket adına (SMS başlığı, BTK, İYS, D-U-N-S, mağaza hesapları)?
5. **Barındırma tercihi:** Baştan Türkiye'de barındırma (Path B) için ek operasyon yükünü kabul eder misin, yoksa avukat görüşünü bekleyelim mi?
6. **React/TS deneyimi:** Ajansın React/TypeScript ile ne kadar tecrübesi var? Laravel/PHP ağırlıklıysa backend kararını birlikte yeniden tartabiliriz.
7. **Hizmetlerde tek yönlü not:** Firmaların ekleyebileceği en fazla 280 karakterlik "teklif notu" senin için mesajlaşma yasağıyla uyumlu mu? "Numaram gizli kalsın" seçeneği olsun mu?
8. **Emlak ve Vasıta:** İleride isteniyor mu? İstenirse EİDS entegrasyonu gerekir.
9. **Gelir modeli:** Firmalardan lead başı kredi mi, abonelik mi, vitrin ilan mı? Ne zaman?
10. **Belediye ilişkisi:** Gebze Belediyesi ya da KBB ile bir işbirliği mümkün mü? Veri feed'i ve tanıtım açısından çok şey değiştirir.
11. **Kendi haberin:** Ajansın kendi haberini üretmek istiyor mu? İsterse 7418 başvurusu ve editoryal sorumluluk gündeme gelir.
12. **Hedef ilk kategoriler:** Hizmet Al hangi 6-10 kategoriyle açılsın? Elden toplayabileceğin 20-30 esnaf var mı (GOSB, esnaf odası, çevren)?

---

### Düzeltilen hatalar
- **NosyAPI** günde 4 değil 7 kez yenileniyor (09:00, 10:00, 11:00, 13:00, 15:00, 17:00, 19:30). Çekim takvimi buna göre ayarlandı.
- **pg-boss v10 → 12.x.** v11, v10'dan otomatik geçiş yapmıyor.
- **@supabase/ssr çerezleri httpOnly değil.** Tarayıcı istemcisi okumak zorunda. Güvenliği CSP ve XSS önlemleriyle sağla.
- **sendBeacon** Authorization başlığı gönderemiyor. Yerine `fetch` + `keepalive` kullanıldı.
- Vercel'deki `x-forwarded-port` istemcinin değil sunucunun portu (443). CGNAT arkasında 5651 için yetmez.
- Google iş arama (JobPosting zengin sonucu) Türkiye'de sunulmuyor.
- "Aşama 1'de hiç kişisel veri yok" iddiası yanlış: IP adresleri ve koordinatlar da kişisel veri. Doğrusu "minimum veri".
- Geohash ile konumu kabalaştırmak KVKK aydınlatma yükümlülüğünü kaldırmaz.
- Google Maps SDK kullanımı ücretsiz ama API anahtarı, faturalı hesap ve Google atfı zorunlu.
- 5651'de 24 saat yalnız kullanıcı şikayetleri ve m.9 için. m.8/A kararlarında süre **4 saat**. BTK bildirimi "teyit edilecek" bir konu değil, zorunlu görünüyor.
- İş ilanında numarayı üyeliğe bağlamak İŞKUR muafiyetiyle çelişebilir.
- 6563: tacir ve esnafa ilk ticari ileti için önceden onay gerekmiyor. Ret hakkı tanınmalı ve gönderen İYS'ye kayıtlı olmalı.
- Next.js 16.3.3'te AVIF optimizasyonu kapalı.
- Supabase SMS hook'unun toplam süre bütçesi 5 saniye.
- MapLibre GL JS v6 sadece ESM ve WebGL2 destekliyor, 5.24'e sabitlemek doğru karar.

### Doğrulanmamış noktalar
- @serwist/turbopack'in kararlı sürüm numarası.
- CollectAPI'nin ücretsiz kotası.
- NosyAPI verisinin kaynağı ve yasallığı.
- Gaziantep EO'nun JSON feed'inin emsal olarak kullanılabileceği.
- KBB Eczaneler dosyasının formatı ve koordinat sistemi (araştırma "GeoJSON, EPSG:5254" dedi, bir jüri teyit edemedi).
- GTFS'teki saatlerin gerçek sefer saatleriyle uyuşup uyuşmadığı.
- M1 metronun açılıp açılmadığı.
- Türkiye'deki VPS ve CDN fiyatları.
- Hukuk ücreti tahmini.
- İleti Merkezi yenileme fiyatları.
- Kocaeli'de gündüz ve gece nöbet saatleri.
- iOS'ta konum izninin her oturumda tekrar sorulması.
- React Native geliştirici havuzunun Türkiye'de daha büyük olduğu.
- Kod paylaşım yüzdeleri (tahmin).